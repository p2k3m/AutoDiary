/// <reference lib="webworker" />
import { openDB } from 'idb';

declare const self: ServiceWorkerGlobalScope;

interface SyncManager {
  register(tag: string): Promise<void>;
}

interface SyncEvent extends Event {
  tag: string;
  waitUntil(promise: Promise<unknown>): void;
}

interface SyncRegistration extends ServiceWorkerRegistration {
  sync?: SyncManager;
}

const APP_SHELL_CACHE = 'app-shell-v1';
const ENTRY_CACHE = 'entry-cache-v1';
const QUEUE_DB = 's3-write-queue';
const ENTRY_DB = 'entry-cache';
const MAX_RETRY_ATTEMPTS = 3;
const entryDbPromise = openDB(ENTRY_DB, 1, {
  upgrade(db) {
    db.createObjectStore('entries');
  },
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      const assets: string[] = [];
      try {
        const res = await fetch('/index.html');
        const html = await res.text();
        const matches = html.match(/\/assets\/[^"']+\.(?:js|css)/g);
        if (matches) {
          assets.push(...matches);
        }
      } catch {
        // ignore failures to fetch index or parse assets
      }
      await cache.addAll(['/', '/index.html', '/manifest.json', ...new Set(assets)]);
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== APP_SHELL_CACHE && k !== ENTRY_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (
    req.method === 'GET' &&
    req.url.includes('amazonaws.com') &&
    /\/entries\/\d{4}\/\d{2}\/\d{2}\.json/.test(req.url)
  ) {
    event.respondWith(handleEntryRequest(req));
    return;
  }
  if (req.method === 'GET' && (req.mode === 'navigate' || req.destination === 'document')) {
    event.respondWith(
      caches.match(req).then((res) => {
        if (res) return res;
        return fetch(req)
          .then((response) => {
            const copy = response.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => cache.put(req, copy));
            return response;
          })
          .catch(() => caches.match('/index.html') as Promise<Response>);
      })
    );
    return;
  }

  if (
    req.method === 'GET' &&
    (req.destination === 'script' || req.destination === 'style')
  ) {
    event.respondWith(
      caches.match(req).then((res) => {
        if (res) return res;
        return fetch(req).then((response) => {
          const copy = response.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(req, copy));
          return response;
        });
      })
    );
    return;
  }

  if (
    req.url.includes('amazonaws.com') &&
    (req.method === 'PUT' ||
      req.method === 'DELETE' ||
      (req.method === 'POST' && req.url.includes('?uploadId=')))
  ) {
    event.respondWith(
      (async () => {
        const handleDelete = async () => {
          const ymd = extractYmd(req.url);
          if (ymd) {
            await (await entryDbPromise).delete('entries', ymd);
            const cache = await caches.open(ENTRY_CACHE);
            await cache.delete(req);
            const clients = await self.clients.matchAll();
            clients.forEach((c) =>
              c.postMessage({ type: 'entry-deleted', ymd })
            );
          }
        };

        try {
          const res = await fetch(req.clone());
          if (req.method === 'DELETE') {
            await handleDelete();
          }
          return res;
        } catch {
          if (req.method === 'DELETE') {
            await handleDelete();
          }
          const db = await openDB(QUEUE_DB, 1, {
            upgrade(db) {
              db.createObjectStore('requests', { autoIncrement: true });
            },
          });
          let body: ArrayBuffer | undefined;
          if (req.method === 'PUT' || req.method === 'POST') {
            body = await req.clone().arrayBuffer();
          }
          await db.add('requests', {
            url: req.url,
            method: req.method,
            headers: [...req.headers],
            body,
            attempts: 0,
          });
          const reg = self.registration as SyncRegistration;
          if (reg.sync) {
            await reg.sync.register('s3-sync');
          }
          return new Response(null, { status: 202 });
        }
      })()
    );
  }
});

async function handleEntryRequest(req: Request): Promise<Response> {
  const ymd = extractYmd(req.url);
  try {
    const res = await fetch(req);
    const copy = res.clone();
    caches.open(ENTRY_CACHE).then((cache) => cache.put(req, copy.clone()));
    if (ymd) {
      const body = await copy.text();
      await (await entryDbPromise).put('entries', body, ymd);
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    if (ymd) {
      const body = await (await entryDbPromise).get('entries', ymd);
      if (body) {
        return new Response(body, {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    return new Response(null, { status: 503 });
  }
}

function extractYmd(url: string): string | null {
  const m = url.match(/\/entries\/(\d{4})\/(\d{2})\/(\d{2})\.json/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

self.addEventListener('sync', (event) => {
  const syncEvent = event as SyncEvent;
  if (syncEvent.tag === 's3-sync') {
    syncEvent.waitUntil(
      (async () => {
        await replayQueue();
        const clients = await self.clients.matchAll();
        clients.forEach((c) => c.postMessage({ type: 's3-sync-complete' }));
      })()
    );
  }
});

async function replayQueue() {
  const db = await openDB(QUEUE_DB, 1);
  const tx = db.transaction('requests', 'readwrite');
  const store = tx.objectStore('requests');
  let cursor = await store.openCursor();
  while (cursor) {
    const { url, headers, body, method = 'PUT', attempts = 0 } = cursor.value as {
      url: string;
      headers: [string, string][];
      body?: ArrayBuffer;
      method?: string;
      attempts?: number;
    };
    try {
      await fetch(url, {
        method,
        headers: new Headers(headers),
        body,
      });
      await cursor.delete();
    } catch {
      const nextAttempts = attempts + 1;
      if (nextAttempts >= MAX_RETRY_ATTEMPTS) {
        await cursor.delete();
      } else {
        await cursor.update({
          url,
          headers,
          body,
          method,
          attempts: nextAttempts,
        });
      }
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  if ((await db.count('requests')) > 0) {
    const reg = self.registration as SyncRegistration;
    if (reg.sync) {
      await reg.sync.register('s3-sync');
    }
  }
}

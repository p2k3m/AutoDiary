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
const QUEUE_DB = 's3-write-queue';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) =>
      cache.addAll(['/', '/index.html', '/manifest.json'])
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== APP_SHELL_CACHE).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
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

  if (req.method === 'PUT' && req.url.includes('amazonaws.com')) {
    event.respondWith(
      fetch(req.clone()).catch(async () => {
        const db = await openDB(QUEUE_DB, 1, {
          upgrade(db) {
            db.createObjectStore('requests', { autoIncrement: true });
          },
        });
        const body = await req.clone().arrayBuffer();
        await db.add('requests', {
          url: req.url,
          headers: [...req.headers],
          body,
        });
        const reg = self.registration as SyncRegistration;
        if (reg.sync) {
          await reg.sync.register('s3-sync');
        }
        return new Response(null, { status: 202 });
      })
    );
  }
});

self.addEventListener('sync', (event) => {
  const syncEvent = event as SyncEvent;
  if (syncEvent.tag === 's3-sync') {
    syncEvent.waitUntil(replayQueue());
  }
});

async function replayQueue() {
  const db = await openDB(QUEUE_DB, 1);
  const tx = db.transaction('requests', 'readwrite');
  const store = tx.objectStore('requests');
  let cursor = await store.openCursor();
  while (cursor) {
    const { url, headers, body } = cursor.value as {
      url: string;
      headers: [string, string][];
      body: ArrayBuffer;
    };
    try {
      await fetch(url, {
        method: 'PUT',
        headers: new Headers(headers),
        body,
      });
      await cursor.delete();
    } catch {
      // network issue, stop processing
      break;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}

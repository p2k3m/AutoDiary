import { openDB } from 'idb';

const dbPromise = openDB('etag-cache', 1, {
  upgrade(db) {
    db.createObjectStore('etags');
  },
});

export async function getEtag(key: string): Promise<string | undefined> {
  return (await dbPromise).get('etags', key);
}

export async function setEtag(key: string, etag: string): Promise<void> {
  await (await dbPromise).put('etags', etag, key);
}

export async function clearEtag(key: string): Promise<void> {
  await (await dbPromise).delete('etags', key);
}


import { openDB } from 'idb';

const dbPromise = openDB('entry-cache', 1, {
  upgrade(db) {
    db.createObjectStore('entries');
  },
});

export async function cacheEntry(ymd: string, body: string): Promise<void> {
  await (await dbPromise).put('entries', body, ymd);
}

export async function getCachedEntry(ymd: string): Promise<string | undefined> {
  return (await dbPromise).get('entries', ymd);
}

export async function getCachedEntries(
  days: number
): Promise<{ ymd: string; text: string }[]> {
  const db = await dbPromise;
  const store = db.transaction('entries').objectStore('entries');
  const keys = await store.getAllKeys();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const results: { ymd: string; text: string }[] = [];
  for (const key of keys) {
    if (typeof key !== 'string') continue;
    const [yyyy, mm, dd] = key.split('-').map(Number);
    const d = new Date(yyyy, mm - 1, dd);
    if (d >= cutoff) {
      const text = (await store.get(key)) as string;
      results.push({ ymd: key, text });
    }
  }
  return results;
}

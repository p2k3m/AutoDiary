import { useEffect, useState } from 'react';
import Fuse from 'fuse.js';
import { getCachedEntries } from '../lib/entryCache';
import { displayDate } from '../lib/date';
import { Link } from 'react-router-dom';

const DEFAULT_DAYS = 30;

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<{ ymd: string; text: string }[]>([]);
  const [results, setResults] = useState<{ ymd: string; text: string }[]>([]);

  useEffect(() => {
    getCachedEntries(DEFAULT_DAYS).then((es) => {
      setEntries(es);
      setResults(es);
    });
  }, []);

  useEffect(() => {
    if (!query) {
      setResults(entries);
      return;
    }
    const fuse = new Fuse(entries, {
      keys: ['text', 'ymd'],
      threshold: 0.4,
    });
    const matches = new Set(fuse.search(query).map((r) => r.item.ymd));
    setResults(entries.filter((e) => matches.has(e.ymd)));
  }, [query, entries]);

  return (
    <div className="p-4">
      <input
        className="mb-4 w-full rounded border px-2 py-1 dark:bg-gray-800"
        placeholder="Search entries"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="space-y-4">
        {results.map((r) => (
          <li key={r.ymd}>
            <Link to={`/date/${r.ymd}`} className="underline">
              {displayDate(r.ymd)}
            </Link>
            <div className="whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">
              {r.text}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

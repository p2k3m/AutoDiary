import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Fuse from 'fuse.js';
import { getCachedEntries } from '../lib/entryCache';
import { displayDate } from '../lib/date';
import { useAuth } from '../state/useAuth';
import { ThemeButton } from './ThemeButton';

const DEFAULT_DAYS = 30;

export function Header() {
  const { logout } = useAuth();
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<{ ymd: string; text: string }[]>([]);
  const [results, setResults] = useState<{ ymd: string; text: string }[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    getCachedEntries(DEFAULT_DAYS).then((es) => {
      setEntries(es);
      setResults(es);
    });
  }, []);

  useEffect(() => {
    const refreshEntries = () => {
      void getCachedEntries(DEFAULT_DAYS).then((es) => setEntries(es));
    };
    window.addEventListener('entry-saved', refreshEntries);
    window.addEventListener('entry-deleted', refreshEntries);
    return () => {
      window.removeEventListener('entry-saved', refreshEntries);
      window.removeEventListener('entry-deleted', refreshEntries);
    };
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
    <header className="flex items-center justify-between p-4">
      <nav className="flex gap-4">
        <Link to="/calendar">Calendar</Link>
        <Link to="/search">Search</Link>
        <Link to="/weekly">Weekly Review</Link>
        <Link to="/connectors">Connectors</Link>
        <Link to="/settings">Settings</Link>
      </nav>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="search"
            aria-label="Search entries"
            className="rounded border px-2 py-1 dark:bg-gray-800"
            placeholder="Search entries"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && results.length > 0 && (
            <ul className="absolute right-0 mt-1 w-64 max-h-60 overflow-auto rounded border bg-white shadow dark:bg-gray-800">
              {results.slice(0, 10).map((r) => (
                <li key={r.ymd}>
                  <Link
                    to={`/date/${r.ymd}`}
                    className="block px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => setQuery('')}
                  >
                    {displayDate(r.ymd)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <ThemeButton />
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded px-2 py-1 hover:bg-gray-200 dark:hover:bg-gray-700"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            ☰
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-32 rounded border bg-white shadow dark:bg-gray-800">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
                className="block w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

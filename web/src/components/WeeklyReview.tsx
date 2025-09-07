import { useEffect, useState } from 'react';
import { getEntry, getWeekly, type WeeklyData } from '../lib/s3Client';
import { formatYmd } from '../lib/date';

interface HabitStat {
  name: string;
  done: number;
  total: number;
  streak: number;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7; // Monday as start of week
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getIsoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function WeeklyReview() {
  const [stats, setStats] = useState<HabitStat[]>([]);
  const [extra, setExtra] = useState<WeeklyData | null>(null);

  useEffect(() => {
    void (async () => {
      const today = new Date();
      const start = startOfWeek(today);
      const ymds: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        ymds.push(formatYmd(d));
      }

      const raw = await Promise.all(ymds.map((d) => getEntry(d)));
      const map = new Map<string, { done: number; total: number; streak: number }>();
      const streak = new Map<string, number>();

      for (let i = 0; i < raw.length; i++) {
        const entry = raw[i] ? JSON.parse(raw[i] as string) : {};
        const routines: { text: string; done: boolean }[] =
          entry.routineTicks ?? entry.routines ?? [];
        const todays = new Set<string>();
        routines.forEach((r) => {
          const s = map.get(r.text) ?? { done: 0, total: 0, streak: 0 };
          s.total += 1;
          if (r.done) {
            s.done += 1;
            const cur = (streak.get(r.text) ?? 0) + 1;
            streak.set(r.text, cur);
            s.streak = cur;
          } else {
            streak.set(r.text, 0);
            s.streak = 0;
          }
          map.set(r.text, s);
          todays.add(r.text);
        });
        // reset streak for habits missing today
        for (const name of streak.keys()) {
          if (!todays.has(name)) {
            streak.set(name, 0);
            const s = map.get(name);
            if (s) s.streak = 0;
          }
        }
      }

      setStats(Array.from(map.entries()).map(([name, s]) => ({ name, ...s })));

      const yyyy = start.getFullYear().toString();
      const ww = getIsoWeek(start).toString().padStart(2, '0');
      try {
        const data = await getWeekly(yyyy, ww);
        if (data) setExtra(data);
      } catch (err) {
        console.error('Failed to load weekly data', err);
      }
    })();
  }, []);

  const improvements = stats
    .filter((h) => h.total > 0 && h.done / h.total < 0.6)
    .map((h) => `Focus more on ${h.name} (only ${h.done}/${h.total}).`);

  return (
    <div>
      <h2 className="mb-2 text-xl font-bold">Weekly Review</h2>
      <ul className="mb-4 space-y-4">
        {stats.map((h) => {
          const pct = h.total ? (h.done / h.total) * 100 : 0;
          return (
            <li key={h.name}>
              <div className="flex justify-between">
                <span>{h.name}</span>
                <span>
                  {h.done}/{h.total}
                </span>
              </div>
              <div className="mt-1 h-2 w-full rounded bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded bg-blue-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1">
                <span className="rounded bg-green-100 px-2 text-sm dark:bg-green-800">
                  {h.streak}d streak
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {extra?.summary && (
        <div className="mb-4">
          <h3 className="font-semibold">AI Summary</h3>
          <p>{extra.summary}</p>
        </div>
      )}
      {extra?.digests && extra.digests.length > 0 && (
        <div className="mb-4">
          <h3 className="font-semibold">Connector Digests</h3>
          <ul className="list-disc pl-4">
            {extra.digests.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}
      {improvements.length > 0 && (
        <div>
          <h3 className="font-semibold">How to improve</h3>
          <ul className="list-disc pl-4">
            {improvements.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


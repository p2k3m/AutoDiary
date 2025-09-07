import { useEffect, useState } from 'react';
import { getEntry, getWeekly, type WeeklyData } from '../lib/s3Client';
import { formatYmd } from '../lib/date';

interface HabitStat {
  name: string;
  done: number;
  total: number;
  streak: number;
  misses: number[]; // consecutive misses per weekday
  days: boolean[]; // completion status for each weekday
  prevDone: number;
  prevTotal: number;
}

interface Tip {
  tip: string;
  count: number;
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
  const [missTips, setMissTips] = useState<Tip[]>([]);

  useEffect(() => {
    void (async () => {
      const today = new Date();
      const start = startOfWeek(today);
      const prevStart = new Date(start);
      prevStart.setDate(start.getDate() - 7);
      const ymds: string[] = [];
      const prevYmds: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        ymds.push(formatYmd(d));
        const pd = new Date(prevStart);
        pd.setDate(prevStart.getDate() + i);
        prevYmds.push(formatYmd(pd));
      }

      const [raw, prevRaw] = await Promise.all([
        Promise.all(ymds.map((d) => getEntry(d))),
        Promise.all(prevYmds.map((d) => getEntry(d))),
      ]);
      const map = new Map<string, {
        done: number;
        total: number;
        streak: number;
        misses: number[];
        days: boolean[];
      }>();
      const prevMap = new Map<string, { done: number; total: number }>();
      const streak = new Map<string, number>();
      const missesThisWeek = new Map<string, number[]>();

      for (let i = 0; i < raw.length; i++) {
        const entry = raw[i] ? JSON.parse(raw[i] as string) : {};
        const routines: { text: string; done: boolean }[] =
          entry.routineTicks ?? entry.routines ?? [];
        const todays = new Set<string>();
        routines.forEach((r) => {
          const s =
            map.get(r.text) ?? {
              done: 0,
              total: 0,
              streak: 0,
              misses: Array(7).fill(0),
              days: Array(7).fill(false),
            };
          s.total += 1;
          s.days[i] = r.done;
          if (r.done) {
            s.done += 1;
            const cur = (streak.get(r.text) ?? 0) + 1;
            streak.set(r.text, cur);
            s.streak = cur;
            s.misses[i] = 0;
          } else {
            streak.set(r.text, 0);
            s.streak = 0;
            s.misses[i] = (s.misses[i] ?? 0) + 1;
            const arr = missesThisWeek.get(r.text) ?? [];
            arr.push(i);
            missesThisWeek.set(r.text, arr);
          }
          map.set(r.text, s);
          todays.add(r.text);
        });
        // reset streak for habits missing today
        for (const name of streak.keys()) {
          if (!todays.has(name)) {
            streak.set(name, 0);
            const s = map.get(name);
            if (s) {
              s.streak = 0;
              s.days[i] = false;
            }
          }
        }
      }

      for (let i = 0; i < prevRaw.length; i++) {
        const entry = prevRaw[i] ? JSON.parse(prevRaw[i] as string) : {};
        const routines: { text: string; done: boolean }[] =
          entry.routineTicks ?? entry.routines ?? [];
        routines.forEach((r) => {
          const s = prevMap.get(r.text) ?? { done: 0, total: 0 };
          s.total += 1;
          if (r.done) s.done += 1;
          prevMap.set(r.text, s);
        });
      }

      const weekdayNames = [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ];
      const suggestions: Tip[] = [];
      for (const [habit, days] of missesThisWeek.entries()) {
        for (const day of days) {
          let count = 1;
          const checkDate = new Date(start);
          checkDate.setDate(start.getDate() + day);
          while (count < 5) {
            checkDate.setDate(checkDate.getDate() - 7);
            const prev = await getEntry(formatYmd(checkDate));
            if (!prev) break;
            const e = JSON.parse(prev);
            const prevRoutines: { text: string; done: boolean }[] =
              e.routineTicks ?? e.routines ?? [];
            const found = prevRoutines.find((r) => r.text === habit);
            if (found && !found.done) {
              count += 1;
            } else {
              break;
            }
          }
          const s = map.get(habit);
          if (s) s.misses[day] = count;
          if (count >= 5) {
            suggestions.push({
              tip: `${habit} has been missed ${count} ${weekdayNames[day]}s in a row. Try moving to mornings.`,
              count,
            });
          }
        }
      }

      setStats(
        Array.from(map.entries()).map(([name, s]) => ({
          name,
          ...s,
          prevDone: prevMap.get(name)?.done ?? 0,
          prevTotal: prevMap.get(name)?.total ?? 0,
        }))
      );
      setMissTips(suggestions);

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

  const improvementCandidates = [
    ...stats
      .filter((h) => h.total > 0 && h.done / h.total < 0.6)
      .map((h) => ({
        tip: `Focus more on ${h.name} (only ${h.done}/${h.total}).`,
        completion: h.done / h.total,
        missCount: 0,
      })),
    ...missTips.map((t) => ({
      tip: t.tip,
      completion: 1,
      missCount: t.count,
    })),
  ];

  const improvements = improvementCandidates
    .sort((a, b) => {
      if (b.missCount !== a.missCount) return b.missCount - a.missCount;
      return a.completion - b.completion;
    })
    .slice(0, 3)
    .map((c) => c.tip);

  return (
    <div>
      <h2 className="mb-2 text-xl font-bold">Weekly Review</h2>
      <ul className="mb-4 space-y-4">
        {stats.map((h) => {
          const pct = h.total ? (h.done / h.total) * 100 : 0;
          const prevPct = h.prevTotal ? (h.prevDone / h.prevTotal) * 100 : 0;
          const diff = pct - prevPct;
          const diffLabel = `${Math.abs(diff).toFixed(0)}%`;
          const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '▶';
          const diffColor = diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-500';
          return (
            <li key={h.name}>
              <div className="flex justify-between">
                <span>{h.name}</span>
                <span>
                  {h.done}/{h.total}
                  {h.prevTotal > 0 && (
                    <span className={`ml-2 text-sm ${diffColor}`}>
                      {arrow} {diffLabel}
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {h.days.map((d, idx) => (
                  <span
                    key={idx}
                    className={`flex h-6 w-6 items-center justify-center rounded text-sm ${
                      d
                        ? 'bg-green-200 text-green-800 dark:bg-green-700 dark:text-green-100'
                        : 'bg-red-200 text-red-800 dark:bg-red-700 dark:text-red-100'
                    }`}
                  >
                    {d ? '✓' : '✗'}
                  </span>
                ))}
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
      {extra?.aiSummary && (
        <div className="mb-4">
          <h3 className="font-semibold">AI Summary</h3>
          <p>{extra.aiSummary}</p>
        </div>
      )}
      {extra?.connectorsDigest && (
        <div className="mb-4">
          <h3 className="font-semibold">Connector Digests</h3>
          <ul className="list-disc pl-4">
            <li>Meetings hours: {extra.connectorsDigest.meetingsHours}</li>
            {extra.connectorsDigest.topContacts.length > 0 && (
              <li>
                Top contacts: {extra.connectorsDigest.topContacts.join(', ')}
              </li>
            )}
            <li>Photos count: {extra.connectorsDigest.photosCount}</li>
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


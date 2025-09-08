import { useMemo } from 'react';

interface CalendarGridProps {
  year: number;
  month: number; // 1-based month
  entries: Record<string, number>; // map of day -> ink used/count
  today?: string; // 'YYYY-MM-DD'
  onSelect?: (ymd: string) => void;
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

export function CalendarGrid({ year, month, entries, today, onSelect }: CalendarGridProps) {
  const cells = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const start = firstDay.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < start; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month]);

  const monthStr = pad(month);
  const maxCount = useMemo(() => {
    const values = Object.values(entries);
    return values.length ? Math.max(...values) : 0;
  }, [entries]);

  return (
    <div className="grid grid-cols-7 gap-2">
      {cells.map((day, idx) => {
        if (!day) {
          return <div key={idx} />;
        }
        const dayStr = pad(day);
        const ymd = `${year}-${monthStr}-${dayStr}`;
        const isToday = today === ymd;
        const count = entries[dayStr] ?? 0;
        const ratio = maxCount ? count / maxCount : 0;
        return (
          <button
            key={idx}
            onClick={() => onSelect?.(ymd)}
            className={`flex h-14 flex-col items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              isToday ? 'bg-blue-200 dark:bg-blue-800' : ''
            }`}
          >
            <span>{day}</span>
            {count > 0 && (
              <div className="mt-1 flex w-full justify-center">
                {count <= 3 ? (
                  <div className="flex gap-0.5">
                    {Array.from({ length: count }).map((_, i) => (
                      <span key={i} className="h-1 w-1 rounded-full bg-blue-500" />
                    ))}
                  </div>
                ) : (
                  <span
                    className="h-1 rounded-full bg-blue-500"
                    style={{ width: `${ratio * 100}%`, opacity: 0.3 + 0.7 * ratio }}
                  />
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

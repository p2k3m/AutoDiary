import { useMemo } from 'react';

interface CalendarGridProps {
  year: number;
  month: number; // 1-based month
  entries: string[]; // array of days like '01', '02'
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

  return (
    <div className="grid grid-cols-7 gap-2">
      {cells.map((day, idx) => {
        if (!day) {
          return <div key={idx} />;
        }
        const dayStr = pad(day);
        const ymd = `${year}-${monthStr}-${dayStr}`;
        const isToday = today === ymd;
        const hasEntry = entries.includes(dayStr);
        return (
          <button
            key={idx}
            onClick={() => onSelect?.(ymd)}
            className={`flex h-14 flex-col items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              isToday ? 'bg-blue-200 dark:bg-blue-800' : ''
            }`}
          >
            <span>{day}</span>
            {hasEntry && <span className="mt-1 h-1 w-1 rounded-full bg-blue-500" />}
          </button>
        );
      })}
    </div>
  );
}

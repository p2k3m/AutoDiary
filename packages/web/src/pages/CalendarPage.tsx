import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarGrid } from '../components/CalendarGrid';
import { listMonth, getEntry } from '../lib/s3Client';
import { useDiaryStore } from '../state/useDiaryStore';

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

export default function CalendarPage() {
  const { yyyy, mm } = useParams<{ yyyy?: string; mm?: string }>();
  const today = new Date();
  const year = yyyy ? parseInt(yyyy, 10) : today.getFullYear();
  const month = mm ? parseInt(mm, 10) : today.getMonth() + 1;
  const [entries, setEntries] = useState<Record<string, number>>({});
  const navigate = useNavigate();
  const setCurrentDate = useDiaryStore((s) => s.setCurrentDate);
  const loadEntry = useDiaryStore((s) => s.loadEntry);

  useEffect(() => {
    listMonth(String(year), pad(month))
      .then(async (days) => {
        const pairs = await Promise.all(
          days.map(async (d) => {
            const ymd = `${year}-${pad(month)}-${d}`;
            try {
              const raw = await getEntry(ymd);
              if (raw) {
                const parsed = JSON.parse(raw) as { inkUsed?: number; text?: string };
                const ink = parsed.inkUsed ?? parsed.text?.length ?? 0;
                return [d, ink] as [string, number];
              }
            } catch {
              // ignore
            }
            return [d, 0] as [string, number];
          })
        );
        setEntries(Object.fromEntries(pairs));
      })
      .catch(() => setEntries({}));
  }, [year, month]);

  const todayYmd = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  return (
    <div className="paper-page p-4">
      <CalendarGrid
        year={year}
        month={month}
        entries={entries}
        today={todayYmd}
        onSelect={(ymd) => {
          setCurrentDate(ymd);
          void loadEntry(ymd);
          navigate(`/date/${ymd}`);
        }}
      />
    </div>
  );
}

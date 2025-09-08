import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarGrid } from '../components/CalendarGrid';
import { listMonth } from '../lib/s3Client';
import { useDiaryStore } from '../state/useDiaryStore';

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

export default function CalendarPage() {
  const { yyyy, mm } = useParams<{ yyyy?: string; mm?: string }>();
  const today = new Date();
  const year = yyyy ? parseInt(yyyy, 10) : today.getFullYear();
  const month = mm ? parseInt(mm, 10) : today.getMonth() + 1;
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const navigate = useNavigate();
  const setCurrentDate = useDiaryStore((s) => s.setCurrentDate);
  const loadEntry = useDiaryStore((s) => s.loadEntry);

  useEffect(() => {
    listMonth(String(year), pad(month))
      .then((days) => {
        const counts: Record<string, number> = {};
        days.forEach((d) => {
          counts[d] = (counts[d] ?? 0) + 1;
        });
        setEntryCounts(counts);
      })
      .catch(() => setEntryCounts({}));
  }, [year, month]);

  const todayYmd = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  return (
    <div className="paper-page p-4">
      <CalendarGrid
        year={year}
        month={month}
        entryCounts={entryCounts}
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

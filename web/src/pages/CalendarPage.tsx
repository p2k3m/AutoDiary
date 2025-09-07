import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarGrid } from '../components/CalendarGrid';
import { listMonth } from '../lib/s3Client';

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

export default function CalendarPage() {
  const { yyyy, mm } = useParams<{ yyyy?: string; mm?: string }>();
  const today = new Date();
  const year = yyyy ? parseInt(yyyy, 10) : today.getFullYear();
  const month = mm ? parseInt(mm, 10) : today.getMonth() + 1;
  const [entries, setEntries] = useState<string[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    listMonth(String(year), pad(month)).then(setEntries).catch(() => setEntries([]));
  }, [year, month]);

  const todayYmd = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  return (
    <div className="paper-page p-4">
      <CalendarGrid
        year={year}
        month={month}
        entries={entries}
        today={todayYmd}
        onSelect={(ymd) => navigate(`/date/${ymd}`)}
      />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarGrid } from '../components/CalendarGrid';
import { listMonth } from '../lib/s3Client';
import { downloadMonthJSON, downloadMonthMarkdown } from '../lib/export';
import { useDiaryStore } from '../state/useDiaryStore';

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
  const setCurrentDate = useDiaryStore((s) => s.setCurrentDate);
  const loadEntry = useDiaryStore((s) => s.loadEntry);

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
        onSelect={(ymd) => {
          setCurrentDate(ymd);
          void loadEntry(ymd);
          navigate(`/date/${ymd}`);
        }}
      />
      <div className="mt-4 flex gap-4">
        <button
          className="rounded bg-blue-500 px-2 py-1 text-white"
          onClick={() =>
            downloadMonthJSON(String(year), pad(month)).catch((err) =>
              console.error('export json failed', err)
            )
          }
        >
          Export JSON
        </button>
        <button
          className="rounded bg-green-500 px-2 py-1 text-white"
          onClick={() =>
            downloadMonthMarkdown(String(year), pad(month)).catch((err) =>
              console.error('export markdown failed', err)
            )
          }
        >
          Export Markdown
        </button>
      </div>
    </div>
  );
}

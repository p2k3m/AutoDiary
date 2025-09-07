import { useNavigate, useParams } from 'react-router-dom';

function formatYmd(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function DatePage() {
  const { ymd } = useParams<{ ymd: string }>();
  const navigate = useNavigate();

  const today = new Date();
  const todayYmd = formatYmd(today);
  const current = ymd ? new Date(ymd) : today;

  const handleNext = () => {
    if (ymd && ymd !== todayYmd) {
      navigate(`/date/${todayYmd}`);
    } else {
      const next = new Date(current);
      next.setDate(current.getDate() + 1);
      navigate(`/date/${formatYmd(next)}`);
    }
  };

  return (
    <div className="paper-page p-4">
      <div className="mb-4">Day page placeholder for {ymd}</div>
      <button
        className="rounded bg-blue-500 px-2 py-1 text-white"
        onClick={handleNext}
      >
        Next
      </button>
    </div>
  );
}

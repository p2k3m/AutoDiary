import { useNavigate, useParams } from 'react-router-dom';
import { useCallback, useState } from 'react';
import { displayDate, formatYmd, parseYmd } from '../lib/date';
import {
  getDailyWeather,
  getLocation,
  reverseGeocode,
  type Location,
  type Weather,
} from '../lib/weather';
import { InkGauge } from '../components/InkGauge';
import { RoutineBar, type RoutineItem } from '../components/RoutineBar';
import { Attachments } from '../components/Attachments';

export default function DatePage() {
  const { ymd } = useParams<{ ymd: string }>();
  const navigate = useNavigate();

  const today = new Date();
  const todayYmd = formatYmd(today);
  const current = ymd ? parseYmd(ymd) : today;
  const ymdStr = ymd || todayYmd;

  const [text, setText] = useState('');
  const [routines, setRoutines] = useState<RoutineItem[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [location, setLocation] = useState<Location | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [fetched, setFetched] = useState(false);

  const handleNext = () => {
    if (ymd && ymd !== todayYmd) {
      navigate(`/date/${todayYmd}`);
    } else {
      const next = new Date(current);
      next.setDate(current.getDate() + 1);
      navigate(`/date/${formatYmd(next)}`);
    }
  };

  const fetchMeta = useCallback(async () => {
    const loc = await getLocation();
    if (!loc) return;
    const city = await reverseGeocode(loc.lat, loc.lon);
    const w = await getDailyWeather(loc.lat, loc.lon, ymdStr);
    setLocation({ ...loc, city });
    if (w) setWeather(w);
  }, [ymdStr]);

  const handleMainChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const mainVal = e.target.value;
    const over = text.split('\n').slice(28).join('\n');
    const newText = over ? `${mainVal}\n${over}` : mainVal;
    setText(newText);
    if (!fetched && newText.trim() !== '') {
      setFetched(true);
      fetchMeta();
    }
  };

  const handleOverflowChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const overVal = e.target.value;
    const mainPart = text.split('\n').slice(0, 28).join('\n');
    const newText = overVal ? `${mainPart}\n${overVal}` : mainPart;
    setText(newText);
    if (!fetched && newText.trim() !== '') {
      setFetched(true);
      fetchMeta();
    }
  };

  const lines = text.split('\n');
  const mainText = lines.slice(0, 28).join('\n');
  const overflowText = lines.length > 28 ? lines.slice(28).join('\n') : '';

  return (
    <div className="paper-page p-4">
      <header className="mb-4">
        <div className="text-xl font-bold">{displayDate(ymdStr)}</div>
        <div className="flex items-center gap-2 text-sm">
          {location?.city && <span>{location.city}</span>}
          {weather && (
            <span>
              {weather.desc} {weather.tmin}–{weather.tmax}°C
            </span>
          )}
          <button
            className="text-xs underline"
            onClick={fetchMeta}
            type="button"
          >
            Refresh
          </button>
        </div>
      </header>

      <RoutineBar items={routines} onChange={setRoutines} />

      <textarea
        rows={28}
        className="w-full resize-none bg-transparent outline-none"
        value={mainText}
        onChange={handleMainChange}
      />

      <details className="mt-2" open={Boolean(overflowText)}>
        <summary>Overflow</summary>
        <textarea
          className="mt-2 w-full resize-none bg-transparent outline-none"
          value={overflowText}
          onChange={handleOverflowChange}
          rows={Math.max(overflowText.split('\n').length, 1)}
        />
      </details>

      <div className="my-2">
        <InkGauge used={Math.min(lines.length, 28)} total={28} />
      </div>

      <Attachments files={files} onChange={setFiles} />

      <button
        className="mt-4 rounded bg-blue-500 px-2 py-1 text-white"
        onClick={handleNext}
      >
        Next
      </button>
    </div>
  );
}

import { useNavigate, useParams } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { displayDate, formatYmd, parseYmd } from '../lib/date';
import {
  refreshWeather,
  type Location,
  type Weather,
} from '../lib/weather';
import { InkGauge } from '../components/InkGauge';
import { RoutineBar, type RoutineItem } from '../components/RoutineBar';
import { Attachments } from '../components/Attachments';
import { useDiaryStore } from '../state/useDiaryStore';

const INK_TOTAL = 1000;

export default function DatePage() {
  const { ymd } = useParams<{ ymd: string }>();
  const navigate = useNavigate();

  const today = new Date();
  const todayYmd = formatYmd(today);

  const currentDate = useDiaryStore((s) => s.currentDate);
  const setCurrentDate = useDiaryStore((s) => s.setCurrentDate);
  const loadEntryFromStore = useDiaryStore((s) => s.loadEntry);
  const saveEntryToStore = useDiaryStore((s) => s.saveEntry);
  const updateEntry = useDiaryStore((s) => s.updateEntry);

  useEffect(() => {
    if (ymd) setCurrentDate(ymd);
  }, [ymd, setCurrentDate]);

  const ymdStr = currentDate;

  const [text, setText] = useState('');
  const [routineTicks, setRoutineTicks] = useState<RoutineItem[]>([]);
  const [attachments, setAttachments] = useState<{
    name: string;
    uuid: string;
  }[]>([]);
  const [location, setLocation] = useState<Location | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [fetched, setFetched] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const inkUsed = text.length;

  const loadEntry = useCallback(async () => {
    await loadEntryFromStore(ymdStr);
    const entry = useDiaryStore.getState().entries[ymdStr];
    setText(entry?.text ?? '');
    setRoutineTicks(entry?.routineTicks ?? []);
    setAttachments(entry?.attachments ?? []);
    setLocation(entry?.loc ?? null);
    setWeather(entry?.weather ?? null);
    setLoaded(true);
  }, [ymdStr, loadEntryFromStore]);

  useEffect(() => {
    setLoaded(false);
    void loadEntry();
  }, [loadEntry]);

  const handleNext = () => {
    void (async () => {
      await saveEntry();
      if (ymdStr !== todayYmd) {
        setCurrentDate(todayYmd);
        navigate(`/date/${todayYmd}`);
      } else {
        const next = parseYmd(ymdStr);
        next.setDate(next.getDate() + 1);
        const nextYmd = formatYmd(next);
        setCurrentDate(nextYmd);
        navigate(`/date/${nextYmd}`);
      }
    })();
  };

  const fetchMeta = useCallback(
    async (force = false) => {
      const current = useDiaryStore.getState().entries[ymdStr] || {};
      if (
        !force &&
        current.loc?.city &&
        current.weather?.desc &&
        typeof current.loc.city === 'string' &&
        typeof current.weather.desc === 'string'
      ) {
        setLocation(current.loc);
        setWeather(current.weather);
        return;
      }
      const res = await refreshWeather(current, ymdStr);
      if (!res) return;
      setLocation(res.location);
      setWeather(res.weather);
      updateEntry(ymdStr, { loc: res.location, weather: res.weather });
    },
    [ymdStr, updateEntry]
  );

  const saveEntry = useCallback(async () => {
    await saveEntryToStore(ymdStr);
  }, [saveEntryToStore, ymdStr]);

  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveEntry();
    }, 1000);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [text, routineTicks, attachments, location, weather, inkUsed, loaded, saveEntry]);

  useEffect(() => {
    return () => {
      void saveEntry();
    };
  }, [saveEntry]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data && event.data.type === 's3-sync-complete') {
        void loadEntry();
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, [loadEntry]);

  const handleMainChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const mainVal = e.target.value;
    const over = text.split('\n').slice(28).join('\n');
    const newText = over ? `${mainVal}\n${over}` : mainVal;
    setText(newText);
    updateEntry(ymdStr, { text: newText, inkUsed: newText.length });
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
    updateEntry(ymdStr, { text: newText, inkUsed: newText.length });
    if (!fetched && newText.trim() !== '') {
      setFetched(true);
      fetchMeta();
    }
  };

  const lines = text.split('\n');
  const mainText = lines.slice(0, 28).join('\n');
  const overflowText = lines.length > 28 ? lines.slice(28).join('\n') : '';

  return (
    <div className="paper-page relative p-4">
      <InkGauge used={inkUsed} total={INK_TOTAL} className="absolute right-2 top-2 w-20" />
      <header className="mb-4">
        <div className="flex items-center gap-2 text-xl font-bold">
          <span>{displayDate(ymdStr)}</span>
          {location?.city && <span>• {location.city}</span>}
          {weather && <span>• {weather.tmax}°C, {weather.desc}</span>}
          <button
            className="text-xs font-normal underline"
            onClick={() => fetchMeta(true)}
            type="button"
          >
            Refresh
          </button>
        </div>
      </header>

      <RoutineBar
        items={routineTicks}
        onChange={(items) => {
          setRoutineTicks(items);
          updateEntry(ymdStr, { routineTicks: items });
        }}
        editable={ymdStr === todayYmd}
      />

      <textarea
        rows={28}
        className="handwriting w-full resize-none bg-transparent outline-none"
        value={mainText}
        onChange={handleMainChange}
      />

      <details
        className="mt-2 rounded border border-gray-300 bg-gray-50 p-2"
        open={Boolean(overflowText)}
      >
        <summary className="cursor-pointer select-none font-medium">
          Back of Page
        </summary>
        <textarea
          className="handwriting mt-2 w-full resize-none bg-transparent outline-none"
          value={overflowText}
          onChange={handleOverflowChange}
          rows={Math.max(overflowText.split('\n').length, 1)}
        />
      </details>

      <Attachments
        ymd={ymdStr}
        existing={attachments}
        onExistingChange={(atts) => {
          setAttachments(atts);
          updateEntry(ymdStr, { attachments: atts });
        }}
      />

      <button
        className="mt-4 rounded bg-blue-500 px-2 py-1 text-white"
        onClick={handleNext}
      >
        Next
      </button>
    </div>
  );
}

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
import { getEntry, putEntry, getSettings } from '../lib/s3Client';

export default function DatePage() {
  const { ymd } = useParams<{ ymd: string }>();
  const navigate = useNavigate();

  const today = new Date();
  const todayYmd = formatYmd(today);
  const current = ymd ? parseYmd(ymd) : today;
  const ymdStr = ymd || todayYmd;

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
  const entryRef = useRef<Record<string, unknown>>({});

  const loadEntry = useCallback(async () => {
    try {
      const raw = await getEntry(ymdStr);
      if (raw) {
        const entry = JSON.parse(raw);
        entryRef.current = entry;
        setText(entry.text ?? '');
        setRoutineTicks(entry.routineTicks ?? entry.routines ?? []);
        if (entry.city) {
          setLocation({ lat: 0, lon: 0, city: entry.city as string });
        }
        if (entry.desc) {
          setWeather({
            tmax: entry.tmax as number,
            tmin: entry.tmin as number,
            desc: entry.desc as string,
          });
        }
        setAttachments(entry.attachments ?? []);
      } else {
        const settings = await getSettings();
        const ticks =
          settings?.routineTemplate?.map((r) => ({ text: r.text, done: false })) ?? [];
        setRoutineTicks(ticks);
        entryRef.current = { routineTicks: ticks };
      }
    } catch (err) {
      console.error('Failed to load entry', err);
    } finally {
      setLoaded(true);
    }
  }, [ymdStr]);

  useEffect(() => {
    void loadEntry();
  }, [loadEntry]);

  const handleNext = () => {
    void (async () => {
      await saveEntry();
      if (ymd && ymd !== todayYmd) {
        navigate(`/date/${todayYmd}`);
      } else {
        const next = new Date(current);
        next.setDate(current.getDate() + 1);
        navigate(`/date/${formatYmd(next)}`);
      }
    })();
  };

  const fetchMeta = useCallback(
    async (force = false) => {
      if (
        !force &&
        entryRef.current.city &&
        entryRef.current.desc &&
        typeof entryRef.current.city === 'string' &&
        typeof entryRef.current.desc === 'string'
      ) {
        setLocation({ lat: 0, lon: 0, city: entryRef.current.city as string });
        setWeather({
          tmax: entryRef.current.tmax as number,
          tmin: entryRef.current.tmin as number,
          desc: entryRef.current.desc as string,
        });
        return;
      }
      const res = await refreshWeather(entryRef.current, ymdStr);
      if (!res) return;
      setLocation(res.location);
      setWeather(res.weather);
    },
    [ymdStr]
  );

  const saveEntry = useCallback(async () => {
    const entry = {
      text,
      routineTicks,
      city: location?.city,
      desc: weather?.desc,
      tmax: weather?.tmax,
      tmin: weather?.tmin,
      attachments,
    };
    entryRef.current = entry;
    try {
      await putEntry(ymdStr, JSON.stringify(entry));
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status === 412) {
        try {
          const latestRaw = await getEntry(ymdStr);
          const latest = latestRaw ? JSON.parse(latestRaw) : {};
          const remoteText = (latest as { text?: string }).text ?? '';
          const localText = entry.text ?? '';
          let resolved = entry;
          if (remoteText !== localText) {
            const merge = window.confirm(
              `Entry has changed elsewhere.\n\nRemote:\n${remoteText}\n\nLocal:\n${localText}\n\nPress OK to merge or Cancel to overwrite.`
            );
            resolved = merge
              ? { ...latest, ...entry, text: `${remoteText}\n${localText}` }
              : { ...latest, ...entry };
          } else {
            resolved = { ...latest, ...entry };
          }
          entryRef.current = resolved;
          setText(resolved.text ?? '');
          await putEntry(ymdStr, JSON.stringify(resolved));
        } catch (e) {
          console.error('Failed to resolve entry conflict', e);
        }
      } else {
        console.error('Failed to save entry', err);
      }
    }
  }, [attachments, text, routineTicks, location, weather, ymdStr]);

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
  }, [text, routineTicks, attachments, location, weather, loaded, saveEntry]);

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
            onClick={() => fetchMeta(true)}
            type="button"
          >
            Refresh
          </button>
        </div>
      </header>

      <RoutineBar
        items={routineTicks}
        onChange={setRoutineTicks}
        editable={ymdStr === todayYmd}
      />

      <textarea
        rows={28}
        className="handwriting w-full resize-none bg-transparent outline-none"
        value={mainText}
        onChange={handleMainChange}
      />

      <details className="mt-2" open={Boolean(overflowText)}>
        <summary>Overflow</summary>
        <textarea
          className="handwriting mt-2 w-full resize-none bg-transparent outline-none"
          value={overflowText}
          onChange={handleOverflowChange}
          rows={Math.max(overflowText.split('\n').length, 1)}
        />
      </details>

      <div className="my-2">
        <InkGauge used={Math.min(lines.length, 28)} total={28} />
      </div>

      <Attachments
        ymd={ymdStr}
        existing={attachments}
        onExistingChange={setAttachments}
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

import { create } from 'zustand';
import {
  getEntry as s3GetEntry,
  putEntry as s3PutEntry,
  getSettings as s3GetSettings,
  type Settings,
} from '../lib/s3Client';
import { encrypt as cryptoEncrypt, decrypt as cryptoDecrypt } from '../lib/crypto';
import { formatYmd } from '../lib/date';
import type { RoutineItem } from '../components/RoutineBar';

interface DiaryEntry {
  text: string;
  routineTicks: RoutineItem[];
  attachments: { name: string; uuid: string; ext: string }[];
  loc?: { lat?: number; lon?: number; city?: string };
  weather?: { tmax?: number; tmin?: number; desc?: string };
  inkUsed: number;
}

interface DiaryState {
  currentDate: string;
  entries: Record<string, DiaryEntry>;
  setCurrentDate: (ymd: string) => void;
  loadEntry: (ymd: string) => Promise<void>;
  saveEntry: (ymd: string) => Promise<void>;
  updateEntry: (ymd: string, entry: Partial<DiaryEntry>) => void;
}

const todayYmd = formatYmd(new Date());

let getEntry = s3GetEntry;
let putEntry = s3PutEntry;
let getSettings = s3GetSettings;
let encrypt = cryptoEncrypt;
let decrypt = cryptoDecrypt;

export function __setS3Client(mock: {
  getEntry?: typeof s3GetEntry;
  putEntry?: typeof s3PutEntry;
  getSettings?: typeof s3GetSettings;
}): void {
  if (mock.getEntry) getEntry = mock.getEntry;
  if (mock.putEntry) putEntry = mock.putEntry;
  if (mock.getSettings) getSettings = mock.getSettings;
}

export function __setCrypto(mock: {
  encrypt?: typeof cryptoEncrypt;
  decrypt?: typeof cryptoDecrypt;
}): void {
  if (mock.encrypt) encrypt = mock.encrypt;
  if (mock.decrypt) decrypt = mock.decrypt;
}

let cachedSettings: Settings | null = null;

async function fetchSettings(): Promise<Settings | null> {
  const settings = await getSettings();
  if (settings) cachedSettings = settings;
  return settings ?? cachedSettings;
}

export const useDiaryStore = create<DiaryState>((set, get) => ({
  currentDate: todayYmd,
  entries: {},
  setCurrentDate: (ymd) => set({ currentDate: ymd }),
  loadEntry: async (ymd) => {
    if (get().entries[ymd]) return;
    try {
      const settings = await fetchSettings();
      const raw = await getEntry(ymd);
      const body = raw && settings?.e2ee ? decrypt(raw) : raw;
      if (body) {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        const loc =
          (parsed.loc as DiaryEntry['loc']) ||
          (parsed.city
            ? ({ city: parsed.city as string } as DiaryEntry['loc'])
            : undefined);
        const weather =
          (parsed.weather as DiaryEntry['weather']) ||
          (parsed.desc || parsed.tmax || parsed.tmin
            ? ({
                desc: parsed.desc as string | undefined,
                tmax: parsed.tmax as number | undefined,
                tmin: parsed.tmin as number | undefined,
              } as DiaryEntry['weather'])
            : undefined);
        const text = (parsed.text as string) ?? '';
        const entry: DiaryEntry = {
          text,
          routineTicks: (parsed.routineTicks as RoutineItem[]) ?? parsed.routines ?? [],
          attachments:
            ((parsed.attachments as { name: string; uuid: string; ext?: string }[]) ?? []).map(
              (a) => ({
                name: a.name,
                uuid: a.uuid,
                ext: a.ext || a.name.split('.').pop()?.toLowerCase() || '',
              })
            ),
          loc,
          weather,
          inkUsed: (parsed.inkUsed as number) ?? text.length,
        };
        set((state) => ({ entries: { ...state.entries, [ymd]: entry } }));
      } else {
        const routineTicks =
          settings?.routineTemplate?.map((r) => ({ text: r.text, done: false })) ?? [];
        const entry: DiaryEntry = { text: '', routineTicks, attachments: [], inkUsed: 0 };
        set((state) => ({ entries: { ...state.entries, [ymd]: entry } }));
      }
    } catch (err) {
      console.error('Failed to load entry', err);
    }
  },
  saveEntry: async (ymd) => {
    const entry = get().entries[ymd];
    if (!entry) return;
    const settings = await fetchSettings();
    try {
      await putEntry(
        ymd,
        settings?.e2ee ? encrypt(JSON.stringify(entry)) : JSON.stringify(entry)
      );
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 412) {
        try {
          const latestRaw = await getEntry(ymd);
          const latestBody =
            latestRaw && settings?.e2ee ? decrypt(latestRaw) : latestRaw;
          const latest = latestBody ? JSON.parse(latestBody) : {};
          const remoteText = (latest as { text?: string }).text ?? '';
          const localText = entry.text ?? '';
          let resolved: DiaryEntry = entry;
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
          set((state) => ({ entries: { ...state.entries, [ymd]: resolved } }));
          await putEntry(
            ymd,
            settings?.e2ee
              ? encrypt(JSON.stringify(resolved))
              : JSON.stringify(resolved)
          );
        } catch (e) {
          console.error('Failed to resolve entry conflict', e);
        }
      } else {
        console.error('Failed to save entry', err);
      }
    }
  },
  updateEntry: (ymd, partial) =>
    set((state) => ({
      entries: { ...state.entries, [ymd]: { ...state.entries[ymd], ...partial } },
    })),
}));

export function __resetDiaryStore(): void {
  cachedSettings = null;
  useDiaryStore.setState({ currentDate: todayYmd, entries: {} });
}


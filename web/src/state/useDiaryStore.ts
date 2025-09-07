import { create } from 'zustand';
import { getEntry, putEntry, getSettings } from '../lib/s3Client';
import { formatYmd } from '../lib/date';
import type { RoutineItem } from '../components/RoutineBar';

interface DiaryEntry {
  text: string;
  routineTicks: RoutineItem[];
  attachments: { name: string; uuid: string }[];
  city?: string;
  desc?: string;
  tmax?: number;
  tmin?: number;
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

export const useDiaryStore = create<DiaryState>((set, get) => ({
  currentDate: todayYmd,
  entries: {},
  setCurrentDate: (ymd) => set({ currentDate: ymd }),
  loadEntry: async (ymd) => {
    if (get().entries[ymd]) return;
    try {
      const raw = await getEntry(ymd);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const entry: DiaryEntry = {
          text: parsed.text ?? '',
          routineTicks: parsed.routineTicks ?? parsed.routines ?? [],
          attachments: parsed.attachments ?? [],
          city: parsed.city,
          desc: parsed.desc,
          tmax: parsed.tmax,
          tmin: parsed.tmin,
        };
        set((state) => ({ entries: { ...state.entries, [ymd]: entry } }));
      } else {
        const settings = await getSettings();
        const routineTicks =
          settings?.routineTemplate?.map((r) => ({ text: r.text, done: false })) ?? [];
        const entry: DiaryEntry = { text: '', routineTicks, attachments: [] };
        set((state) => ({ entries: { ...state.entries, [ymd]: entry } }));
      }
    } catch (err) {
      console.error('Failed to load entry', err);
    }
  },
  saveEntry: async (ymd) => {
    const entry = get().entries[ymd];
    if (!entry) return;
    try {
      await putEntry(ymd, JSON.stringify(entry));
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 412) {
        try {
          const latestRaw = await getEntry(ymd);
          const latest = latestRaw ? JSON.parse(latestRaw) : {};
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
          await putEntry(ymd, JSON.stringify(resolved));
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


import { useEffect, useState } from 'react';
import { RoutineBar, type RoutineItem } from '../components/RoutineBar';
import { getSettings, putSettings, type Settings } from '../lib/s3Client';
import { downloadMonthJSON, downloadMonthMarkdown } from '../lib/export';
import { useTheme, type Theme } from '../state/useTheme';

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [routineTemplate, setRoutineTemplate] = useState<RoutineItem[]>([]);
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [e2ee, setE2ee] = useState(false);
  const today = new Date();
  const [exportMonth, setExportMonth] = useState(
    `${today.getFullYear()}-${pad(today.getMonth() + 1)}`
  );

  useEffect(() => {
    (async () => {
      try {
        const settings = await getSettings();
        if (settings) {
          if (settings.theme) setTheme(settings.theme);
          if (settings.routineTemplate)
            setRoutineTemplate(settings.routineTemplate);
          if (settings.timezone) setTimezone(settings.timezone);
          if (typeof settings.e2ee === 'boolean') setE2ee(settings.e2ee);
        }
      } catch (err) {
        console.error('Failed to load settings', err);
      }
    })();
  }, [setTheme]);

  const handleSave = async () => {
    const data: Settings = {
      theme,
      routineTemplate: routineTemplate.map((r) => ({
        text: r.text,
        done: false,
      })),
      timezone,
      e2ee,
    };
    try {
      await putSettings(data);
      alert('Settings saved');
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status === 412) {
        const latest = await getSettings();
        const diff = `Server:\n${JSON.stringify(
          latest,
          null,
          2
        )}\n\nYours:\n${JSON.stringify(data, null, 2)}`;
        if (
          confirm(
            `Settings have changed on the server. Overwrite with your changes?\n\n${diff}`
          )
        ) {
          await putSettings(data);
          alert('Settings saved');
        }
      } else {
        console.error('Failed to save settings', err);
      }
    }
  };

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold">Settings</h1>

      <section className="mb-4">
        <h2 className="font-semibold">Theme</h2>
        <div className="mt-1 flex gap-4">
          {(['light', 'dark', 'paper'] as Theme[]).map((t) => (
            <label key={t} className="flex items-center gap-1">
              <input
                type="radio"
                name="theme"
                checked={theme === t}
                onChange={() => setTheme(t)}
              />
              {t}
            </label>
          ))}
        </div>
      </section>

      <section className="mb-4">
      <h2 className="font-semibold">Routine template</h2>
        <RoutineBar items={routineTemplate} onChange={setRoutineTemplate} />
      </section>

      <section className="mb-4">
        <h2 className="font-semibold">Timezone</h2>
        <input
          className="mt-1 rounded border px-2 py-1 dark:bg-gray-800"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        />
      </section>

      <section className="mb-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={e2ee}
            onChange={(e) => setE2ee(e.target.checked)}
          />
          Enable end-to-end encryption
        </label>
      </section>

      <section className="mb-4">
        <h2 className="font-semibold">Export</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            type="month"
            className="rounded border px-2 py-1 dark:bg-gray-800"
            value={exportMonth}
            onChange={(e) => setExportMonth(e.target.value)}
          />
          <button
            className="rounded bg-blue-500 px-2 py-1 text-white"
            onClick={() => {
              const [yyyy, mm] = exportMonth.split('-');
              downloadMonthJSON(yyyy, mm).catch((err) =>
                console.error('export json failed', err)
              );
            }}
          >
            Export JSON
          </button>
          <button
            className="rounded bg-green-500 px-2 py-1 text-white"
            onClick={() => {
              const [yyyy, mm] = exportMonth.split('-');
              downloadMonthMarkdown(yyyy, mm).catch((err) =>
                console.error('export markdown failed', err)
              );
            }}
          >
            Export Markdown
          </button>
        </div>
      </section>

      <button
        type="button"
        className="rounded bg-blue-500 px-3 py-1 text-white"
        onClick={handleSave}
      >
        Save
      </button>
    </div>
  );
}


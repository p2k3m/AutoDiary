import { useEffect, useState } from 'react';
import {
  getConnectorStatus,
  putConnectorStatus,
  type ConnectorStatus,
} from '../lib/s3Client';

const providers = [
  {
    key: 'gmail',
    name: 'Gmail',
    scope: 'read starred email subjects',
  },
  {
    key: 'google-calendar',
    name: 'Google Calendar',
    scope: 'read event summaries',
  },
  {
    key: 'google-photos',
    name: 'Google Photos',
    scope: 'read photo metadata',
  },
  {
    key: 'linkedin',
    name: 'LinkedIn',
    scope: 'read post headlines',
  },
] as const;

export default function ConnectorsPage() {
  const [statuses, setStatuses] = useState<Record<string, ConnectorStatus | null>>({});

  useEffect(() => {
    (async () => {
      for (const p of providers) {
        try {
          const status = await getConnectorStatus(p.key);
          setStatuses((s) => ({ ...s, [p.key]: status }));
        } catch (err) {
          console.error('Failed to load connector', p.key, err);
        }
      }
    })();
  }, []);

  const update = async (provider: string, status: ConnectorStatus) => {
    try {
      await putConnectorStatus(provider, status);
      setStatuses((s) => ({ ...s, [provider]: status }));
    } catch (err) {
      console.error('Failed to update connector', provider, err);
    }
  };

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold">Connectors</h1>
      <ul className="space-y-4">
        {providers.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="font-medium">{p.name}</span>
              <span className="text-xs text-gray-500">{p.scope}</span>
            </div>
            <span className="text-sm">
              Status: {statuses[p.key] ?? 'unknown'}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded bg-green-500 px-2 py-1 text-white"
                onClick={() => update(p.key, 'added')}
              >
                Add
              </button>
              <button
                type="button"
                className="rounded bg-yellow-500 px-2 py-1 text-white"
                onClick={() => update(p.key, 'paused')}
              >
                Pause
              </button>
              <button
                type="button"
                className="rounded bg-red-500 px-2 py-1 text-white"
                onClick={() => update(p.key, 'revoked')}
              >
                Revoke
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

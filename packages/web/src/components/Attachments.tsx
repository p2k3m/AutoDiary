import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { useAuth } from '../state/useAuth';
import { attachmentKey } from '../lib/s3Client';
import { getConfig } from '../runtime-config.ts';

interface AttachmentMeta {
  name: string;
  uuid: string;
  ext: string;
}

interface AttachmentsProps {
  ymd: string;
  existing: AttachmentMeta[];
  onExistingChange: (items: AttachmentMeta[]) => void;
}

export function Attachments({
  ymd,
  existing,
  onExistingChange,
}: AttachmentsProps) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [dragging, setDragging] = useState(false);
  const { region, entryBucket: bucket } = getConfig();

  const client = useMemo(() => {
    const creds = useAuth.getState().credentialProvider;
    if (!creds) throw new Error('Not authenticated');
    return new S3Client({ region, credentials: creds });
  }, [region]);

  useEffect(() => {
    const loadUrls = async () => {
      const entries = await Promise.all(
        existing.map(async (item) => {
          const ext = item.ext || item.name.split('.').pop()?.toLowerCase() || '';
          const key = attachmentKey(ymd, item.uuid, ext);
          const url = await getSignedUrl(
            client,
            new GetObjectCommand({ Bucket: bucket, Key: key }),
            { expiresIn: 3600 }
          );
          return [item.uuid, url] as const;
        })
      );
      setUrls(Object.fromEntries(entries));
    };
    void loadUrls();
  }, [existing, ymd, client, bucket]);

  const addFiles = async (list: File[]) => {
    const items = list.map((file) => {
      const uuid = crypto.randomUUID();
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const key = attachmentKey(ymd, uuid, ext);
      return { file, uuid, ext, key, name: file.name };
    });

    if (items.length > 0) {
      onExistingChange([
        ...existing,
        ...items.map(({ name, uuid, ext }) => ({ name, uuid, ext })),
      ]);
      setProgress((prev) => ({
        ...prev,
        ...Object.fromEntries(items.map(({ uuid }) => [uuid, 0])),
      }));
    }

    await Promise.all(
      items.map(async ({ file, uuid, key }) => {
        const uploader = new Upload({
          client,
          params: {
            Bucket: bucket,
            Key: key,
            Body: file,
            ContentType: file.type,
            ServerSideEncryption: 'AES256',
          },
        });

        uploader.on('httpUploadProgress', (p) => {
          if (p.total) {
            const pct = Math.round(((p.loaded ?? 0) / p.total) * 100);
            setProgress((prev) => ({ ...prev, [uuid]: pct }));
          }
        });

        await uploader.done();

        try {
          const url = await getSignedUrl(
            client,
            new GetObjectCommand({ Bucket: bucket, Key: key }),
            { expiresIn: 3600 }
          );
          setUrls((prev) => ({ ...prev, [uuid]: url }));
          setPending((prev) => {
            const copy = { ...prev };
            delete copy[uuid];
            return copy;
          });
        } catch (err) {
          console.error(err);
          setPending((prev) => ({ ...prev, [uuid]: true }));
        } finally {
          setProgress((prev) => {
            const copy = { ...prev };
            delete copy[uuid];
            return copy;
          });
        }
      })
    );
  };

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    await addFiles(list);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const list = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    void addFiles(list);
  };

  const removeExisting = async (idx: number) => {
    const item = existing[idx];
    const key = attachmentKey(ymd, item.uuid, item.ext);

    try {
      const res = await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key })
      );
      if (res.$metadata.httpStatusCode === 202) {
        window.alert('Deletion queued for sync when back online.');
      }

      const next = existing.filter((_, i) => i !== idx);
      onExistingChange(next);

      setUrls((prev) => {
        const copy = { ...prev };
        delete copy[item.uuid];
        return copy;
      });
      setProgress((prev) => {
        const copy = { ...prev };
        delete copy[item.uuid];
        return copy;
      });
      setPending((prev) => {
        const copy = { ...prev };
        delete copy[item.uuid];
        return copy;
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div
      className={`mt-2 border-2 border-dashed p-2 ${
        dragging ? 'bg-blue-50' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input type="file" multiple onChange={handleSelect} />
      {existing.length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-sm">
          {existing.map((f, idx) => (
            <li key={f.uuid}>
              {f.name}
              {urls[f.uuid] ? (
                /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name) ? (
                  <img src={urls[f.uuid]} alt={f.name} className="mt-1 h-20" />
                ) : (
                  <a
                    href={urls[f.uuid]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-blue-600 underline"
                  >
                    view
                  </a>
                )
              ) : (
                pending[f.uuid] && (
                  <span className="ml-2 text-gray-500 italic">
                    will appear when back online
                  </span>
                )
              )}
              <button
                type="button"
                onClick={() => {
                  void removeExisting(idx);
                }}
                className="ml-2 text-red-600"
              >
                remove
              </button>
              {progress[f.uuid] !== undefined && (
                <div className="mt-1 h-2 w-full bg-gray-200">
                  <div
                    className="h-2 bg-blue-500"
                    style={{ width: `${progress[f.uuid]}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


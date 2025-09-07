import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { useAuth } from '../state/useAuth';
import { attachmentKey } from '../lib/s3Client';

interface AttachmentMeta {
  name: string;
  uuid: string;
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
  const [dragging, setDragging] = useState(false);
  const region = import.meta.env.VITE_REGION as string;
  const bucket = import.meta.env.VITE_ENTRY_BUCKET as string;

  const client = useMemo(() => {
    const creds = useAuth.getState().credentialProvider;
    if (!creds) throw new Error('Not authenticated');
    return new S3Client({ region, credentials: creds });
  }, [region]);

  useEffect(() => {
    const loadUrls = async () => {
      const entries = await Promise.all(
        existing.map(async (item) => {
          const key = attachmentKey(ymd, item.uuid);
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
    const added: AttachmentMeta[] = [];
    const urlMap: Record<string, string> = {};
    for (const file of list) {
      const uuid = crypto.randomUUID();
      const key = attachmentKey(ymd, uuid);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: file,
          ContentType: file.type,
          ServerSideEncryption: 'AES256',
        })
      );
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: 3600 }
      );
      added.push({ name: file.name, uuid });
      urlMap[uuid] = url;
    }
    if (added.length > 0) {
      onExistingChange([...existing, ...added]);
      setUrls((prev) => ({ ...prev, ...urlMap }));
    }
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

  const removeExisting = (idx: number) => {
    const next = [...existing];
    const [removed] = next.splice(idx, 1);
    onExistingChange(next);
    setUrls((prev) => {
      const copy = { ...prev };
      delete copy[removed.uuid];
      return copy;
    });
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
              {urls[f.uuid] &&
              /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name) ? (
                <img src={urls[f.uuid]} alt={f.name} className="mt-1 h-20" />
              ) : (
                urls[f.uuid] && (
                  <a
                    href={urls[f.uuid]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-blue-600 underline"
                  >
                    view
                  </a>
                )
              )}
              <button
                type="button"
                onClick={() => removeExisting(idx)}
                className="ml-2 text-red-600"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


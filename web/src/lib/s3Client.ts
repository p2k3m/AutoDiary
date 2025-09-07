import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { useAuth } from '../state/useAuth';
import { getEtag, setEtag } from './etagCache';

const region = import.meta.env.VITE_REGION as string;
const bucket = import.meta.env.VITE_ENTRY_BUCKET as string;

function getClient() {
  const creds = useAuth.getState().credentialProvider;
  if (!creds) {
    throw new Error('Not authenticated');
  }
  return new S3Client({ region, credentials: creds });
}

function entryKey(ymd: string) {
  const prefix = useAuth.getState().userPrefix ?? '';
  const [yyyy, mm, dd] = ymd.split('-');
  return `${prefix}/entries/${yyyy}/${mm}/${dd}.json`;
}

function settingsKey() {
  const prefix = useAuth.getState().userPrefix ?? '';
  return `${prefix}/settings.json`;
}

function weeklyKey(yyyy: string, ww: string) {
  const prefix = useAuth.getState().userPrefix ?? '';
  return `${prefix}/weekly/${yyyy}-${ww}.json`;
}

export function attachmentKey(ymd: string, uuid: string) {
  const prefix = useAuth.getState().userPrefix ?? '';
  const [yyyy, mm, dd] = ymd.split('-');
  return `${prefix}/attachments/${yyyy}/${mm}/${dd}/${uuid}`;
}

export interface Settings {
  theme: 'light' | 'dark' | 'paper';
  routineTemplate: { text: string; done: boolean }[];
  timezone: string;
  e2ee: boolean;
}

export interface WeeklyData {
  digests?: string[];
  summary?: string;
}

export async function getEntry(ymd: string): Promise<string | null> {
  const client = getClient();
  const key = entryKey(ymd);
  const etag = await getEtag(key);
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, IfNoneMatch: etag })
    );
    const body = await new Response(res.Body as ReadableStream).text();
    if (res.ETag) await setEtag(key, res.ETag);
    return body;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 304) {
      return null;
    }
    if (status === 404) {
      return null;
    }
    throw err;
  }
}

export async function putEntry(ymd: string, body: string): Promise<void> {
  const client = getClient();
  const key = entryKey(ymd);
  const res = await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
    })
  );
  if (res.ETag) await setEtag(key, res.ETag);
}

export async function listMonth(yyyy: string, mm: string): Promise<string[]> {
  const client = getClient();
  const prefix = `${useAuth.getState().userPrefix ?? ''}/entries/${yyyy}/${mm}/`;
  const res = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
  );
  return (
    res.Contents?.map((obj) => obj.Key || '')
      .filter((k) => k)
      .map((k) => k.slice(prefix.length).replace(/\.json$/, '')) ?? []
  );
}

export async function getWeekly(
  yyyy: string,
  ww: string
): Promise<WeeklyData | null> {
  const client = getClient();
  const key = weeklyKey(yyyy, ww);
  const etag = await getEtag(key);
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, IfNoneMatch: etag })
    );
    const body = await new Response(res.Body as ReadableStream).text();
    if (res.ETag) await setEtag(key, res.ETag);
    return JSON.parse(body) as WeeklyData;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode;
    if (status === 304) {
      return null;
    }
    if (status === 404) {
      return null;
    }
    throw err;
  }
}

export async function getSettings(): Promise<Settings | null> {
  const client = getClient();
  const key = settingsKey();
  const etag = await getEtag(key);
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, IfNoneMatch: etag })
    );
    const body = await new Response(res.Body as ReadableStream).text();
    if (res.ETag) await setEtag(key, res.ETag);
    return JSON.parse(body) as Settings;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode;
    if (status === 304) {
      return null;
    }
    if (status === 404) {
      return null;
    }
    throw err;
  }
}

export async function putSettings(data: Settings): Promise<void> {
  const client = getClient();
  const key = settingsKey();
  const res = await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data),
      ContentType: 'application/json',
    })
  );
  if (res.ETag) await setEtag(key, res.ETag);
}


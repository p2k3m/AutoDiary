import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { useAuth } from '../state/useAuth';
import { getEtag, setEtag, clearEtag } from './etagCache';
import { cacheEntry, getCachedEntry } from './entryCache';

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

function connectorKey(provider: string) {
  const prefix = useAuth.getState().userPrefix ?? '';
  return `${prefix}/connectors/${provider}.json`;
}

interface RawEntry {
  text?: string;
  loc?: { lat?: number; lon?: number; city?: string };
  weather?: { tmax?: number; tmin?: number; desc?: string };
  city?: string;
  lat?: number;
  lon?: number;
  tmax?: number;
  tmin?: number;
  desc?: string;
  inkUsed?: number;
  [key: string]: unknown;
}

function normalizeEntry(body: string): string {
  try {
    const data: RawEntry = JSON.parse(body);
    const loc =
      data.loc ||
      (data.city || data.lat || data.lon
        ? { lat: data.lat, lon: data.lon, city: data.city }
        : undefined);
    const weather =
      data.weather ||
      (data.tmax || data.tmin || data.desc
        ? { tmax: data.tmax, tmin: data.tmin, desc: data.desc }
        : undefined);
    if (loc) {
      data.loc = loc;
      delete data.city;
      delete data.lat;
      delete data.lon;
    }
    if (weather) {
      data.weather = weather;
      delete data.tmax;
      delete data.tmin;
      delete data.desc;
    }
    if (typeof data.text === 'string' && typeof data.inkUsed !== 'number') {
      data.inkUsed = data.text.length;
    }
    return JSON.stringify(data);
  } catch {
    return body;
  }
}

export function attachmentKey(ymd: string, uuid: string, ext: string) {
  const prefix = useAuth.getState().userPrefix ?? '';
  const [yyyy, mm, dd] = ymd.split('-');
  return `${prefix}/attachments/${yyyy}/${mm}/${dd}/${uuid}.${ext}`;
}

export async function putAttachment(
  ymd: string,
  uuid: string,
  ext: string,
  file: File
): Promise<void> {
  const client = getClient();
  const key = attachmentKey(ymd, uuid, ext);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file,
      ContentType: file.type,
    })
  );
}

export interface Settings {
  theme: 'light' | 'dark' | 'paper';
  routineTemplate: { text: string; done: boolean }[];
  timezone: string;
  e2ee: boolean;
}

export interface WeeklyData {
  habits?: { name: string; done: number; total: number; streak: number }[];
  suggestions?: string[];
  connectorsDigest?: {
    meetingsHours: number;
    topContacts: string[];
    photosCount: number;
  };
  aiSummary?: string;
}

export type ConnectorStatus = 'added' | 'paused' | 'revoked';

export async function getEntry(ymd: string): Promise<string | null> {
  const client = getClient();
  const key = entryKey(ymd);
  const etag = await getEtag(key);
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, IfNoneMatch: etag })
    );
    const raw = await new Response(res.Body as ReadableStream).text();
    const body = normalizeEntry(raw);
    if (res.ETag) await setEtag(key, res.ETag);
    await cacheEntry(ymd, body);
    return body;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 304) {
      const cached = await getCachedEntry(ymd);
      return cached ? normalizeEntry(cached) : null;
    }
    if (status === 404) {
      return null;
    }
    const cached = await getCachedEntry(ymd);
    if (cached) return normalizeEntry(cached);
    throw err;
  }
}

export async function putEntry(ymd: string, body: string): Promise<void> {
  const client = getClient();
  const key = entryKey(ymd);
  const etag = await getEtag(key);
  const normalized = normalizeEntry(body);
  try {
    const res = await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: normalized,
        ContentType: 'application/json',
        ...(etag ? { IfMatch: etag } : {}),
      })
    );
    if (res.ETag) await setEtag(key, res.ETag);
    await cacheEntry(ymd, normalized);
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode;
    if (status === 412) {
      await clearEtag(key);
    }
    throw err;
  }
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
    const parsed = JSON.parse(body) as WeeklyData & { summary?: string };
    return {
      connectorsDigest: parsed.connectorsDigest,
      aiSummary: parsed.aiSummary ?? parsed.summary,
      habits: parsed.habits,
      suggestions: parsed.suggestions,
    };
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
  const etag = await getEtag(key);
  try {
    const res = await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(data),
        ContentType: 'application/json',
        ...(etag ? { IfMatch: etag } : {}),
      })
    );
    if (res.ETag) await setEtag(key, res.ETag);
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode;
    if (status === 412) {
      await clearEtag(key);
    }
    throw err;
  }
}

export async function getConnectorStatus(
  provider: string
): Promise<ConnectorStatus | null> {
  const client = getClient();
  const key = connectorKey(provider);
  const etag = await getEtag(key);
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, IfNoneMatch: etag })
    );
    const body = await new Response(res.Body as ReadableStream).text();
    if (res.ETag) await setEtag(key, res.ETag);
    const data = JSON.parse(body) as { status: ConnectorStatus };
    return data.status;
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

export async function putConnectorStatus(
  provider: string,
  status: ConnectorStatus
): Promise<void> {
  const client = getClient();
  const key = connectorKey(provider);
  const etag = await getEtag(key);
  try {
    const res = await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify({ status }),
        ContentType: 'application/json',
        ...(etag ? { IfMatch: etag } : {}),
      })
    );
    if (res.ETag) await setEtag(key, res.ETag);
  } catch (err) {
    const statusCode = (err as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode;
    if (statusCode === 412) {
      await clearEtag(key);
    }
    throw err;
  }
}


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
  return `${prefix}/${ymd}.json`;
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
  const prefix = `${useAuth.getState().userPrefix ?? ''}/${yyyy}-${mm}`;
  const res = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
  );
  return (
    res.Contents?.map((obj) => obj.Key || '')
      .filter((k) => k)
      .map((k) => k.slice(prefix.length + 1).replace(/\.json$/, '')) ?? []
  );
}


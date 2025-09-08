import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';

interface HabitStat {
  name: string;
  done: number;
  total: number;
  streak: number;
}

export interface WeeklyReviewResult {
  habits: HabitStat[];
  suggestions: string[];
  connectorsDigest?: {
    meetingsHours: number;
    topContacts: string[];
    photosCount: number;
  };
  aiSummary?: string;
}

const modelId = process.env.BEDROCK_MODEL_ID ?? '';
const userTokenCap = parseInt(process.env.USER_TOKEN_CAP ?? '0');
const summaryTokenLimit = parseInt(process.env.SUMMARY_TOKEN_LIMIT ?? '0');
const bucketName = process.env.BUCKET_NAME ?? '';
const tokenTableName = process.env.TOKEN_TABLE_NAME ?? '';

const client = new BedrockRuntimeClient({});
const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const diff = (d.getDay() + 6) % 7; // Monday start
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getIsoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatYmd(d: Date): string {
  const yyyy = d.getFullYear().toString();
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function checkAndConsumeTokens(
  userId: string,
  weekStart: string,
  needed: number
): Promise<boolean> {
  const data = await dynamo.send(
    new GetItemCommand({
      TableName: tokenTableName,
      Key: { userId: { S: userId } },
    })
  );
  let tokens = 0;
  if (data.Item && data.Item.weekStart?.S === weekStart) {
    tokens = parseInt(data.Item.tokens?.N ?? '0', 10);
  }
  if (tokens + needed > userTokenCap) return false;

  await dynamo.send(
    new PutItemCommand({
      TableName: tokenTableName,
      Item: {
        userId: { S: userId },
        weekStart: { S: weekStart },
        tokens: { N: String(tokens + needed) },
      },
    })
  );

  return true;
}

async function generateReviewForUser(userId: string): Promise<void> {
  const start = startOfWeek(new Date());
  const ymds: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    ymds.push(formatYmd(d));
  }

  const entries: Record<string, unknown>[] = [];
  for (const ymd of ymds) {
    const [yyyy, mm, dd] = ymd.split('-');
    const key = `private/${userId}/entries/${yyyy}/${mm}/${dd}.json`;
    try {
      const obj = await s3.send(
        new GetObjectCommand({ Bucket: bucketName, Key: key })
      );
      const body = await obj.Body?.transformToString();
      if (body) entries.push(JSON.parse(body));
      else entries.push({});
    } catch {
      entries.push({});
    }
  }

  const map = new Map<string, { done: number; total: number; streak: number }>();
  const streak = new Map<string, number>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const routines: { text: string; done: boolean }[] =
      (entry as {
        routineTicks?: { text: string; done: boolean }[];
        routines?: { text: string; done: boolean }[];
      }).routineTicks ?? (entry as { routines?: { text: string; done: boolean }[] }).routines ?? [];
    const todays = new Set<string>();
    for (const r of routines) {
      const s =
        map.get(r.text) ?? { done: 0, total: 0, streak: 0 };
      s.total += 1;
      if (r.done) {
        s.done += 1;
        const cur = (streak.get(r.text) ?? 0) + 1;
        streak.set(r.text, cur);
        s.streak = cur;
      } else {
        streak.set(r.text, 0);
        s.streak = 0;
      }
      map.set(r.text, s);
      todays.add(r.text);
    }
    for (const name of streak.keys()) {
      if (!todays.has(name)) {
        streak.set(name, 0);
        const s = map.get(name);
        if (s) s.streak = 0;
      }
    }
  }

  const habits: HabitStat[] = Array.from(map.entries()).map(([name, v]) => ({
    name,
    done: v.done,
    total: v.total,
    streak: v.streak,
  }));

  const suggestions = habits
    .filter((h) => h.total > 0 && h.done / h.total < 0.6)
    .sort((a, b) => a.done / a.total - b.done / b.total)
    .slice(0, 3)
    .map((h) => `Focus more on ${h.name} (only ${h.done}/${h.total}).`);

  let connectorsDigest: WeeklyReviewResult['connectorsDigest'];
  try {
    const obj = await s3.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: `private/${userId}/connectors/summary.json`,
      })
    );
    const body = await obj.Body?.transformToString();
    if (body) connectorsDigest = JSON.parse(body);
  } catch {
    // ignore if missing
  }

  const prompt = 'Write a short summary of this week.';
  const needed = estimateTokens(prompt) + summaryTokenLimit;
  const weekStartStr = formatYmd(start);

  let aiSummary: string | undefined;
  if (await checkAndConsumeTokens(userId, weekStartStr, needed)) {
    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: prompt }],
          },
        ],
        max_tokens: summaryTokenLimit,
      }),
    });

    const response = await client.send(command);
    const completion = JSON.parse(new TextDecoder().decode(response.body));
    aiSummary = completion.output_text ?? '';
  }

  const yyyy = start.getFullYear().toString();
  const ww = getIsoWeek(start).toString().padStart(2, '0');
  const weeklyKey = `private/${userId}/weekly/${yyyy}-${ww}.json`;
  const result: WeeklyReviewResult = {
    habits,
    suggestions,
    ...(connectorsDigest ? { connectorsDigest } : {}),
    ...(aiSummary ? { aiSummary } : {}),
  };

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: weeklyKey,
      Body: JSON.stringify(result),
      ContentType: 'application/json',
    })
  );
}

export async function handler(): Promise<void> {
  const list = await s3.send(
    new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: 'private/',
      Delimiter: '/',
    })
  );
  const userIds =
    list.CommonPrefixes?.map((cp) => cp.Prefix?.split('/')[1]).filter(
      (id): id is string => !!id
    ) ?? [];

  for (const userId of userIds) {
    await generateReviewForUser(userId);
  }
}

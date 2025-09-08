import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

const aiProvider = (process.env.AI_PROVIDER ?? 'bedrock') as
  | 'bedrock'
  | 'openai'
  | 'gemini';

const providerConfigs = {
  bedrock: {
    modelId: process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-v2',
    tokenCap: parseInt(process.env.BEDROCK_TOKEN_CAP ?? '0', 10),
    summaryTokenLimit: parseInt(
      process.env.BEDROCK_SUMMARY_TOKEN_LIMIT ?? '0',
      10
    ),
    costCap: parseFloat(process.env.BEDROCK_COST_CAP ?? '0'),
    costPer1k: parseFloat(process.env.BEDROCK_COST_PER_1K ?? '0'),
  },
  openai: {
    modelId: process.env.OPENAI_MODEL_ID ?? 'gpt-3.5-turbo',
    tokenCap: parseInt(process.env.OPENAI_TOKEN_CAP ?? '0', 10),
    summaryTokenLimit: parseInt(
      process.env.OPENAI_SUMMARY_TOKEN_LIMIT ?? '0',
      10
    ),
    costCap: parseFloat(process.env.OPENAI_COST_CAP ?? '0'),
    costPer1k: parseFloat(process.env.OPENAI_COST_PER_1K ?? '0'),
  },
  gemini: {
    modelId: process.env.GEMINI_MODEL_ID ?? 'gemini-pro',
    tokenCap: parseInt(process.env.GEMINI_TOKEN_CAP ?? '0', 10),
    summaryTokenLimit: parseInt(
      process.env.GEMINI_SUMMARY_TOKEN_LIMIT ?? '0',
      10
    ),
    costCap: parseFloat(process.env.GEMINI_COST_CAP ?? '0'),
    costPer1k: parseFloat(process.env.GEMINI_COST_PER_1K ?? '0'),
  },
} as const;

const { modelId, tokenCap, summaryTokenLimit, costCap, costPer1k } =
  providerConfigs[aiProvider];
const bucketName = process.env.BUCKET_NAME ?? '';
const tokenTableName = process.env.TOKEN_TABLE_NAME ?? '';
const bedrockClient = new BedrockRuntimeClient({});
const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateCost(tokens: number): number {
  return (tokens / 1000) * costPer1k;
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

async function hasRecentActivity(userId: string): Promise<boolean> {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);

  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const [yyyy, mm, dd] = formatYmd(d).split('-');
    const key = `private/${userId}/entries/${yyyy}/${mm}/${dd}.json`;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
      return true;
    } catch {
      // ignore missing objects
    }
  }

  try {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: `private/${userId}/connectors/`,
      })
    );
    if (
      list.Contents?.some(
        (o) => o.LastModified && o.LastModified.getTime() >= weekAgo.getTime()
      )
    )
      return true;
  } catch {
    // ignore
  }

  return false;
}

async function checkAndConsumeUsage(
  userId: string,
  weekStart: string,
  neededTokens: number,
  neededCost: number
): Promise<boolean> {
  const data = await dynamo.send(
    new GetItemCommand({
      TableName: tokenTableName,
      Key: { userId: { S: userId } },
    })
  );
  let tokens = 0;
  let cost = 0;
  if (data.Item && data.Item.weekStart?.S === weekStart) {
    tokens = parseInt(data.Item.tokens?.N ?? '0', 10);
    cost = parseFloat(data.Item.cost?.N ?? '0');
  }
  if (tokens + neededTokens > tokenCap || cost + neededCost > costCap)
    return false;

  await dynamo.send(
    new PutItemCommand({
      TableName: tokenTableName,
      Item: {
        userId: { S: userId },
        weekStart: { S: weekStart },
        tokens: { N: String(tokens + neededTokens) },
        cost: { N: String(cost + neededCost) },
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
  const neededTokens = estimateTokens(prompt) + summaryTokenLimit;
  const neededCost = estimateCost(neededTokens);
  const weekStartStr = formatYmd(start);

  let aiSummary: string | undefined;
  if (await checkAndConsumeUsage(userId, weekStartStr, neededTokens, neededCost)) {
    switch (aiProvider) {
      case 'openai': {
        const completion = await openaiClient.chat.completions.create({
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: summaryTokenLimit,
        });
        aiSummary = completion.choices[0].message?.content?.trim() ?? '';
        break;
      }
      case 'gemini': {
        const model = genAI.getGenerativeModel({ model: modelId });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: summaryTokenLimit },
        });
        aiSummary = result.response.text();
        break;
      }
      default: {
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

        const response = await bedrockClient.send(command);
        const completion = JSON.parse(new TextDecoder().decode(response.body));
        aiSummary = completion.output_text ?? '';
      }
    }
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
  const userIds = new Set<string>();
  let continuationToken: string | undefined;

  do {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: 'private/',
        Delimiter: '/',
        ContinuationToken: continuationToken,
      })
    );
    list.CommonPrefixes?.forEach((cp) => {
      const id = cp.Prefix?.split('/')[1];
      if (id) userIds.add(id);
    });
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);

  for (const userId of userIds) {
    if (await hasRecentActivity(userId)) {
      await generateReviewForUser(userId);
    }
  }
}

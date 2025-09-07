import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

export interface WeeklyReviewResult {
  connectorsDigest?: {
    meetingsHours: number;
    topContacts: string[];
    photosCount: number;
  };
  aiSummary?: string;
}

interface WeeklyReviewEvent {
  userId: string;
}

const modelId = process.env.BEDROCK_MODEL_ID ?? '';
const userTokenCap = parseInt(process.env.USER_TOKEN_CAP ?? '0');
const summaryTokenLimit = parseInt(process.env.SUMMARY_TOKEN_LIMIT ?? '0');

const client = new BedrockRuntimeClient({});
const tokenUsage: Record<string, number> = {};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function handler(event: WeeklyReviewEvent): Promise<WeeklyReviewResult> {
  const connectorsDigest = {
    meetingsHours: 0,
    topContacts: [],
    photosCount: 0,
  };

  const used = tokenUsage[event.userId] ?? 0;
  const prompt = 'Write a short summary of this week.';
  const needed = estimateTokens(prompt) + summaryTokenLimit;

  if (used + needed > userTokenCap) {
    return { connectorsDigest };
  }

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
  const aiSummary = completion.output_text ?? '';

  tokenUsage[event.userId] = used + needed;

  return {
    connectorsDigest,
    aiSummary,
  };
}

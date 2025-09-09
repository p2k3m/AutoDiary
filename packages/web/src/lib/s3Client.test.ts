import { describe, it, expect, vi, beforeEach } from 'vitest';

// mocks
const sendMock = vi.fn();

vi.mock('../runtime-config.ts', () => ({
  getConfig: () => ({
    region: 'ap-south-1',
    entryBucket: 'bucket',
    userPoolId: '',
    userPoolClientId: '',
    identityPoolId: '',
    hostedUiDomain: '',
    testMode: true,
  }),
}));

vi.mock('../state/useAuth', () => ({
  useAuth: {
    getState: () => ({ credentialProvider: {}, userPrefix: 'prefix' }),
  },
}));

vi.mock('./etagCache', () => ({
  getEtag: vi.fn(async () => undefined),
  setEtag: vi.fn(async () => {}),
  clearEtag: vi.fn(async () => {}),
}));

vi.mock('./entryCache', () => ({
  cacheEntry: vi.fn(async () => {}),
  getCachedEntry: vi.fn(async () => null),
}));

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    send(command: unknown) {
      return sendMock(command);
    }
  }
  class GetObjectCommand {
    constructor(public readonly input: unknown) {}
  }
  class PutObjectCommand { constructor(public readonly input: unknown) {} }
  class ListObjectsV2Command { constructor(public readonly input: unknown) {} }
  return { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command };
});

import { getSettings, __clearCachedSettings, getWeekly, __clearCachedWeekly } from './s3Client';

beforeEach(() => {
  __clearCachedSettings();
  __clearCachedWeekly();
  sendMock.mockReset();
});

describe('getSettings', () => {
  it('returns cached settings on 304', async () => {
    const settings = { theme: 'light', routineTemplate: [], timezone: 'UTC', e2ee: false };
    sendMock.mockResolvedValueOnce({
      Body: Buffer.from(JSON.stringify(settings)),
      ETag: '"1"',
    });
    sendMock.mockImplementationOnce(() => {
      const err = new Error('Not modified') as Error & {
        $metadata?: { httpStatusCode: number };
      };
      err.$metadata = { httpStatusCode: 304 };
      throw err;
    });

    const first = await getSettings();
    const second = await getSettings();

    expect(first).toEqual(settings);
    expect(second).toEqual(settings);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});

describe('getWeekly', () => {
  it('returns cached summary on 304', async () => {
    const data = { aiSummary: 'Great week!' };
    sendMock.mockResolvedValueOnce({
      Body: Buffer.from(JSON.stringify(data)),
      ETag: '"1"',
    });
    sendMock.mockImplementationOnce(() => {
      const err = new Error('Not modified') as Error & {
        $metadata?: { httpStatusCode: number };
      };
      err.$metadata = { httpStatusCode: 304 };
      throw err;
    });

    const first = await getWeekly('2024', '01');
    const second = await getWeekly('2024', '01');

    expect(first?.aiSummary).toBe('Great week!');
    expect(second).toEqual(first);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});

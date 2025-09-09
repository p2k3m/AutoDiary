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

import {
  getSettings,
  putSettings,
  putEntry,
  putAttachment,
  __clearCachedSettings,
  getWeekly,
  __clearCachedWeekly,
  getConnectorStatus,
  __clearCachedConnectorStatuses,
} from './s3Client';

beforeEach(() => {
  __clearCachedSettings();
  __clearCachedWeekly();
  __clearCachedConnectorStatuses();
  sendMock.mockReset();
});

describe('getSettings', () => {
  it('returns cached settings without second network call', async () => {
    const settings = { theme: 'light', routineTemplate: [], timezone: 'UTC', e2ee: false };
    sendMock.mockResolvedValueOnce({
      Body: Buffer.from(JSON.stringify(settings)),
      ETag: '"1"',
    });

    const first = await getSettings();
    const second = await getSettings();

    expect(first).toEqual(settings);
    expect(second).toEqual(settings);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('returns updated cache after put without calling S3', async () => {
    const settings = { theme: 'dark', routineTemplate: [], timezone: 'UTC', e2ee: false };
    sendMock.mockResolvedValueOnce({ ETag: '"1"' });

    await putSettings(settings);
    sendMock.mockClear();

    const result = await getSettings();

    expect(result).toEqual(settings);
    expect(sendMock).not.toHaveBeenCalled();
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

describe('getConnectorStatus', () => {
  it('returns cached status on 304', async () => {
    sendMock.mockResolvedValueOnce({
      Body: Buffer.from(JSON.stringify({ status: 'added' })),
      ETag: '"1"',
    });
    sendMock.mockImplementationOnce(() => {
      const err = new Error('Not modified') as Error & {
        $metadata?: { httpStatusCode: number };
      };
      err.$metadata = { httpStatusCode: 304 };
      throw err;
    });

    const first = await getConnectorStatus('gmail');
    const second = await getConnectorStatus('gmail');

    expect(first).toBe('added');
    expect(second).toBe('added');
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});

describe('putAttachment', () => {
  it('sets server-side encryption', async () => {
    const file = { type: 'text/plain' } as unknown as File;
    sendMock.mockResolvedValueOnce({});
    await putAttachment('2024-01-01', 'uuid', 'txt', file);
    const command = sendMock.mock.calls[0][0];
    expect(command.input).toMatchObject({ ServerSideEncryption: 'AES256' });
  });
});

describe('putEntry', () => {
  it('sets server-side encryption', async () => {
    sendMock.mockResolvedValueOnce({ ETag: '"1"' });
    await putEntry('2024-01-01', '{}');
    const command = sendMock.mock.calls[0][0];
    expect(command.input).toMatchObject({ ServerSideEncryption: 'AES256' });
  });
});

describe('putSettings', () => {
  it('sets server-side encryption', async () => {
    const settings = { theme: 'light', routineTemplate: [], timezone: 'UTC', e2ee: false };
    sendMock.mockResolvedValueOnce({ ETag: '"1"' });
    await putSettings(settings);
    const command = sendMock.mock.calls[0][0];
    expect(command.input).toMatchObject({ ServerSideEncryption: 'AES256' });
  });
});

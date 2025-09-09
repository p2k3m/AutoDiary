import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/s3Client', () => ({
  getEntry: vi.fn(),
  putEntry: vi.fn(),
  getSettings: vi.fn(),
  __esModule: true,
}));

import { useDiaryStore, __setS3Client, __setCrypto, __resetDiaryStore } from './useDiaryStore';

describe('useDiaryStore with cached settings', () => {
  beforeEach(() => {
    __resetDiaryStore();
  });

  it('loadEntry uses cached settings when getSettings returns null', async () => {
    const settings = { theme: 'light', routineTemplate: [{ text: 'r', done: false }], timezone: 'UTC', e2ee: false };
    const getSettings = vi
      .fn()
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce(null);
    const getEntry = vi.fn().mockResolvedValue(null);
    __setS3Client({ getSettings, getEntry });

    await useDiaryStore.getState().loadEntry('2024-01-01');
    await useDiaryStore.getState().loadEntry('2024-01-02');

    expect(getSettings).toHaveBeenCalledTimes(2);
    expect(useDiaryStore.getState().entries['2024-01-02'].routineTicks).toHaveLength(1);
  });

  it('saveEntry uses cached settings when getSettings returns null', async () => {
    const settings = { theme: 'light', routineTemplate: [], timezone: 'UTC', e2ee: true };
    const getSettings = vi
      .fn()
      .mockResolvedValueOnce(settings)
      .mockResolvedValueOnce(null);
    const putEntry = vi.fn().mockResolvedValue(undefined);
    const getEntry = vi.fn().mockResolvedValue(null);
    const encrypt = vi.fn((s: string) => `enc:${s}`);
    __setS3Client({ getSettings, putEntry, getEntry });
    __setCrypto({ encrypt });

    await useDiaryStore.getState().loadEntry('2024-01-01');
    useDiaryStore.getState().updateEntry('2024-01-01', { text: 'hi', routineTicks: [], attachments: [], inkUsed: 2 });
    await useDiaryStore.getState().saveEntry('2024-01-01');

    expect(getSettings).toHaveBeenCalledTimes(2);
    expect(encrypt).toHaveBeenCalled();
    expect(putEntry).toHaveBeenCalledWith('2024-01-01', expect.stringContaining('hi'));
  });
});

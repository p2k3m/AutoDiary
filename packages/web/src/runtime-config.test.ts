import { describe, it, expect, vi } from 'vitest';

describe('loadConfig', () => {
  it('falls back to testMode config on fetch error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'));
    vi.stubGlobal('fetch', fetchMock);
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { loadConfig } = await import('./runtime-config');
    const cfg = await loadConfig();

    expect(cfg.testMode).toBe(true);
    expect(warnMock).toHaveBeenCalled();

    warnMock.mockRestore();
    vi.unstubAllGlobals();
  });
});

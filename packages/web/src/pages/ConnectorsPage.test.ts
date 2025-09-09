// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import type { ConnectorStatus } from '../lib/s3Client';
import * as s3Client from '../lib/s3Client';
import ConnectorsPage from './ConnectorsPage';

vi.mock('../lib/s3Client', () => ({
  getCachedConnectorStatus: vi.fn(),
  getConnectorStatus: vi.fn(),
  putConnectorStatus: vi.fn(),
}));

describe('ConnectorsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all statuses after a single network round-trip', async () => {
    const getCached = s3Client.getCachedConnectorStatus as unknown as Mock;
    const getStatus = s3Client.getConnectorStatus as unknown as Mock;

    getCached.mockReturnValue(undefined);

    const resolvers: Record<string, (s: ConnectorStatus) => void> = {};
    getStatus.mockImplementation((key: string) =>
      new Promise<ConnectorStatus>((resolve) => {
        resolvers[key] = resolve;
      })
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(ConnectorsPage));
    });

    // Resolve three of four promises; UI should not update yet
    await act(async () => {
      resolvers.gmail('added');
      resolvers['google-calendar']('paused');
      resolvers['google-photos']('revoked');
    });
    expect(container.textContent).not.toContain('Status: added');
    expect(container.textContent).not.toContain('Status: paused');
    expect(container.textContent).not.toContain('Status: revoked');

    // Resolve final promise; UI should show all statuses at once
    await act(async () => {
      resolvers.linkedin('added');
    });

    expect(s3Client.getConnectorStatus).toHaveBeenCalledTimes(4);
    expect(container.textContent).toContain('Status: added');
    expect(container.textContent).toContain('Status: paused');
    expect(container.textContent).toContain('Status: revoked');
  });
});

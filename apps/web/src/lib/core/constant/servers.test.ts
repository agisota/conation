import { afterEach, describe, expect, it, vi } from 'vitest';

describe('standalone server endpoints', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('derives every active service from the operator origin', async () => {
    vi.stubEnv(
      'VITE_CONATION_OPERATOR_ORIGIN',
      'https://operator.example.test'
    );
    const {
      SERVER_HOSTS,
      SYNC_PERMISSION_TOKEN_DSS_HOST,
      SYNC_SERVICE_HOSTS,
    } = await import('./servers');

    expect(SERVER_HOSTS).toMatchObject({
      'auth-service': 'https://operator.example.test/auth',
      'auth-logout': 'https://operator.example.test/app/login',
      'document-storage-service': 'https://operator.example.test/dss',
      'websocket-service': 'wss://operator.example.test/websocket',
    });
    expect(SYNC_SERVICE_HOSTS).toEqual({
      worker: 'https://operator.example.test/sync',
      ws: 'wss://operator.example.test/sync',
    });
    expect(SYNC_PERMISSION_TOKEN_DSS_HOST).toBe(
      'https://operator.example.test/dss'
    );
    expect(Object.values(SERVER_HOSTS).every((url) => !url.includes('macro'))).toBe(
      true
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  createStandaloneServers,
  createStandaloneSyncServiceHosts,
} from './serverProfile';

describe('standalone server profile', () => {
  it('routes every HTTP service through the operator origin', () => {
    const servers = createStandaloneServers('https://operator.example.test');
    expect(servers).toMatchObject({
      'auth-service': 'https://operator.example.test/auth',
      'auth-logout': 'https://operator.example.test/app/login',
      'document-storage-service': 'https://operator.example.test/dss',
      'scheduled-action': 'https://operator.example.test/scheduled-action',
      'agent-harness': 'https://operator.example.test/agent-harness',
    });
    expect(Object.values(servers).join('\n')).not.toContain('macro.com');
  });

  it('uses same-origin websocket schemes and paths', () => {
    expect(
      createStandaloneServers('https://operator.example.test')
    ).toMatchObject({
      'websocket-service': 'wss://operator.example.test/websocket',
      'connection-gateway': 'wss://operator.example.test/connection-gateway',
    });
    expect(createStandaloneSyncServiceHosts('http://localhost:8090')).toEqual({
      worker: 'http://localhost:8090/sync',
      ws: 'ws://localhost:8090/sync',
    });
  });
});

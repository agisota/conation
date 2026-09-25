import { describe, expect, it } from 'vitest';
import {
  buildSelfHostedServerHosts,
  resolveWebDeployment,
  type WebDeploymentEnvironment,
} from './selfHosted';

describe('resolveWebDeployment', () => {
  const production = (overrides: Partial<WebDeploymentEnvironment> = {}) =>
    resolveWebDeployment({ mode: 'production', ...overrides });

  it('routes production self-host services and sync through the served origin', () => {
    const deployment = production({
      localBackendOrigin: 'same-origin',
      localServers: 'ALL',
      pageOrigin: 'https://collab.example.test',
    });

    expect(deployment.kind).toBe('self-hosted');
    if (deployment.kind !== 'self-hosted') {
      throw new Error('expected self-hosted');
    }
    expect(deployment.proxyOrigin).toBe('https://collab.example.test');
    expect(deployment.syncWorker).toBe('https://collab.example.test/sync');
    expect(deployment.syncWebSocket).toBe('wss://collab.example.test/sync');

    const hosts = buildSelfHostedServerHosts(deployment.proxyOrigin);
    expect(hosts['auth-service']).toBe('https://collab.example.test/auth');
    expect(hosts['document-storage-service']).toBe(
      'https://collab.example.test/dss'
    );
    expect(hosts['pdf-service']).toBe('https://collab.example.test/pdf');
    expect(
      Object.values(hosts).every(
        (host) => new URL(host).host === 'collab.example.test'
      )
    ).toBe(true);
  });

  it('preserves hosted production defaults when self-host flags are absent', () => {
    expect(production()).toEqual({ kind: 'hosted' });
  });

  it('rejects partial and invalid production self-host configuration', () => {
    expect(() => production({ localBackendOrigin: 'same-origin' })).toThrow();
    expect(() => production({ localServers: 'ALL' })).toThrow();
    expect(() =>
      production({
        localBackendOrigin: 'https://backend.example.test',
        localServers: 'ALL',
      })
    ).toThrow();
  });

  it('fails closed when same-origin cannot be resolved', () => {
    expect(() =>
      production({
        localBackendOrigin: 'same-origin',
        localServers: 'ALL',
      })
    ).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { buildTauriClientConfig } from './tauri-client-config';

describe('Tauri client config', () => {
  it('produces a strict custom standalone config without managed hosts', () => {
    const config = buildTauriClientConfig({
      profile: 'standalone',
      operatorOrigin: 'https://team.example.test:8443',
      extraHttpOrigins: ['https://objects.example.test'],
    });
    const serialized = JSON.stringify(config);
    expect(serialized).toContain('team.example.test');
    expect(serialized).toContain('objects.example.test');
    expect(serialized).toContain('conation');
    expect(serialized).not.toContain('macro.com');
    expect(config.plugins['deep-link'].mobile).toContainEqual({
      host: 'team.example.test',
      pathPrefix: ['/app'],
    });
  });

  it('rejects a managed host in standalone mode', () => {
    expect(() =>
      buildTauriClientConfig({
        profile: 'standalone',
        operatorOrigin: 'https://macro.com',
      })
    ).toThrow('managed legacy host');
  });

  it('rejects the removed hosted legacy profile', () => {
    expect(() =>
      buildTauriClientConfig({ profile: 'hosted-legacy' })
    ).toThrow('has been removed');
  });

  it('allows a LAN operator proxy and keeps loopback HTTP', () => {
    const serialized = JSON.stringify(
      buildTauriClientConfig({
        profile: 'standalone',
        operatorOrigin: 'http://192.0.2.10:8090',
      })
    );
    expect(serialized).toContain('http://192.0.2.10:8090/**');
    expect(serialized).toContain('http://localhost:*');
    expect(serialized).not.toContain('macro.com');
    expect(serialized).not.toContain('conation.dev');
  });
});

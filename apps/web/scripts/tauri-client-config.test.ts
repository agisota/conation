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

  it('includes old hosts only for an explicit hosted legacy profile', () => {
    const config = buildTauriClientConfig({ profile: 'hosted-legacy' });
    expect(JSON.stringify(config)).toContain('macro.com');
    expect(config.plugins['deep-link'].desktop.schemes).toEqual(['macro']);
  });
});

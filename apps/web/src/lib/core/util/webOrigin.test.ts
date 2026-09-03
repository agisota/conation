import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWebOrigin } from './webOrigin';

function setTauri(enabled: boolean) {
  if (enabled) {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
  } else {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  }
}

afterEach(() => {
  setTauri(false);
  vi.unstubAllEnvs();
});

describe('getWebOrigin', () => {
  it('uses the current page origin for a browser bundle', () => {
    expect(getWebOrigin()).toBe(window.location.origin);
  });

  it('uses the configured standalone operator origin in Tauri', () => {
    vi.stubEnv('VITE_CONATION_CLIENT_PROFILE', 'standalone');
    vi.stubEnv(
      'VITE_CONATION_OPERATOR_ORIGIN',
      'https://operator.example.test:8443'
    );
    setTauri(true);
    expect(getWebOrigin()).toBe('https://operator.example.test:8443');
  });

  it('does not silently accept a managed Macro origin in standalone mode', () => {
    vi.stubEnv('VITE_CONATION_CLIENT_PROFILE', 'standalone');
    vi.stubEnv('VITE_CONATION_OPERATOR_ORIGIN', 'https://macro.com');
    setTauri(true);
    expect(() => getWebOrigin()).toThrow('managed legacy host');
  });
});

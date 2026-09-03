import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseInternalAppLink } from './macroAppUrl';

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

beforeEach(() => {
  vi.stubEnv('VITE_CONATION_OPERATOR_ORIGIN', 'https://conation.dev');
});

describe('parseInternalAppLink', () => {
  it('parses a same-host app link into path and query', () => {
    expect(
      parseInternalAppLink('http://localhost/app/component/abc?foo=bar')
    ).toEqual({ path: '/component/abc', query: 'foo=bar' });
  });

  it('maps a bare /app path to the router root', () => {
    expect(parseInternalAppLink('http://localhost/app')).toEqual({
      path: '/',
      query: '',
    });
  });

  it('accepts same-host links', () => {
    expect(
      parseInternalAppLink('http://localhost:3000/app/channel/123')
    ).toEqual({ path: '/channel/123', query: '' });
  });

  it('strips a www prefix from the hostname', () => {
    expect(parseInternalAppLink('http://www.localhost/app/x')).toEqual({
      path: '/x',
      query: '',
    });
  });

  it('does not treat a mid-string www. as an operator host', () => {
    // Only a leading `www.` is stripped, so a mid-string occurrence must not
    // collapse to the configured operator host.
    setTauri(true);
    expect(
      parseInternalAppLink('https://conation.www.dev/app/component/abc')
    ).toBeNull();
  });

  it('rejects non-/app paths on the current host', () => {
    expect(parseInternalAppLink('http://localhost/pricing')).toBeNull();
    expect(parseInternalAppLink('http://localhost/apple')).toBeNull();
  });

  it('rejects /app paths on foreign hosts', () => {
    expect(
      parseInternalAppLink('https://evil.com/app/component/abc')
    ).toBeNull();
  });

  it('rejects the operator host outside Tauri when it is not the page host', () => {
    expect(
      parseInternalAppLink('https://conation.dev/app/component/abc')
    ).toBeNull();
  });

  it('accepts the configured operator host under Tauri', () => {
    setTauri(true);
    expect(
      parseInternalAppLink('https://conation.dev/app/component/abc')
    ).toEqual({
      path: '/component/abc',
      query: '',
    });
  });

  it('rejects managed Macro hosts in the standalone Tauri profile', () => {
    setTauri(true);
    expect(
      parseInternalAppLink('https://macro.com/app/component/abc')
    ).toBeNull();
  });

  it('accepts operator links under Tauri when served from tauri.localhost', () => {
    // Under the http asset scheme (e.g. Windows/Android) the webview origin is
    // tauri.localhost, not localhost.
    setTauri(true);
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { hostname: 'tauri.localhost' },
    });
    try {
      expect(
        parseInternalAppLink('https://conation.dev/app/component/abc')
      ).toEqual({ path: '/component/abc', query: '' });
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: original,
      });
    }
  });

  it('rejects managed links even when a stale legacy profile variable exists', () => {
    vi.stubEnv('VITE_CONATION_CLIENT_PROFILE', 'hosted-legacy');
    setTauri(true);
    expect(
      parseInternalAppLink('https://macro.com/app/component/abc')
    ).toBeNull();
  });

  it('rejects invalid urls', () => {
    expect(parseInternalAppLink('not a url')).toBeNull();
    expect(parseInternalAppLink('/app/component/abc')).toBeNull();
  });
});

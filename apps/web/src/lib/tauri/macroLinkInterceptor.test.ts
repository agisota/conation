// @vitest-environment jsdom

import { emit } from '@tauri-apps/api/event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openMacroLinkInApp } from './macroLinkInterceptor';

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

vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(() => Promise.resolve()),
}));

afterEach(() => {
  setTauri(false);
  vi.mocked(emit).mockClear();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.stubEnv('VITE_CONATION_CLIENT_PROFILE', 'standalone');
  vi.stubEnv('VITE_CONATION_OPERATOR_ORIGIN', 'https://conation.dev');
});

describe('openMacroLinkInApp', () => {
  it('does nothing outside of Tauri', () => {
    expect(openMacroLinkInApp('https://conation.dev/app/component/abc')).toBe(
      false
    );
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits a navigate event for app links under Tauri', () => {
    setTauri(true);
    expect(
      openMacroLinkInApp('https://conation.dev/app/channel/123?message=456')
    ).toBe(true);
    expect(emit).toHaveBeenCalledWith('navigate', {
      path: '/channel/123',
      query: 'message=456',
    });
  });

  it('leaves external links alone under Tauri', () => {
    setTauri(true);
    expect(openMacroLinkInApp('https://github.com/macro-inc')).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('falls back to the system browser when the navigate event fails to dispatch', async () => {
    setTauri(true);
    vi.mocked(emit).mockRejectedValueOnce(new Error('ipc down'));
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    expect(openMacroLinkInApp('https://conation.dev/app/channel/123')).toBe(
      true
    );
    // The window.open fallback runs in the emit-rejection microtask.
    await vi.waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        'https://conation.dev/app/channel/123',
        '_blank',
        'noopener,noreferrer'
      )
    );

    openSpy.mockRestore();
  });
});

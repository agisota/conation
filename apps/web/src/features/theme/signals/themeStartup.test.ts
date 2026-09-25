import { describe, expect, it } from 'vitest';
import { initialModeTheme, initialThemeMode } from './themeStartup';

function stored(values: Record<string, string>) {
  return { getItem: (key: string) => values[key] ?? null };
}

describe('initial appearance for existing and new profiles', () => {
  it('pins a profile without any prior appearance state to light', () => {
    expect(initialThemeMode(stored({}), 'dark')).toBe('light');
  });

  it('does not mistake defaults persisted during initialization for a returning choice', () => {
    expect(
      initialThemeMode(stored({ 'macro-user-themes': '[]' }), 'dark', false)
    ).toBe('light');
  });

  it('keeps the new light default after its theme key is persisted on reload', () => {
    expect(
      initialThemeMode(
        stored({
          'macro-selected-theme': '"Rox Warm Light"',
          'html-color-theme': '{"color":"#eee","mode":"light"}',
        }),
        'light'
      )
    ).toBe('light');
  });

  it('keeps an old auto-detect choice and a saved system choice', () => {
    expect(
      initialThemeMode(
        stored({ 'macro-theme-should-match-system': 'true' }),
        'light'
      )
    ).toBe('system');
    expect(
      initialThemeMode(
        stored({
          'macro-theme-mode': '"system"',
          'macro-theme-should-match-system': 'false',
        }),
        'dark'
      )
    ).toBe('system');
  });

  it('keeps a modern explicit fixed mode ahead of contradictory legacy data', () => {
    expect(
      initialThemeMode(
        stored({
          'macro-theme-mode': '"light"',
          'macro-theme-should-match-system': 'true',
        }),
        'dark'
      )
    ).toBe('light');
    expect(
      initialThemeMode(
        stored({
          'macro-theme-mode': '"dark"',
          'macro-theme-should-match-system': 'true',
        }),
        'light'
      )
    ).toBe('dark');
  });

  it('keeps an explicit pinned light or dark choice from the old setting', () => {
    expect(
      initialThemeMode(
        stored({
          'macro-theme-should-match-system': 'false',
          'macro-selected-theme': '"Paper"',
        }),
        'light'
      )
    ).toBe('light');
    expect(
      initialThemeMode(
        stored({
          'macro-theme-should-match-system': 'false',
          'macro-selected-theme': '"Macro Dark"',
        }),
        'dark'
      )
    ).toBe('dark');
  });

  it('does not reclassify a returning profile without the modern mode key as new', () => {
    expect(
      initialThemeMode(stored({ 'macro-selected-theme': '"Paper"' }), 'light')
    ).toBe('system');
    expect(
      initialThemeMode(stored({ 'html-color-theme': '{"color":"#000"}' }))
    ).toBe('system');
  });

  it('restores a legacy selected custom theme without overwriting its per-mode choice', () => {
    expect(
      initialModeTheme(
        stored({ 'macro-selected-theme': '"personal-dark"' }),
        'dark',
        'personal-dark',
        'Macro Dark'
      )
    ).toBe('personal-dark');
    expect(
      initialModeTheme(
        stored({
          'macro-selected-theme': '"personal-dark"',
          'macro-dark-mode-theme': '"Macro Gruvbox"',
        }),
        'dark',
        'personal-dark',
        'Macro Dark'
      )
    ).toBe('Macro Gruvbox');
  });
});

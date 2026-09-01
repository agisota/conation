import { setLocale, t } from '@app/lib/i18n';
import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_DARK_THEME, DEFAULT_LIGHT_THEME } from './constants';
import { macroGruvboxTheme } from './themes/macro-gruvbox';

const themeSources = import.meta.glob('./**/*.{ts,tsx}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

const themeKeys = (catalog: Record<string, string>) =>
  Object.keys(catalog)
    .filter((key) => key.startsWith('theme.'))
    .sort();

describe('theme localization', () => {
  afterEach(() => setLocale('en'));

  it('keeps complete English and Russian theme catalogs', () => {
    expect(themeKeys(en)).toHaveLength(52);
    expect(themeKeys(ru)).toEqual(themeKeys(en));

    for (const key of themeKeys(en)) {
      expect(ru[key as keyof typeof ru], key).not.toBe('');
      expect(ru[key as keyof typeof ru], key).not.toBe(
        en[key as keyof typeof en]
      );
    }
  });

  it('localizes display copy without renaming persisted theme identifiers', () => {
    setLocale('ru');

    expect(t('theme.system.conationDark')).toBe('Conation — тёмная');
    expect(t('theme.ramp.position', { token: 'surface-2' })).toBe(
      'Положение surface-2 на градиенте'
    );
    expect(DEFAULT_DARK_THEME).toBe('Macro Dark');
    expect(DEFAULT_LIGHT_THEME).toBe('Macro Light');
    expect(macroGruvboxTheme.id).toBe('Macro-Gruvbox');
  });

  it('does not use opaque localization keys in theme source', () => {
    for (const [path, source] of Object.entries(themeSources)) {
      expect(source, path).not.toMatch(/\bt\(['"]auto\./);
    }
  });
});

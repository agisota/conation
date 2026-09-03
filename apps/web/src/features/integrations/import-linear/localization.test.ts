import { setLocale, t } from '@app/lib/i18n';
import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import { afterEach, describe, expect, it } from 'vitest';

const linearSources = import.meta.glob('./**/*.{ts,tsx}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

const linearKeys = (catalog: Record<string, string>) =>
  Object.keys(catalog)
    .filter((key) => key.startsWith('integrations.linear.'))
    .sort();

describe('Linear import localization', () => {
  afterEach(() => setLocale('en'));

  it('keeps complete English and Russian Linear import catalogs', () => {
    expect(linearKeys(en)).toHaveLength(26);
    expect(linearKeys(ru)).toEqual(linearKeys(en));

    for (const key of linearKeys(en)) {
      expect(ru[key as keyof typeof ru], key).not.toBe('');
      expect(ru[key as keyof typeof ru], key).not.toBe(
        en[key as keyof typeof en]
      );
    }
  });

  it('uses Russian task and row plural forms', () => {
    setLocale('ru');

    expect(t('integrations.linear.rows', { count: 1 })).toBe('1 строка');
    expect(t('integrations.linear.rows', { count: 2 })).toBe('2 строки');
    expect(t('integrations.linear.rows', { count: 5 })).toBe('5 строк');
    expect(t('integrations.linear.toast.imported', { count: 5 })).toBe(
      'Импортировано 5 задач'
    );
  });

  it('does not use opaque localization keys in Linear import source', () => {
    for (const [path, source] of Object.entries(linearSources)) {
      expect(source, path).not.toMatch(/\bt\(['"]auto\./);
    }
  });
});

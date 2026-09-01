import { setLocale, t } from '@app/lib/i18n';
import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import { afterEach, describe, expect, it } from 'vitest';

const widgetSources = import.meta.glob('./**/*.{ts,tsx}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

const widgetKeys = (catalog: Record<string, string>) =>
  Object.keys(catalog)
    .filter((key) => key.startsWith('dynamicUi.widgets.'))
    .sort();

describe('dynamic UI widget localization', () => {
  afterEach(() => setLocale('en'));

  it('keeps translated widget empty states in both catalogs', () => {
    expect(widgetKeys(en)).toHaveLength(2);
    expect(widgetKeys(ru)).toEqual(widgetKeys(en));
    expect(ru['dynamicUi.widgets.list.empty']).not.toBe(
      en['dynamicUi.widgets.list.empty']
    );
    expect(ru['dynamicUi.widgets.timeline.empty']).not.toBe(
      en['dynamicUi.widgets.timeline.empty']
    );
  });

  it('renders Russian widget empty states', () => {
    setLocale('ru');

    expect(t('dynamicUi.widgets.list.empty')).toBe('Нет объектов.');
    expect(t('dynamicUi.widgets.timeline.empty')).toBe('Нет событий.');
  });

  it('does not use opaque localization keys in widget source', () => {
    for (const [path, source] of Object.entries(widgetSources)) {
      expect(source, path).not.toMatch(/\bt\(['"]auto\./);
    }
  });
});

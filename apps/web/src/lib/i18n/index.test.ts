import IntlMessageFormat from 'intl-messageformat';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  DEFAULT_LOCALE,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  getAcceptLanguage,
  initI18n,
  LOCALE_STORAGE_KEY,
  resolveLocale,
  setLocale,
  t,
} from '.';
import en from './locales/en.json';
import ru from './locales/ru.json';

const enCatalog = en as Record<string, string>;
const ruCatalog = ru as Record<string, string>;

describe('i18n locale ownership', () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale('en');
  });

  afterEach(() => {
    setLocale('en');
  });

  test('resolves explicit preferences and falls back to Russian', () => {
    expect(resolveLocale(['ru-RU', 'en-US'])).toBe('ru');
    expect(resolveLocale(['de-DE', 'en-GB'])).toBe('en');
    expect(resolveLocale(['de-DE'])).toBe(DEFAULT_LOCALE);
    expect(DEFAULT_LOCALE).toBe('ru');
  });

  test('persists selection and synchronizes the document language', () => {
    initI18n();
    setLocale('ru');

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ru');
    expect(document.documentElement.lang).toBe('ru');
    expect(getAcceptLanguage()).toBe('ru-RU');
  });

  test('resets to the default locale when another tab removes the preference', () => {
    initI18n();
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: LOCALE_STORAGE_KEY,
        newValue: null,
      })
    );

    expect(getAcceptLanguage()).toBe('ru-RU');
    expect(t('settings.account.language.label')).toBe('Язык');
    expect(document.documentElement.lang).toBe('ru');
  });

  test('falls back to the English source message', () => {
    const translated = ruCatalog['common.close'];
    delete ruCatalog['common.close'];
    try {
      setLocale('ru');
      expect(t('common.close')).toBe('Close');
    } finally {
      if (translated) ruCatalog['common.close'] = translated;
    }
  });

  test('returns the key when neither locale defines it', () => {
    expect(t('missing.semantic.key')).toBe('missing.semantic.key');
  });

  test('translates the deployed-version refresh message', () => {
    setLocale('en');
    expect(t('app.update.refreshRequired')).toContain('Refresh the page');

    setLocale('ru');
    expect(t('app.update.refreshRequired')).toContain('Обновите страницу');
  });

  test('keeps canonical catalogs semantic and supplies Russian fallback coverage', () => {
    const sourceKeys = Object.keys(enCatalog);
    const russianKeys = Object.keys(ruCatalog);

    expect(sourceKeys.filter((key) => key.startsWith('auto.'))).toEqual([]);
    expect(russianKeys.filter((key) => key.startsWith('auto.'))).toEqual([]);
    expect(sourceKeys.filter((key) => !(key in ruCatalog))).toEqual([]);
  });

  test('parses every canonical message as ICU MessageFormat', () => {
    const invalidMessages: string[] = [];
    for (const [locale, catalog] of [
      ['en-US', enCatalog],
      ['ru-RU', ruCatalog],
    ] as const) {
      for (const [key, message] of Object.entries(catalog)) {
        try {
          new IntlMessageFormat(message, locale);
        } catch {
          invalidMessages.push(`${locale}:${key}`);
        }
      }
    }

    expect(invalidMessages).toEqual([]);
  });
});

describe('ICU messages and locale formatting', () => {
  afterEach(() => setLocale('en'));

  test('uses English and Russian plural categories', () => {
    setLocale('en');
    expect(t('notifications.summary', { count: 1 })).toBe('1 notification');
    expect(t('notifications.summary', { count: 2 })).toBe('2 notifications');

    setLocale('ru');
    expect(t('notifications.summary', { count: 1 })).toBe('1 уведомление');
    expect(t('notifications.summary', { count: 2 })).toBe('2 уведомления');
    expect(t('notifications.summary', { count: 5 })).toBe('5 уведомлений');
    expect(t('notifications.summary', { count: 21 })).toBe('21 уведомление');
  });

  test('uses Russian forms in shared previews and activity results', () => {
    setLocale('ru');

    expect(t('channel.thread.moreReplies', { count: 1 })).toBe('Ещё 1 ответ');
    expect(t('channel.thread.moreReplies', { count: 2 })).toBe('Ещё 2 ответа');
    expect(t('channel.thread.moreReplies', { count: 5 })).toBe('Ещё 5 ответов');
    expect(t('editor.wordcount.words', { count: 21 })).toBe('слово');
    expect(t('core.itemPreview.attendees', { count: 5 })).toBe('5 участников');
    expect(
      t('ai.tools.activity.resultCount', {
        count: 5,
        truncated: 'true',
      })
    ).toBe('5+ действий');
  });

  test('formats ICU select messages', () => {
    setLocale('ru');
    expect(t('settings.account.language.option', { locale: 'en' })).toBe(
      'Английский'
    );
    expect(t('settings.account.language.option', { locale: 'ru' })).toBe(
      'Русский'
    );
  });

  test('formats numbers, dates, and relative time with the selected locale', () => {
    const instant = new Date('2024-01-02T12:00:00Z');

    setLocale('en');
    const englishNumber = formatNumber(1234.5);
    const englishDate = formatDateTime(instant, {
      dateStyle: 'long',
      timeZone: 'UTC',
    });
    expect(formatRelativeTime(-2, 'day')).toContain('ago');

    setLocale('ru');
    const russianNumber = formatNumber(1234.5);
    const russianDate = formatDateTime(instant, {
      dateStyle: 'long',
      timeZone: 'UTC',
    });
    expect(formatRelativeTime(-2, 'day')).toContain('назад');

    expect(russianNumber).not.toBe(englishNumber);
    expect(russianDate).not.toBe(englishDate);
  });
});

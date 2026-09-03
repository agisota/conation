import { setLocale, t } from '@app/lib/i18n';
import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import { afterEach, describe, expect, test } from 'vitest';

const englishCatalog = en as Record<string, string>;
const russianCatalog = ru as Record<string, string>;
const localeNeutralCalendarTemplates = new Set([
  'calendar.event.schedule.timedSingle',
  'calendar.event.schedule.timedRange',
]);

describe('calendar localization', () => {
  afterEach(() => setLocale('en'));

  test('has an idiomatic Russian value for every semantic calendar key', () => {
    const calendarKeys = Object.keys(englishCatalog).filter((key) =>
      key.startsWith('calendar.')
    );

    expect(calendarKeys.length).toBeGreaterThan(60);
    for (const key of calendarKeys) {
      expect(russianCatalog[key], key).toBeTypeOf('string');
      expect(russianCatalog[key]?.trim(), key).not.toBe('');
      if (!localeNeutralCalendarTemplates.has(key)) {
        expect(russianCatalog[key], key).not.toBe(englishCatalog[key]);
      }
    }
  });

  test('selects Russian recurrence units by frequency and plural category', () => {
    setLocale('ru');

    expect(
      t('calendar.recurrence.frequencyUnit', {
        frequency: 'DAILY',
        count: 1,
      })
    ).toBe('день');
    expect(
      t('calendar.recurrence.frequencyUnit', {
        frequency: 'WEEKLY',
        count: 2,
      })
    ).toBe('недели');
    expect(
      t('calendar.recurrence.frequencyUnit', {
        frequency: 'MONTHLY',
        count: 5,
      })
    ).toBe('месяцев');
    expect(
      t('calendar.recurrence.frequencyUnit', {
        frequency: 'YEARLY',
        count: 21,
      })
    ).toBe('год');
  });

  test('keeps English as the source locale for recurrence messages', () => {
    setLocale('en');

    expect(
      t('calendar.recurrence.frequencyUnit', {
        frequency: 'WEEKLY',
        count: 2,
      })
    ).toBe('weeks');
    expect(t('calendar.recurrence.occurrences', { count: 1 })).toBe(
      'occurrence'
    );
    expect(t('calendar.recurrence.occurrences', { count: 3 })).toBe(
      'occurrences'
    );
  });
});

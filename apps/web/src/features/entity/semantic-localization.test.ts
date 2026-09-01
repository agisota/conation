import { setLocale, t } from '@app/lib/i18n';
import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMonthName, formatStreak } from '../activity/activity-stats';
import { formatRelativeTimestamp } from './utils/timestamp';

const OWNED_PREFIXES = [
  'entity.',
  'activity.',
  'contacts.',
  'inbox.',
  'sharing.',
  'invitations.',
  'reminders.',
] as const;

const ownedSources = import.meta.glob(
  [
    './**/*.ts',
    './**/*.tsx',
    '../activity/**/*.ts',
    '../activity/**/*.tsx',
    '../reminders/**/*.ts',
    '../reminders/**/*.tsx',
    '../sharing/**/*.ts',
    '../sharing/**/*.tsx',
    '../contacts/**/*.ts',
    '../contacts/**/*.tsx',
    '../inbox/**/*.ts',
    '../inbox/**/*.tsx',
    '../team-invitations/**/*.ts',
    '../team-invitations/**/*.tsx',
    '../channel-invitations/**/*.ts',
    '../channel-invitations/**/*.tsx',
    '!./**/*.test.ts',
    '!./**/*.test.tsx',
    '!../**/*.test.ts',
    '!../**/*.test.tsx',
  ],
  {
    eager: true,
    import: 'default',
    query: '?raw',
  }
) as Record<string, string>;

const ownedKeys = (catalog: Record<string, string>) =>
  Object.keys(catalog)
    .filter((key) => OWNED_PREFIXES.some((prefix) => key.startsWith(prefix)))
    .sort();

afterEach(() => {
  setLocale('en');
  vi.useRealTimers();
});

describe('entity and related feature localization', () => {
  it('keeps every owned semantic key in both catalogs with Russian copy', () => {
    expect(ownedKeys(ru)).toEqual(ownedKeys(en));
    expect(ownedKeys(en).length).toBeGreaterThan(175);

    for (const key of ownedKeys(en)) {
      expect(ru[key as keyof typeof ru], key).not.toBe('');
      expect(ru[key as keyof typeof ru], key).not.toBe(
        en[key as keyof typeof en]
      );
    }
  });

  it('does not use opaque auto keys in owned production sources', () => {
    for (const [path, source] of Object.entries(ownedSources)) {
      expect(source, path).not.toMatch(/\bt\(['"]auto\./);
    }
  });

  it('uses Russian plural forms without changing numeric values', () => {
    setLocale('ru');

    expect(t('entity.selection.count', { count: 1 })).toBe('Выбран 1 объект');
    expect(t('entity.selection.count', { count: 2 })).toBe('Выбрано 2 объекта');
    expect(t('entity.selection.count', { count: 5 })).toBe(
      'Выбрано 5 объектов'
    );
    expect(t('activity.actionCount', { count: 21 })).toBe('21 действие');
    expect(t('invitations.referral.sent', { count: 5 })).toBe(
      'Отправлено 5 приглашений'
    );
  });

  it('renders representative Russian feature copy and activity dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T12:00:00Z'));
    setLocale('ru');

    expect(t('inbox.add.description')).toBe(
      'Подключить к Conation ещё один аккаунт Gmail?'
    );
    expect(t('contacts.emails.empty', { signal: 'signal', view: 'me' })).toBe(
      'Нет сигнальных писем от этого контакта в вашей почте.'
    );
    expect(formatMonthName('2026-08').toLocaleLowerCase('ru-RU')).toContain(
      'август'
    );
    expect(formatStreak(5)).toBe('5 дн.');
    expect(formatRelativeTimestamp(new Date('2026-08-21T11:55:00Z'))).toBe(
      '5 минут назад'
    );
  });
});

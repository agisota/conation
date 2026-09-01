import { setLocale, t } from '@app/lib/i18n';
import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import { afterEach, describe, expect, test } from 'vitest';
import { formatRecentSessionTime } from './format-recent-session-time';

const shellKeys = (catalog: Record<string, string>) =>
  Object.keys(catalog)
    .filter((key) => key.startsWith('shell.'))
    .sort();

describe('app shell localization', () => {
  afterEach(() => setLocale('en'));

  test('keeps the English and Russian shell catalogs in parity', () => {
    const englishKeys = shellKeys(en);
    expect(englishKeys.length).toBeGreaterThan(200);
    expect(shellKeys(ru)).toEqual(englishKeys);
  });

  test('renders visible command and branded onboarding copy in both locales', () => {
    setLocale('en');
    expect(t('shell.command.searchFor', { query: 'roadmap' })).toBe(
      'Search for “roadmap”'
    );
    expect(t('shell.gettingStarted.welcomeToConation')).toBe(
      'Welcome to Conation'
    );

    setLocale('ru');
    expect(t('shell.command.searchFor', { query: 'план' })).toBe(
      'Искать «план»'
    );
    expect(t('shell.gettingStarted.welcomeToConation')).toBe(
      'Добро пожаловать в Conation'
    );
  });

  test('uses Russian plural and select grammar for dynamic shell copy', () => {
    setLocale('ru');
    expect(t('shell.composer.attachmentCount', { count: 1 })).toBe(
      '1 вложение'
    );
    expect(t('shell.composer.attachmentCount', { count: 2 })).toBe(
      '2 вложения'
    );
    expect(t('shell.composer.attachmentCount', { count: 5 })).toBe(
      '5 вложений'
    );
    expect(
      t('shell.sidebar.teamInvitationDescription', {
        inviter: 'Анна',
        role: 'admin',
      })
    ).toBe('Анна приглашает вас в команду как администратора.');
  });

  test('localizes relative session times instead of using an English-only formatter', () => {
    const now = new Date('2026-09-01T12:00:00Z');
    const earlier = '2026-09-01T10:00:00Z';

    setLocale('en');
    expect(formatRecentSessionTime(earlier, now)).toBe('2 hours ago');

    setLocale('ru');
    expect(formatRecentSessionTime(earlier, now)).toBe('2 часа назад');
  });

  test('provides translated descriptions for every paywall reason', () => {
    const reasons = [
      'PROJECT_LIMIT',
      'FILE_LIMIT',
      'IMAGE_LIMIT',
      'CHAT_LIMIT',
      'O1_LIMIT',
      'CANVAS_CLIKED',
      'SAVED_PROMPT',
      'REMOVE_SIGNATURE',
      'MULTI_INBOX',
      'TEAMS',
    ];

    setLocale('ru');
    for (const reason of reasons) {
      const key = `shell.paywall.limit.${reason}.description`;
      expect(t(key)).not.toBe(key);
    }
  });
});

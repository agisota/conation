import { setLocale, t } from '@app/lib/i18n';
import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ACCOUNT_DELETION_FEEDBACK_MAX_LENGTH,
  ACCOUNT_DELETION_REASON_OPTIONS,
  buildAccountDeletionFeedbackPayload,
  performAccountDeletion,
} from './account-deletion-feedback';

afterEach(() => setLocale('en'));

describe('Account message catalog', () => {
  it('has a non-English Russian message for every semantic Account key', () => {
    const englishMessages: Record<string, string> = en;
    const russianMessages: Record<string, string> = ru;
    const accountKeys = Object.keys(englishMessages)
      .filter((key) => key.startsWith('settings.account.'))
      .sort();

    expect(
      Object.keys(russianMessages)
        .filter((key) => key.startsWith('settings.account.'))
        .sort()
    ).toEqual(accountKeys);

    const languageNeutralKeys = new Set([
      'settings.account.update.version.source.ota',
    ]);
    expect(
      accountKeys.filter(
        (key) =>
          !languageNeutralKeys.has(key) &&
          russianMessages[key] === englishMessages[key]
      )
    ).toEqual([]);
  });

  it('formats localized updater values through the ICU message path', () => {
    setLocale('en');
    expect(
      t('settings.account.update.status.available', { version: '2.5.0' })
    ).toBe('Update available: v2.5.0');
    expect(
      t('settings.account.update.status.downloading', { progress: 42 })
    ).toBe('Downloading: 42%');

    setLocale('ru');
    expect(
      t('settings.account.update.status.available', { version: '2.5.0' })
    ).toBe('Доступно обновление: v2.5.0');
    expect(
      t('settings.account.update.status.downloading', { progress: 42 })
    ).toBe('Загрузка: 42 %');
  });
});

describe('ACCOUNT_DELETION_REASON_OPTIONS', () => {
  it('keeps analytics reason values stable while localizing their labels', () => {
    expect(ACCOUNT_DELETION_REASON_OPTIONS.map(({ value }) => value)).toEqual([
      'not_using_enough',
      'missing_features',
      'difficult_to_use',
      'bugs_or_performance',
      'too_expensive',
      'prefer_another_product',
      'privacy_or_security_concerns',
      'other',
    ]);

    setLocale('en');
    expect(
      ACCOUNT_DELETION_REASON_OPTIONS.map(({ labelKey }) => t(labelKey))
    ).toEqual([
      "I don't use Conation enough",
      "I'm missing features I need",
      'Conation is difficult to use',
      "I've experienced bugs or performance issues",
      'Conation is too expensive',
      'I prefer another product',
      'I have privacy or security concerns',
      'Other',
    ]);

    setLocale('ru');
    expect(
      ACCOUNT_DELETION_REASON_OPTIONS.map(({ labelKey }) => t(labelKey))
    ).toEqual([
      'Я редко пользуюсь Conation',
      'Мне не хватает нужных функций',
      'Conation сложно пользоваться',
      'Ошибки или низкая производительность',
      'Conation стоит слишком дорого',
      'Я предпочитаю другой продукт',
      'Меня беспокоят конфиденциальность или безопасность',
      'Другая причина',
    ]);
  });
});

describe('buildAccountDeletionFeedbackPayload', () => {
  it('normalizes an unanswered survey', () => {
    expect(buildAccountDeletionFeedbackPayload(undefined, '   ')).toEqual({
      reason: 'not_provided',
    });
  });

  it('trims feedback and preserves the selected reason', () => {
    expect(
      buildAccountDeletionFeedbackPayload(
        'missing_features',
        '  I need offline access.  '
      )
    ).toEqual({
      reason: 'missing_features',
      feedback: 'I need offline access.',
    });
  });

  it('limits feedback to the maximum PostHog property length', () => {
    const feedback = 'a'.repeat(ACCOUNT_DELETION_FEEDBACK_MAX_LENGTH + 1);

    expect(buildAccountDeletionFeedbackPayload('other', feedback)).toEqual({
      reason: 'other',
      feedback: 'a'.repeat(ACCOUNT_DELETION_FEEDBACK_MAX_LENGTH),
    });
  });
});

describe('performAccountDeletion', () => {
  it('captures feedback before deleting and logs out after success', async () => {
    const calls: string[] = [];

    const deleted = await performAccountDeletion({
      captureFeedback: () => calls.push('capture-feedback'),
      deleteUser: async () => {
        calls.push('delete-user');
        return { isErr: () => false };
      },
      logout: async () => {
        calls.push('logout');
      },
    });

    expect(deleted).toBe(true);
    expect(calls).toEqual(['capture-feedback', 'delete-user', 'logout']);
  });

  it('does not log out when account deletion fails', async () => {
    const calls: string[] = [];

    const deleted = await performAccountDeletion({
      captureFeedback: () => calls.push('capture-feedback'),
      deleteUser: async () => {
        calls.push('delete-user');
        return { isErr: () => true };
      },
      logout: async () => {
        calls.push('logout');
      },
    });

    expect(deleted).toBe(false);
    expect(calls).toEqual(['capture-feedback', 'delete-user']);
  });
});

import { afterEach, describe, expect, test } from 'vitest';
import { setLocale, t } from '../../lib/i18n';

afterEach(() => setLocale('en'));

describe('authentication and onboarding localization', () => {
  test('uses Conation product copy in the English source locale', () => {
    setLocale('en');

    expect(t('auth.welcome.title')).toBe('Welcome to Conation');
    expect(t('setup.team.title')).toBe('Conation is meant for teams');
  });

  test('renders Russian authentication and setup copy', () => {
    setLocale('ru');

    expect(t('auth.methods.continueWithGoogle')).toBe('Продолжить с Google');
    expect(t('onboarding.tutorial.skipLesson')).toBe('Пропустить урок');
    expect(t('setup.connectors.connectFailed', { connector: 'GitHub' })).toBe(
      'Не удалось подключить GitHub'
    );
  });

  test('applies Russian plural categories to setup messages', () => {
    setLocale('ru');

    expect(t('setup.team.createAndInvite', { count: 1 })).toContain(
      '1 человека'
    );
    expect(t('setup.team.createAndInvite', { count: 2 })).toContain(
      '2 человек'
    );
    expect(t('setup.team.createAndInvite', { count: 5 })).toContain(
      '5 человек'
    );
    expect(t('setup.summary.email.contactsFound', { count: 21 })).toBe(
      'пока найден 21 контакт'
    );
    expect(
      t('setup.summary.sources.linear.imported', {
        connector: 'Linear',
        count: 2,
      })
    ).toBe('2 задачи из Linear уже в рабочем пространстве.');
    expect(
      t('setup.summary.sources.slack.imported', {
        connector: 'Slack',
        count: 5,
      })
    ).toBe('5 каналов из Slack уже в рабочем пространстве.');
  });
});

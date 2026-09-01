import { setLocale, t } from '@app/lib/i18n';
import { afterEach, describe, expect, test } from 'vitest';
import promptSource from './constant/prompts.ts?raw';

describe('AI localization', () => {
  afterEach(() => setLocale('en'));

  test('renders Conation MCP copy in English and Russian', () => {
    setLocale('en');
    expect(t('ai.mcp.heading')).toBe('Connect AI to Conation');
    expect(t('ai.consent.accept')).toBe('Accept');

    setLocale('ru');
    expect(t('ai.mcp.heading')).toBe('Подключите ИИ к Conation');
    expect(t('ai.consent.accept')).toBe('Принять');
  });

  test('uses Russian plural categories for AI tool results', () => {
    setLocale('ru');

    expect(t('ai.tools.notifications.markSeen', { count: 1 })).toBe(
      'Отметить 1 уведомление просмотренным'
    );
    expect(t('ai.tools.notifications.markSeen', { count: 2 })).toBe(
      'Отметить 2 уведомления просмотренными'
    );
    expect(t('ai.tools.notifications.markSeen', { count: 5 })).toBe(
      'Отметить 5 уведомлений просмотренными'
    );
    expect(t('ai.tools.notifications.markSeen', { count: 21 })).toBe(
      'Отметить 21 уведомление просмотренным'
    );
  });

  test('formats nested select and plural states in both locales', () => {
    setLocale('en');
    expect(
      t('ai.tools.notifications.markDone', { count: 2, state: 'notDone' })
    ).toBe('Mark 2 notifications not done');

    setLocale('ru');
    expect(
      t('ai.tools.notifications.markDone', { count: 2, state: 'done' })
    ).toBe('Отметить 2 уведомления выполненными');
    expect(
      t('ai.tools.notifications.markDone', { count: 5, state: 'notDone' })
    ).toBe('Отметить 5 уведомлений невыполненными');
  });

  test('uses Conation in the built-in agent instructions', () => {
    expect(promptSource).toContain('Conation is an AI workspace');
    expect(promptSource).not.toContain('Macro is an AI workspace');
  });
});

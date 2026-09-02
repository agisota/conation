import { setLocale, t } from '@app/lib/i18n';
import { afterEach, describe, expect, test } from 'vitest';

describe('channel localization', () => {
  afterEach(() => setLocale('en'));

  test('formats a channel-created event as one localized message', () => {
    setLocale('ru');

    expect(t('channel.message.channelCreated', { name: 'Обсуждение' })).toBe(
      'Канал «Обсуждение» создан'
    );
  });

  test('uses Russian plural categories for bot and call counts', () => {
    setLocale('ru');

    expect(t('channel.call.participantCount', { count: 1 })).toBe('1 участник');
    expect(t('channel.call.participantCount', { count: 2 })).toBe(
      '2 участника'
    );
    expect(t('channel.call.participantCount', { count: 5 })).toBe(
      '5 участников'
    );
    expect(t('channel.call.participantCount', { count: 21 })).toBe(
      '21 участник'
    );
    expect(t('channel.bots.create.assignmentFailed', { count: 2 })).toBe(
      'Не удалось завершить 2 привязки к каналам'
    );
  });

  test('keeps the compatibility-sensitive webhook header unchanged', () => {
    setLocale('ru');

    expect(t('channel.bots.created.tokenHeaderHelp')).toContain(
      'x-conation-channel-bot-token'
    );
  });
});

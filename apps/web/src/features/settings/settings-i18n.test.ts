import { setLocale, t } from '@app/lib/i18n';
import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import { NOTIFICATION_EVENT_GROUPS } from '@notifications/notification-event-catalog';
import { afterEach, describe, expect, it } from 'vitest';
import {
  mutedEntityLabel,
  notificationEventDescription,
  notificationEventLabel,
  notificationGroupLabel,
  settingsGroupLabel,
  settingsTabLabel,
} from './settings-i18n';

afterEach(() => setLocale('en'));

describe('settings localization', () => {
  it('keeps the English and Russian semantic settings catalogs in sync', () => {
    const semanticKeys = Object.keys(en).filter(
      (key) =>
        key.startsWith('settings.navigation.') ||
        key.startsWith('settings.notifications.') ||
        key.startsWith('settings.github.')
    );

    expect(semanticKeys.length).toBeGreaterThan(100);
    for (const key of semanticKeys) {
      expect(ru).toHaveProperty(key);
      expect(ru[key as keyof typeof ru]).not.toBe('');
    }
  });

  it('localizes navigation labels without changing stable tab IDs', () => {
    setLocale('ru');

    expect(settingsGroupLabel('Workspace')).toBe('Рабочее пространство');
    expect(settingsTabLabel('Notifications', 'Notifications')).toBe(
      'Уведомления'
    );
    expect(settingsTabLabel('CRM', 'CRM')).toBe('CRM');
    expect(t('settings.navigation.hotkeys.goToTab', { number: 3 })).toBe(
      'Перейти к вкладке настроек 3'
    );
  });

  it('has Russian copy for every supported notification event', () => {
    setLocale('en');
    const english = NOTIFICATION_EVENT_GROUPS.flatMap((group) =>
      group.events.map((event) => ({
        description: notificationEventDescription(
          event.type,
          event.description
        ),
        label: notificationEventLabel(event.type, event.label),
      }))
    );

    setLocale('ru');
    const russian = NOTIFICATION_EVENT_GROUPS.flatMap((group) =>
      group.events.map((event) => ({
        description: notificationEventDescription(
          event.type,
          event.description
        ),
        label: notificationEventLabel(event.type, event.label),
      }))
    );

    expect(russian).toHaveLength(english.length);
    for (const [index, copy] of russian.entries()) {
      expect(copy.label).not.toBe(english[index]?.label);
      expect(copy.description).not.toBe(english[index]?.description);
    }
  });

  it('localizes notification groups and muted entity types', () => {
    setLocale('ru');

    expect(
      NOTIFICATION_EVENT_GROUPS.map((group) =>
        notificationGroupLabel(group.id, group.label)
      )
    ).toEqual([
      'Каналы',
      'Документы',
      'Задачи',
      'Календарь',
      'Почта',
      'ИИ',
      'GitHub',
    ]);
    expect(mutedEntityLabel('calendar_event', 'Calendar event')).toBe(
      'Событие календаря'
    );
    expect(mutedEntityLabel('email_thread', 'Email')).toBe('Письмо');
  });

  it('preserves unknown catalog values as compatibility fallbacks', () => {
    setLocale('ru');

    expect(settingsGroupLabel('Future group')).toBe('Future group');
    expect(notificationEventLabel('future_event', 'Future event')).toBe(
      'Future event'
    );
    expect(mutedEntityLabel('future_entity', 'future entity')).toBe(
      'future entity'
    );
  });
});

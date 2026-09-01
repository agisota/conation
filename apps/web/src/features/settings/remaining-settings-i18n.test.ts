import { setLocale, t } from '@app/lib/i18n';
import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import { afterEach, describe, expect, it } from 'vitest';

const OWNED_PREFIXES = [
  'settings.admin.',
  'settings.agent.',
  'settings.appearance.',
  'settings.billing.',
  'settings.bots.',
  'settings.connections.',
  'settings.crm.',
  'settings.cursor.',
  'settings.email.',
  'settings.integrations.',
  'settings.mobile.',
  'settings.shortcuts.',
  'settings.tags.',
  'settings.team.',
] as const;

const ownedSettingsSources = import.meta.glob(
  [
    './*.tsx',
    '!./Account.tsx',
    '!./GitHub.tsx',
    '!./Notifications.tsx',
    '!./Settings.tsx',
  ],
  {
    eager: true,
    import: 'default',
    query: '?raw',
  }
) as Record<string, string>;

afterEach(() => setLocale('en'));

describe('remaining settings localization', () => {
  it('keeps every owned semantic key present in both catalogs', () => {
    const keys = Object.keys(en).filter((key) =>
      OWNED_PREFIXES.some((prefix) => key.startsWith(prefix))
    );

    expect(keys.length).toBeGreaterThan(300);
    for (const key of keys) {
      expect(ru).toHaveProperty(key);
      expect(ru[key as keyof typeof ru]).not.toBe('');
    }
  });

  it('does not use opaque auto keys in the owned settings components', () => {
    for (const [path, source] of Object.entries(ownedSettingsSources)) {
      expect(source, path).not.toMatch(/\bt\(['"]auto\./);
    }
  });

  it('formats Russian counts with the correct grammatical forms', () => {
    setLocale('ru');

    expect(t('settings.team.invites.send', { count: 1 })).toBe(
      'Отправить приглашение'
    );
    expect(t('settings.team.invites.send', { count: 2 })).toBe(
      'Отправить 2 приглашения'
    );
    expect(t('settings.team.invites.send', { count: 5 })).toBe(
      'Отправить 5 приглашений'
    );
    expect(t('settings.team.invites.send', { count: 21 })).toBe(
      'Отправить 21 приглашение'
    );
  });

  it('renders representative Russian settings copy and localized numbers', () => {
    setLocale('ru');

    expect(t('settings.crm.disable.confirmPhrase')).toBe('Отключить CRM');
    expect(t('settings.billing.plan.free')).toBe('Бесплатный план');
    expect(
      t('settings.email.sync.progress', { completed: 1200, total: 2500 })
    ).toBe('Обработано 1 200 из 2 500 цепочек');
  });
});

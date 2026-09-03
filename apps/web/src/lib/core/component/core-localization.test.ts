import { setLocale, t } from '@app/lib/i18n';
import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import { afterEach, describe, expect, it } from 'vitest';
import { getLinkShareScopeCopy, getShareStatus } from './TopBar/linkShare';

const OWNED_PREFIXES = ['comments.', 'core.', 'mobile.'] as const;

const ownedSources = import.meta.glob(
  [
    './**/*.ts',
    './**/*.tsx',
    '../comments/**/*.ts',
    '../comments/**/*.tsx',
    '../mobile/**/*.ts',
    '../mobile/**/*.tsx',
    '../collab-surface/**/*.ts',
    '../collab-surface/**/*.tsx',
    '../linked-conversation/**/*.ts',
    '../linked-conversation/**/*.tsx',
    '!./AI/**',
    '!./LexicalMarkdown/**',
    '!../**/debug/**',
    '!../**/fixtures/**',
    '!../**/*.test.ts',
    '!../**/*.test.tsx',
    '!./**/*.test.ts',
    '!./**/*.test.tsx',
  ],
  { eager: true, import: 'default', query: '?raw' }
) as Record<string, string>;

const ownedKeys = (catalog: Record<string, string>) =>
  Object.keys(catalog)
    .filter((key) => OWNED_PREFIXES.some((prefix) => key.startsWith(prefix)))
    .sort();

afterEach(() => setLocale('en'));

describe('shared core localization', () => {
  it('keeps the English and Russian semantic catalogs in parity', () => {
    expect(ownedKeys(ru)).toEqual(ownedKeys(en));
    expect(ownedKeys(en).length).toBeGreaterThan(125);

    for (const key of ownedKeys(en)) {
      expect(ru[key as keyof typeof ru], key).not.toBe('');
      expect(ru[key as keyof typeof ru], key).not.toBe(
        en[key as keyof typeof en]
      );
    }
  });

  it('contains no opaque auto keys in the owned production sources', () => {
    for (const [path, source] of Object.entries(ownedSources)) {
      expect(source, path).not.toMatch(/\bt\(['"]auto\./);
    }
  });

  it('uses Russian plural forms for replies and unread notifications', () => {
    setLocale('ru');

    expect(t('comments.thread.showReplies', { count: 1 })).toBe(
      'Показать 1 ответ'
    );
    expect(t('comments.thread.showReplies', { count: 2 })).toBe(
      'Показать 2 ответа'
    );
    expect(t('comments.thread.showReplies', { count: 5 })).toBe(
      'Показать 5 ответов'
    );
    expect(t('core.notifications.unreadSuffix', { count: 21 })).toBe(
      ' — 21 непрочитанное'
    );
  });

  it('updates link-sharing labels and ICU access copy with the locale', () => {
    setLocale('ru');

    expect(getLinkShareScopeCopy('PUBLIC').title).toBe('Публичная ссылка');
    expect(getShareStatus(null, false)).toMatchObject({
      kind: 'private',
      label: 'Только я',
    });
    expect(
      t('core.sharing.link.accessDescription', {
        accessLevel: 'edit',
        itemType: 'document',
        scope: 'TEAM',
      })
    ).toBe(
      'Участники команды владельца со ссылкой могут редактировать этот документ.'
    );
  });
});

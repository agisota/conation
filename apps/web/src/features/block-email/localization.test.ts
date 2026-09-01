import { setLocale, t } from '@app/lib/i18n';
import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import { afterEach, describe, expect, it } from 'vitest';
import { MACRO_EMAIL_SIGNATURE } from './constants';
import { EMAIL_BODY_CONTAINMENT_CSS } from './util/emailBodyContainmentCss';

const OWNED_PREFIXES = [
  'agent.',
  'automation.',
  'block.',
  'blockChannel.',
  'blockEmail.',
  'call.',
  'canvas.',
  'chat.',
  'code.',
  'pdf.',
  'project.',
  'pullRequest.',
] as const;

const ownedSources = import.meta.glob(
  [
    './**/*.{ts,tsx}',
    '../block-agent/**/*.{ts,tsx}',
    '../block-automation/**/*.{ts,tsx}',
    '../block-call/**/*.{ts,tsx}',
    '../block-canvas/**/*.{ts,tsx}',
    '../block-channel/**/*.{ts,tsx}',
    '../block-chat/**/*.{ts,tsx}',
    '../block-code/**/*.{ts,tsx}',
    '../block-pdf/**/*.{ts,tsx}',
    '../block-pr/**/*.{ts,tsx}',
    '../block-project/**/*.{ts,tsx}',
    '../block-unknown/**/*.{ts,tsx}',
    '../chat/**/*.{ts,tsx}',
    '!./**/*.test.{ts,tsx}',
    '!../**/*.test.{ts,tsx}',
    '!../block-agent/debug/**',
  ],
  { eager: true, import: 'default', query: '?raw' }
) as Record<string, string>;

const ownedKeys = (catalog: Record<string, string>) =>
  Object.keys(catalog)
    .filter((key) => OWNED_PREFIXES.some((prefix) => key.startsWith(prefix)))
    .sort();

describe('block and workflow localization', () => {
  afterEach(() => setLocale('en'));

  it('keeps each semantic key in both catalogs with real Russian copy', () => {
    expect(ownedKeys(ru)).toEqual(ownedKeys(en));
    expect(ownedKeys(en).length).toBeGreaterThan(85);

    for (const key of ownedKeys(en)) {
      expect(ru[key as keyof typeof ru], key).not.toBe('');
      expect(ru[key as keyof typeof ru], key).not.toBe(
        en[key as keyof typeof en]
      );
    }
  });

  it('renders representative Russian workflow copy and ICU plurals', () => {
    setLocale('ru');

    expect(t('chat.actions.askConation')).toBe('Спросить Conation');
    expect(t('blockEmail.compose.dropFiles')).toBe(
      'Перетащите файлы, чтобы прикрепить'
    );
    expect(t('blockEmail.compose.conationSignature')).toBe(
      '-- Отправлено из Conation'
    );
    expect(t('automation.history.runCount', { count: 1 })).toBe('1 запуск');
    expect(t('automation.history.runCount', { count: 2 })).toBe('2 запуска');
    expect(t('automation.history.runCount', { count: 5 })).toBe('5 запусков');
    expect(t('blockEmail.attachments.tooLarge', { count: 1 })).toBe(
      'Размер вложения превышает 18 МБ'
    );
    expect(t('blockEmail.attachments.tooLarge', { count: 5 })).toBe(
      'Размер вложений превышает 18 МБ'
    );
    expect(t('blockEmail.noSubject')).toBe('[Без темы]');
    expect(
      t('blockEmail.recipients.addedToCc', { email: 'reader@example.com' })
    ).toBe('reader@example.com добавлен в копию');
  });

  it('keeps English as the source locale', () => {
    setLocale('en');

    expect(t('canvas.tools.flowConnector')).toBe('Flow connector');
    expect(t('automation.history.runCount', { count: 2 })).toBe('2 runs');
    expect(t('pdf.actions.insertAiResponse')).toBe('Insert AI response');
  });

  it('does not use opaque auto keys in owned production sources', () => {
    for (const [path, source] of Object.entries(ownedSources)) {
      expect(source, path).not.toMatch(/\bt\(['"]auto\./);
    }
  });

  it('rebrands visible email copy while retaining stable CSS contracts', () => {
    expect(MACRO_EMAIL_SIGNATURE).toBe('-- Sent with Conation');
    expect(EMAIL_BODY_CONTAINMENT_CSS).toContain('.macro-email-signature');
    expect(EMAIL_BODY_CONTAINMENT_CSS).toContain('--macro-email-img-display');
  });
});

import { setLocale, t } from '@app/lib/i18n';
import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import { formatCallDuration } from '@block-call/utils';
import { afterEach, describe, expect, it } from 'vitest';

const ownedPrefixes = [
  'agent.',
  'automation.',
  'call.',
  'canvas.',
  'chat.',
  'pdf.',
  'pullRequest.',
] as const;

const ownedKeys = (catalog: Record<string, string>) =>
  Object.keys(catalog)
    .filter((key) => ownedPrefixes.some((prefix) => key.startsWith(prefix)))
    .sort();

describe('localized block UI', () => {
  afterEach(() => setLocale('en'));

  it('keeps owned English and Russian semantic keys in sync', () => {
    expect(ownedKeys(ru)).toEqual(ownedKeys(en));
  });

  it('renders representative Russian block copy and plural forms', () => {
    setLocale('ru');

    expect(t('agent.files.count', { count: 1 })).toBe('1 файл');
    expect(t('agent.files.count', { count: 2 })).toBe('2 файла');
    expect(t('agent.files.count', { count: 5 })).toBe('5 файлов');
    expect(formatCallDuration(65_000)).toBe('1 мин 5 с');
    expect(t('canvas.actions.resetView')).toBe('Сбросить вид');
    expect(t('chat.actions.editInstructions')).toBe(
      'Изменить инструкции для ИИ'
    );
    expect(t('pdf.definition.referenceCount', { count: 2 })).toBe(
      'Найдено 2 ссылки'
    );
    expect(t('pullRequest.actions.hideBots', { count: 2 })).toBe(
      'Скрыть ботов (2)'
    );
  });

  it('keeps English as source copy for the same visible paths', () => {
    expect(t('agent.actions.send')).toBe('Send');
    expect(formatCallDuration(65_000)).toBe('1m 5s');
    expect(t('pdf.tabs.page', { page: 3 })).toBe('Page 3');
  });
});

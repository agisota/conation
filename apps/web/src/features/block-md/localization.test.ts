import { setLocale, t } from '@app/lib/i18n';
import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import { afterEach, describe, expect, it } from 'vitest';

const markdownKeys = (catalog: Record<string, string>) =>
  Object.keys(catalog)
    .filter((key) => key.startsWith('markdown.'))
    .sort();

const blockMarkdownSources = import.meta.glob('./**/*.{ts,tsx}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

describe('block markdown localization', () => {
  afterEach(() => setLocale('en'));

  it('keeps the English and Russian semantic catalogs in sync', () => {
    expect(markdownKeys(en).length).toBeGreaterThan(160);
    expect(markdownKeys(ru)).toEqual(markdownKeys(en));

    for (const key of markdownKeys(en)) {
      expect(ru[key as keyof typeof ru], key).not.toBe('');
      expect(ru[key as keyof typeof ru], key).not.toBe(
        en[key as keyof typeof en]
      );
    }
  });

  it('renders representative Russian markdown UI copy', () => {
    setLocale('ru');

    expect(t('markdown.ai.editSelectionPlaceholder')).toBe(
      'Попросите Conation отредактировать выделенный текст'
    );
    expect(t('markdown.ai.askConation')).toBe('Спросить Conation');
    expect(t('markdown.task.duplicates.dismissAll')).toBe('Скрыть все');
    expect(t('markdown.find.replacePlaceholder')).toBe('Заменить на…');
    expect(t('markdown.collaboration.offline')).toBe('Нет подключения');
    expect(t('markdown.history.minutesAgo', { count: 1 })).toBe(
      '1 минуту назад'
    );
    expect(t('markdown.history.minutesAgo', { count: 2 })).toBe(
      '2 минуты назад'
    );
    expect(t('markdown.history.minutesAgo', { count: 5 })).toBe(
      '5 минут назад'
    );
    expect(t('markdown.task.duplicates.dismissed', { count: 1 })).toBe(
      'Дубликат скрыт.'
    );
    expect(t('markdown.find.matchPosition', { current: 2, total: 5 })).toBe(
      '2 из 5 совпадений'
    );
    expect(t('markdown.task.createdCount', { count: 5 })).toBe(
      'Создано 5 задач'
    );
  });

  it('keeps English as the source locale', () => {
    setLocale('en');

    expect(t('markdown.skill.create')).toBe('Create skill');
    expect(t('markdown.format.blockQuote')).toBe('Block quote');
  });

  it('does not use opaque auto keys in block markdown source', () => {
    for (const [path, source] of Object.entries(blockMarkdownSources)) {
      expect(source, path).not.toMatch(/\bt\(['"]auto\./);
    }
  });
});

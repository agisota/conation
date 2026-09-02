import { setLocale, t } from '@app/lib/i18n';
import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import IntlMessageFormat from 'intl-messageformat';
import { afterEach, describe, expect, test } from 'vitest';
import { deriveMagicChipPresentation } from './component/decorator/MagicChip/presentation';
import { getErrorDescription, MarkdownEditorErrors } from './constants';

const englishCatalog = en as Record<string, string>;
const russianCatalog = ru as Record<string, string>;
const localeNeutralKeyboardLabels = new Set([
  'editor.keyboard.escape',
  'editor.keyboard.tab',
]);

describe('Lexical editor localization', () => {
  afterEach(() => setLocale('en'));

  test('has a Russian value for every semantic editor key', () => {
    const editorKeys = Object.keys(englishCatalog).filter((key) =>
      key.startsWith('editor.')
    );

    expect(editorKeys.length).toBeGreaterThan(35);
    for (const key of editorKeys) {
      expect(russianCatalog[key], key).toBeTypeOf('string');
      expect(russianCatalog[key]?.trim(), key).not.toBe('');
      if (!localeNeutralKeyboardLabels.has(key)) {
        expect(russianCatalog[key], key).not.toBe(englishCatalog[key]);
      }
    }
  });

  test('parses every editor message as valid ICU in both locales', () => {
    for (const [locale, catalog] of [
      ['en-US', englishCatalog],
      ['ru-RU', russianCatalog],
    ] as const) {
      for (const [key, message] of Object.entries(catalog)) {
        if (!key.startsWith('editor.')) continue;
        expect(
          () => new IntlMessageFormat(message, locale),
          `${locale}: ${key}`
        ).not.toThrow();
      }
    }
  });

  test('renders editor actions in English and Russian', () => {
    setLocale('en');
    expect(t('editor.document.convertToInlineMention')).toBe(
      'Convert to inline mention'
    );
    expect(t('editor.table.splitCell')).toBe('Split cell');

    setLocale('ru');
    expect(t('editor.document.convertToInlineMention')).toBe(
      'Преобразовать во встроенное упоминание'
    );
    expect(t('editor.table.splitCell')).toBe('Разделить ячейку');
  });

  test('localizes editor loading and empty states', () => {
    setLocale('ru');

    expect(t('editor.media.savingImage')).toBe('Сохранение изображения…');
    expect(t('editor.commands.noResults')).toBe('Команды не найдены');
    expect(t('editor.code.invalidSvgContent')).toBe('Некорректный SVG-код');
  });

  test('uses Russian ICU plurals, selects, and interpolation', () => {
    setLocale('ru');

    expect(t('editor.paste.lineCount', { count: 1 })).toBe('1 строка');
    expect(t('editor.paste.lineCount', { count: 2 })).toBe('2 строки');
    expect(t('editor.paste.lineCount', { count: 5 })).toBe('5 строк');
    expect(t('editor.paste.origin.label', { origin: 'referenced' })).toBe(
      'Цитата'
    );
    expect(t('editor.tags.create', { label: 'Важно' })).toBe(
      'Создать метку «Важно»'
    );
  });

  test('localizes derived agent activity instead of protocol states', () => {
    setLocale('ru');

    expect(
      deriveMagicChipPresentation({ persistedStatus: 'no_messages' })
    ).toEqual({
      kind: 'working',
      activity: { label: 'Запуск сеанса', busy: false },
    });
  });

  test('uses Conation branding in localized version errors', () => {
    setLocale('en');
    expect(
      getErrorDescription(MarkdownEditorErrors.VERSION_MISMATCH_ERROR)
    ).toContain('Conation');
    expect(
      getErrorDescription(MarkdownEditorErrors.VERSION_MISMATCH_ERROR)
    ).not.toContain('Macro');

    setLocale('ru');
    expect(
      getErrorDescription(MarkdownEditorErrors.VERSION_MISMATCH_ERROR)
    ).toContain('Conation');
    expect(getErrorDescription(MarkdownEditorErrors.EMPTY_SOURCE)).toBe(
      'Не удалось найти содержимое документа.'
    );
  });
});

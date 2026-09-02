import { setLocale, t } from '@app/lib/i18n';
import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import { afterEach, describe, expect, it } from 'vitest';
import { getPropertyDataTypeDropdownOptions } from './utils/display';

const propertyKeys = (catalog: Record<string, string>) =>
  Object.keys(catalog)
    .filter((key) => key.startsWith('property.'))
    .sort();

const propertySources = import.meta.glob(
  ['./**/*.ts', './**/*.tsx', '!./**/*.test.ts', '!./**/*.test.tsx'],
  {
    eager: true,
    import: 'default',
    query: '?raw',
  }
) as Record<string, string>;

afterEach(() => setLocale('en'));

describe('property localization', () => {
  it('keeps the English and Russian semantic catalogs in sync', () => {
    expect(propertyKeys(ru)).toEqual(propertyKeys(en));
    expect(propertyKeys(en).length).toBeGreaterThanOrEqual(110);
  });

  it('does not use opaque auto keys in property production sources', () => {
    for (const [path, source] of Object.entries(propertySources)) {
      expect(source, path).not.toMatch(/\bt\(['"]auto\./);
    }
  });

  it('renders representative Russian property copy', () => {
    setLocale('ru');

    expect(t('property.create.title')).toBe('Создать свойство');
    expect(t('property.date.noMatches', { query: 'вчера' })).toBe(
      'По запросу «вчера» дат не найдено'
    );
    expect(t('property.tags.editAria', { tag: 'Срочно' })).toBe(
      'Редактировать тег «Срочно»'
    );
  });

  it('uses Russian plural forms for tag counts', () => {
    setLocale('ru');

    expect(t('property.tags.count', { count: 1 })).toBe('1 тег');
    expect(t('property.tags.count', { count: 2 })).toBe('2 тега');
    expect(t('property.tags.count', { count: 5 })).toBe('5 тегов');
    expect(t('property.tags.count', { count: 21 })).toBe('21 тег');
  });

  it('localizes type labels without changing schema values', () => {
    setLocale('en');
    const english = getPropertyDataTypeDropdownOptions();
    setLocale('ru');
    const russian = getPropertyDataTypeDropdownOptions();

    expect(russian.map((option) => option.value)).toEqual(
      english.map((option) => option.value)
    );
    expect(
      russian.find((option) => option.value === 'entity:USER')?.label
    ).toBe('Пользователь');
    expect(
      english.find((option) => option.value === 'entity:USER')?.label
    ).toBe('User');
  });
});

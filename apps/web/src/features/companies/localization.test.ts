import { setLocale, t } from '@app/lib/i18n';
import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import { afterEach, describe, expect, it } from 'vitest';

const companySources = import.meta.glob('./**/*.{ts,tsx}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

const companyKeys = (catalog: Record<string, string>) =>
  Object.keys(catalog)
    .filter((key) => key.startsWith('companies.'))
    .sort();

describe('companies localization', () => {
  afterEach(() => setLocale('en'));

  it('keeps complete English and Russian company catalogs', () => {
    expect(companyKeys(en)).toHaveLength(60);
    expect(companyKeys(ru)).toEqual(companyKeys(en));

    for (const key of companyKeys(en)) {
      expect(ru[key as keyof typeof ru], key).not.toBe('');
      expect(ru[key as keyof typeof ru], key).not.toBe(
        en[key as keyof typeof en]
      );
    }
  });

  it('renders Russian company states and select variants', () => {
    setLocale('ru');

    expect(t('companies.actions.createCompany')).toBe('Создать компанию');
    expect(t('companies.emails.empty.inbox', { kind: 'signal' })).toBe(
      'В вашей почте нет сигнальных писем от этой компании.'
    );
    expect(t('companies.emails.empty.team', { kind: 'all' })).toBe(
      'Писем от этой компании пока нет.'
    );
  });

  it('renders CRM stage catalog keys', () => {
    setLocale('ru');
    expect(t('soup.crm.stage.lead')).toBe('Лид');
    setLocale('en');
    expect(t('soup.crm.stage.lead')).toBe('Lead');
  });

  it('does not use opaque localization keys in company source', () => {
    for (const [path, source] of Object.entries(companySources)) {
      expect(source, path).not.toMatch(/\bt\(['"]auto\./);
    }
  });
});

import { setLocale, t } from '@app/lib/i18n';
import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import { afterEach, describe, expect, it } from 'vitest';
import { VIEW_TAB_LISTS } from './soup-view/tab-lists';

const soupKeys = (catalog: Record<string, string>) =>
  Object.keys(catalog)
    .filter((key) => key.startsWith('soup.'))
    .sort();

describe('next-soup localization', () => {
  afterEach(() => setLocale('en'));

  it('keeps the English and Russian soup catalogs in sync', () => {
    expect(soupKeys(ru)).toEqual(soupKeys(en));
    expect(soupKeys(en)).toContain('soup.empty.filters.noMatchTitle');
  });

  it('renders semantic Russian labels for representative soup surfaces', () => {
    setLocale('ru');

    expect(t('soup.filters.openLabel')).toBe('Открыть фильтры');
    expect(t('soup.empty.crm.joinTeamTitle')).toBe(
      'Вступите в команду, чтобы включить CRM'
    );
    expect(t('soup.search.loadMore')).toBe('Показать ещё');
    expect(t('soup.views.visibilityLabel')).toBe('Доступ к представлению');
    expect(t('soup.empty.documents.description')).toContain('Conation');
  });

  it('uses Russian plural rules for dynamic counts', () => {
    setLocale('ru');

    expect(t('soup.filters.inboxes.count', { count: 1 })).toBe(
      '1 почтовый ящик'
    );
    expect(t('soup.filters.inboxes.count', { count: 2 })).toBe(
      '2 почтовых ящика'
    );
    expect(t('soup.filters.inboxes.count', { count: 5 })).toBe(
      '5 почтовых ящиков'
    );
  });

  it('updates static option labels when the locale changes at runtime', () => {
    const signalTab = VIEW_TAB_LISTS.inbox.find(
      ({ value }) => value === 'signal'
    );

    setLocale('en');
    expect(signalTab?.label).toBe('Signal');
    setLocale('ru');
    expect(signalTab?.label).toBe('Важное');
  });

  it('keeps English as the source-locale copy', () => {
    setLocale('en');

    expect(t('soup.call.dialogTitle')).toBe('New Call');
    expect(t('soup.filters.inboxes.searchPlaceholder')).toBe('Search inboxes…');
  });
});

import { createContext, createSignal, useContext } from 'solid-js';
import { t } from '@app/lib/i18n';
import en from './locales/en.json';
import ru from './locales/ru.json';

export type Locale = 'ru' | 'en';

const messages: Record<Locale, Record<string, string>> = { en, ru };

const LOCALE_STORAGE_KEY = 'conation-locale';
const DEFAULT_LOCALE: Locale = 'ru';

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
    if (stored === 'ru' || stored === 'en') return stored;
    const nav = navigator.language?.toLowerCase() ?? '';
    if (nav.startsWith('ru')) return 'ru';
    if (nav.startsWith('en')) return 'en';
  } catch {}
  return DEFAULT_LOCALE;
}

const [locale, setLocaleSignal] = createSignal<Locale>(detectLocale());

export function getLocale(): Locale {
  return locale();
}

export function setLocale(l: Locale) {
  setLocaleSignal(l);
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, l);
    document.documentElement.lang = l;
  } catch {}
  // Notify backend via Accept-Language header on next fetch (via fetch wrapper)
}

export function initI18n() {
  const l = getLocale();
  document.documentElement.lang = l;
  try {
    // Also set html lang immediately
    document.documentElement.setAttribute('lang', l);
  } catch {}
}

// Simple ICU-like interpolation: replaces {count} and {var}
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v !== undefined ? String(v) : `{${k}}`;
  });
}

// Plural handling via Intl.PluralRules (ru: one/few/many/other, en: one/other)
function pluralKey(locale: Locale, count: number): string {
  try {
    const rules = new Intl.PluralRules(locale);
    return rules.select(count);
  } catch {
    return count === 1 ? 'one' : 'other';
  }
}

/**
 * Translate key with optional interpolation and plural.
 * - `t('common.close')` -> "Закрыть" / t('common.close')
 * - `t('plural.notification', { count: 5 })` -> picks correct plural form via Intl.PluralRules
 *
 * For plural, expects keys like `plural.notification.one`, `.few`, `.many`, `.other`.
 * If key is plural base, it will resolve to `key + '.' + pluralRule`.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const l = getLocale();
  const dict = messages[l] ?? messages[DEFAULT_LOCALE];
  const fallback = messages['en'];

  // If count provided and key is plural base, try plural
  if (vars && 'count' in vars && typeof vars.count === 'number') {
    const count = vars.count as number;
    const pkey = `${key}.${pluralKey(l, count)}`;
    const pluralTemplate = dict[pkey] ?? fallback?.[pkey] ?? dict[key] ?? fallback?.[key];
    if (pluralTemplate) return interpolate(pluralTemplate, vars);
  }

  const template = dict[key] ?? fallback?.[key] ?? key;
  return interpolate(template, vars);
}

// Backwards compat helper for date formatting
export function getDateLocale(): string {
  return getLocale() === 'ru' ? 'ru-RU' : 'en-US';
}

export const I18nContext = createContext({ t, locale, setLocale, getLocale });

export function useI18n() {
  const ctx = useContext(I18nContext);
  return ctx ?? { t, locale, setLocale, getLocale, getDateLocale };
}

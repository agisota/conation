import IntlMessageFormat, { type PrimitiveType } from 'intl-messageformat';
import { createSignal } from 'solid-js';
import { SERVER_HOSTS } from '@core/constant/servers';
import en from './locales/en.json';
import ru from './locales/ru.json';

export const SUPPORTED_LOCALES = ['en', 'ru'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const SOURCE_LOCALE: Locale = 'en';
export const DEFAULT_LOCALE: Locale = 'ru';
export const LOCALE_STORAGE_KEY = 'conation-locale';

type MessageCatalog = Record<string, string>;
export type MessageValues = Record<string, PrimitiveType>;

const messages: Record<Locale, MessageCatalog> = { en, ru };
const messageFormatCache = new Map<string, IntlMessageFormat>();

/** Parses a language tag or storage value into a supported locale. */
export function parseLocale(
  value: string | null | undefined
): Locale | undefined {
  const language = value?.trim().toLowerCase().split(/[-_]/, 1)[0];
  return SUPPORTED_LOCALES.find((locale) => locale === language);
}

/** Resolves explicit locale preferences in priority order. */
export function resolveLocale(
  preferences: readonly (string | null | undefined)[]
): Locale {
  for (const preference of preferences) {
    const resolved = parseLocale(preference);
    if (resolved) return resolved;
  }
  return DEFAULT_LOCALE;
}

function detectLocale(): Locale {
  let storedLocale: string | null = null;
  try {
    storedLocale = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY) ?? null;
  } catch {
    // Storage can be unavailable in privacy-restricted webviews.
  }

  // Conation is Russian-first. New profiles start in Russian regardless of
  // the operating-system locale; an explicit in-product selection persists.
  return resolveLocale([storedLocale]);
}

const [locale, setLocaleSignal] = createSignal<Locale>(detectLocale());

export function getLocale(): Locale {
  return locale();
}

export function getDateLocale(localeOverride = getLocale()): string {
  return localeOverride === 'ru' ? 'ru-RU' : 'en-US';
}

function syncDocumentLanguage(nextLocale: Locale) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = nextLocale;
  }
}

/** Selects and persists the locale for this browser profile. */
export function setLocale(nextLocale: Locale) {
  setLocaleSignal(nextLocale);
  syncDocumentLanguage(nextLocale);
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, nextLocale);
  } catch {
    // The in-memory selection remains valid when persistence is unavailable.
  }
  persistLocaleToServer(nextLocale);
}

function persistLocaleToServer(nextLocale: Locale) {
  if (typeof window === 'undefined') return;
  const authHost = SERVER_HOSTS['auth-service'];
  try {
    void fetch(`${authHost}/user/locale`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ locale: nextLocale }),
    }).catch(() => {
      // Fire-and-forget: UI already switched even if the server write fails.
    });
  } catch {
    // Fetch may be unavailable in restricted environments.
  }
}

let initialized = false;

/**
 * Applies a locale that arrived from another tab or from a cleared
 * preference. Invalid and missing values fall back to the product default
 * without writing the default back to storage or the server.
 */
export function applyExternalLocalePreference(
  value: string | null | undefined
): Locale {
  const nextLocale = parseLocale(value) ?? DEFAULT_LOCALE;
  if (nextLocale === getLocale()) return nextLocale;
  setLocaleSignal(nextLocale);
  syncDocumentLanguage(nextLocale);
  return nextLocale;
}

/** Removes the browser preference and returns this profile to the default locale. */
export function clearLocalePreference() {
  try {
    globalThis.localStorage?.removeItem(LOCALE_STORAGE_KEY);
  } catch {
    // The in-memory default remains valid when storage is unavailable.
  }
  applyExternalLocalePreference(null);
}

/** Applies the initial language and keeps it synchronized across browser tabs. */
export function initI18n() {
  syncDocumentLanguage(getLocale());
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('storage', (event) => {
    // `key === null` is a `localStorage.clear()` from another tab.
    if (event.key !== LOCALE_STORAGE_KEY && event.key !== null) return;
    applyExternalLocalePreference(event.key === null ? null : event.newValue);
  });
}

function pluralCategory(
  targetLocale: Locale,
  count: number
): Intl.LDMLPluralRule {
  return new Intl.PluralRules(getDateLocale(targetLocale)).select(count);
}

type MessageCandidate = {
  locale: Locale;
  template: string;
};

function messageCandidates(
  key: string,
  targetLocale: Locale,
  values?: MessageValues
): MessageCandidate[] {
  const localized = messages[targetLocale];
  const source = messages[SOURCE_LOCALE];
  const candidates: MessageCandidate[] = [];

  // Compatibility for the initial catalog's `key.one` / `key.few` layout.
  // New messages should use ICU plural/select syntax in a single semantic key.
  if (typeof values?.count === 'number') {
    const localizedPlural =
      localized[`${key}.${pluralCategory(targetLocale, values.count)}`];
    if (localizedPlural) {
      candidates.push({ locale: targetLocale, template: localizedPlural });
    }

    const sourcePlural =
      source[`${key}.${pluralCategory(SOURCE_LOCALE, values.count)}`];
    if (sourcePlural && sourcePlural !== localizedPlural) {
      candidates.push({ locale: SOURCE_LOCALE, template: sourcePlural });
    }
  }

  const localizedTemplate = localized[key];
  if (localizedTemplate) {
    candidates.push({ locale: targetLocale, template: localizedTemplate });
  }

  const sourceTemplate = source[key];
  if (sourceTemplate && sourceTemplate !== localizedTemplate) {
    candidates.push({ locale: SOURCE_LOCALE, template: sourceTemplate });
  }

  return candidates;
}

function formatMessage(
  candidate: MessageCandidate,
  values: MessageValues
): string {
  const cacheKey = `${candidate.locale}\u0000${candidate.template}`;
  let formatter = messageFormatCache.get(cacheKey);
  if (!formatter) {
    formatter = new IntlMessageFormat(
      candidate.template,
      getDateLocale(candidate.locale)
    );
    messageFormatCache.set(cacheKey, formatter);
  }
  const formatted = formatter.format(values);
  return Array.isArray(formatted) ? formatted.join('') : String(formatted);
}

function interpolateSafely(template: string, values: MessageValues): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = values[name];
    return value === undefined ? placeholder : String(value);
  });
}

/** Formats a semantic message key with ICU plural/select support and English fallback. */
export function t(key: string, values?: MessageValues): string {
  const candidates = messageCandidates(key, getLocale(), values);
  if (candidates.length === 0) return key;
  if (!values) return candidates[0].template;

  for (const candidate of candidates) {
    try {
      return formatMessage(candidate, values);
    } catch {
      // Try the English source message before falling back to safe interpolation.
    }
  }
  return interpolateSafely(candidates[0].template, values);
}

/** Formats a number using the selected locale. */
export function formatNumber(
  value: number | bigint,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(getDateLocale(), options).format(value);
}

/** Formats a date/time using the selected locale. */
export function formatDateTime(
  value: Date | number,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat(getDateLocale(), options).format(value);
}

/** Formats a relative time using the selected locale. */
export function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options?: Intl.RelativeTimeFormatOptions
): string {
  return new Intl.RelativeTimeFormat(getDateLocale(), options).format(
    value,
    unit
  );
}

/** Value sent by application API clients in the `Accept-Language` header. */
export function getAcceptLanguage(): string {
  return getDateLocale();
}

export { LocaleSelect } from './LocaleSelect';

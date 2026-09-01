import { tz } from '@date-fns/tz';
import {
  compareAsc,
  compareDesc,
  differenceInWeeks,
  isToday,
  isYesterday,
  toDate,
} from 'date-fns';

/** Represents a Date or an Api RFC3339 string response that can be parsed into a Date object. */
export type DateValue = Date | string;

const EPOCH_ZERO = new Date(0);

interface FormatDateOptions {
  /** IANA timezone string (e.g., 'America/New_York', 'UTC'). Defaults to system timezone. */
  timeZone?: string;
  /** If true, always include time in the output (e.g., 'Thursday at 4:53 PM' instead of 'Thursday'). */
  showTime?: boolean;
  /** If true, use short weekday names (e.g., 'Wed' instead of 'Wednesday'). */
  shortWeekday?: boolean;
}

/**
 * Formats a date to just the time, e.g. '4:53 PM'.
 * @param date - Date object or RFC3339 string
 * @param timeZone - IANA timezone string. Defaults to system timezone.
 */
export const formatTime = (
  date: DateValue | null | undefined,
  timeZone?: string,
  locale?: string
): string => {
  if (!date) return '';
  const d = date instanceof Date ? date : toDate(date);
  // Conation: locale-aware, default to system locale (undefined) which respects ru-RU vs en-US
  // Keep hour12 for en, but ru uses 24h via Intl automatically when locale is ru-RU.
  const loc = locale ?? (typeof navigator !== 'undefined' ? navigator.language : undefined);
  return d.toLocaleTimeString(loc, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: loc?.startsWith('ru') ? false : true,
    timeZone,
  });
};

/**
 * Formats a date to a human readable string.
 * @param date - Date object or Unix timestamp in seconds
 * @param options - Optional formatting options.
 * @returns Formatted date string. Like '4:53 PM' for same local day or, 'Yesterday at 8:10 AM' for
 *     single day offsets, 'Thursday' for a day within the week and '01/23/2025' for dates outside the week.
 */
export const formatDate = (
  date: DateValue | null | undefined,
  options?: FormatDateOptions
) => {
  if (!date) return '';
  const d = date instanceof Date ? date : toDate(date);
  const { timeZone, showTime, shortWeekday } = options ?? {};
  const timeZoneOpts = timeZone ? { in: tz(timeZone) } : {};
  const now = new Date();

  const time = formatTime(date, timeZone);

  if (isToday(date, timeZoneOpts)) {
    return time;
  }

  if (isYesterday(date, timeZoneOpts)) {
    // locale-aware via html lang
    const isRu = typeof document !== 'undefined' && document.documentElement.lang === 'ru';
    if (isRu) return `Вчера в ${time}`;
    return `${shortWeekday ? 'Yest' : 'Yesterday'} at ${time}`;
  }

  if (differenceInWeeks(now, date) < 1) {
    const weekday = d.toLocaleDateString(undefined, {
      weekday: shortWeekday ? 'short' : 'long',
      timeZone,
    });
    return showTime ? `${weekday} at ${time}` : weekday;
  }

  const displayDate = d.toLocaleDateString(undefined, {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
    timeZone,
  });
  return showTime ? `${displayDate} at ${time}` : displayDate;
};

/**
 * Formats a date in the format "Fri, Jul 4, 2025 at 12:20 AM"
 * @param date - Date object or Unix timestamp in seconds
 * @returns Formatted date string
 */
export const formatEmailDate = (date: DateValue, locale?: string) => {
  const d = toDate(date);
  const loc = locale ?? (typeof document !== 'undefined' ? document.documentElement.lang : undefined) ?? 'ru-RU';
  const weekday = d.toLocaleDateString(loc, { weekday: 'short' });
  const month = d.toLocaleDateString(loc, { month: 'short' });
  const day = d.getDate();
  const year = d.getFullYear();
  const time = d.toLocaleTimeString(loc, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: loc.startsWith('ru') ? false : true,
  });
  const isRu = loc.startsWith('ru');
  return isRu
    ? `${weekday}, ${day} ${month} ${year} в ${time}`
    : `${weekday}, ${month} ${day}, ${year} at ${time}`;
};

/**
 * Compares two dates in descending order (most recent first).
 * Handles undefined/null dates by treating them as epoch zero.
 * @returns Positive if a > b, negative if a < b, zero if equal
 */
export const compareDateDesc = (
  a: DateValue | null | undefined,
  b: DateValue | null | undefined
): number => {
  const dateA = a ?? EPOCH_ZERO;
  const dateB = b ?? EPOCH_ZERO;
  return compareDesc(dateA, dateB);
};

/**
 * Compares two dates in ascending order (oldest first).
 * Handles undefined/null dates by treating them as epoch zero.
 * @returns Positive if a > b, negative if a < b, zero if equal
 */
export const compareDateAsc = (
  a: DateValue | null | undefined,
  b: DateValue | null | undefined
): number => {
  const dateA = a ?? EPOCH_ZERO;
  const dateB = b ?? EPOCH_ZERO;
  return compareAsc(dateA, dateB);
};

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;

export const convertIsoString = (isoString: string): Date | undefined => {
  if (ISO_DATE_REGEX.test(isoString)) {
    return new Date(isoString);
  }
  return undefined;
};

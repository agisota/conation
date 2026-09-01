import { formatDateTime, t } from '@app/lib/i18n';
import type { DateValue } from '@core/util/date';
import {
  differenceInHours,
  differenceInMinutes,
  isSameYear,
  isToday,
  isYesterday,
} from 'date-fns';

function asDate(value: DateValue): Date {
  return value instanceof Date ? value : new Date(value);
}

function formatTime(date: Date): string {
  return formatDateTime(date, { hour: 'numeric', minute: '2-digit' });
}

function formatCompactTime(date: Date): string {
  return formatTime(date).replace(/\s+(?=[A-Za-zА-Яа-яЁё.]+$)/u, '');
}

function formatCalendarDate(date: Date): string {
  return isSameYear(date, new Date())
    ? formatDateTime(date, { month: 'short', day: 'numeric' })
    : formatDateTime(date, {
        year: '2-digit',
        month: 'numeric',
        day: 'numeric',
      });
}

/**
 * Formats a timestamp into a human-readable string.
 * - Today: Shows time (e.g., "2:30 PM")
 * - Same year: Shows month and day (e.g., "Jan 27")
 * - Older: Shows full date (e.g., "1/27/24")
 */
export function formatTimestamp(date: DateValue): string {
  const value = asDate(date);
  if (isToday(value)) return formatTime(value);

  return formatCalendarDate(value);
}

/**
 * Formats a timestamp into a relative human-readable string.
 * - Under 60 minutes: "X minutes ago"
 * - Under 24 hours: "X hours ago"
 * - Yesterday: "3:45pm yesterday"
 * - Older: Shows date (e.g., "Jan 27" or "1/27/24")
 */
export function formatRelativeTimestamp(
  date: DateValue,
  options?: { condensed?: boolean }
): string {
  const value = asDate(date);
  const now = new Date();
  const condensed = options?.condensed ?? false;

  const minutesAgo = differenceInMinutes(now, value);

  if (minutesAgo < 1) {
    return t('entity.timestamp.justNow');
  }

  if (minutesAgo < 60) {
    return t(
      condensed
        ? 'entity.timestamp.minutesAgoCondensed'
        : 'entity.timestamp.minutesAgo',
      { count: minutesAgo }
    );
  }

  const hoursAgo = differenceInHours(now, value);

  if (hoursAgo < 24) {
    return t(
      condensed
        ? 'entity.timestamp.hoursAgoCondensed'
        : 'entity.timestamp.hoursAgo',
      { count: hoursAgo }
    );
  }

  if (isYesterday(value)) {
    return condensed
      ? t('entity.timestamp.yesterdayCondensed')
      : t('entity.timestamp.yesterdayAt', {
          time: formatCompactTime(value),
        });
  }

  return formatCalendarDate(value);
}

/**
 * Formats a date + time in a single concise line, e.g. "Apr 15, 2:30 PM" or
 * "1/27/24, 2:30 PM". Used when a row needs both pieces (e.g. automation
 * next-run times).
 */
export function formatDateAndTime(date: DateValue): string {
  const value = asDate(date);
  return isSameYear(value, new Date())
    ? formatDateTime(value, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : formatDateTime(value, {
        year: '2-digit',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

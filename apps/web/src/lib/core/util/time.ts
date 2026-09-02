import { formatDateTime, formatRelativeTime, getDateLocale } from '@core/i18n';
import type { DateValue } from './date';

function capitalizeRelativeTime(value: string): string {
  return `${value.charAt(0).toLocaleUpperCase(getDateLocale())}${value.slice(1)}`;
}

/**
 * Formats a date string according to relative time rules, eg:
 * - Same day: "Today"
 * - Within last week: "Monday"
 * - Same year: "Mar 5"
 * - Different year: "Mar 5, 1992"
 *
 * @param value - Date object or ISO date string to format
 * @returns Formatted date string
 */
export function formatRelativeDate(value: DateValue): string {
  const date = value instanceof Date ? value : new Date(value);
  const now = new Date();

  // Same day
  if (isSameDay(date, now)) {
    return capitalizeRelativeTime(
      formatRelativeTime(0, 'day', { numeric: 'auto' })
    );
  }

  // Within last week
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (date > weekAgo) {
    return formatDateTime(date, { weekday: 'long' });
  }

  // Same year
  if (date.getFullYear() === now.getFullYear()) {
    return formatDateTime(date, { month: 'short', day: 'numeric' });
  }

  // Different year
  return formatDateTime(date, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats a time string using the selected locale's hour cycle.
 * @param value Date object or ISO date string to format
 * @returns A localized time string, such as "4:26 PM" or "16:26"
 */
function _formatTime(value: DateValue): string {
  const date = value instanceof Date ? value : new Date(value);
  return formatDateTime(date, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Checks if two dates are on the same calendar day */
export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

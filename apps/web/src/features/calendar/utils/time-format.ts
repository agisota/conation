import { getDateLocale } from '@app/lib/i18n';
import type { CalendarTimeFormat } from '../types';

/** FullCalendar and Intl options for the supported calendar time formats. */
export const CALENDAR_TIME_FORMAT_OPTIONS = {
  '12-hour': {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  },
  '24-hour': {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  },
} satisfies Record<CalendarTimeFormat, Intl.DateTimeFormatOptions>;

function calendarTimeFormatter(timeFormat: CalendarTimeFormat) {
  return new Intl.DateTimeFormat(
    getDateLocale(),
    CALENDAR_TIME_FORMAT_OPTIONS[timeFormat]
  );
}

function compactDayPeriod(
  parts: Intl.DateTimeFormatPart[],
  showDayPeriod = true
) {
  return parts
    .map((part, index) => {
      if (part.type === 'dayPeriod') {
        return showDayPeriod ? part.value.toLocaleLowerCase() : '';
      }

      const previousPart = parts[index - 1];
      const nextPart = parts[index + 1];
      if (
        part.type === 'literal' &&
        part.value.trim() === '' &&
        (previousPart?.type === 'dayPeriod' || nextPart?.type === 'dayPeriod')
      ) {
        return '';
      }

      return part.value;
    })
    .join('');
}

/** Returns the time format that matches the user's current locale. */
export function getDefaultCalendarTimeFormat(): CalendarTimeFormat {
  return new Intl.DateTimeFormat(getDateLocale(), {
    hour: 'numeric',
  }).resolvedOptions().hour12 === false
    ? '24-hour'
    : '12-hour';
}

/** Formats a time using the calendar's selected 12/24-hour preference. */
export function formatCalendarTime(date: Date, timeFormat: CalendarTimeFormat) {
  return calendarTimeFormatter(timeFormat).format(date);
}

/** Formats event-card times compactly while preserving the selected clock. */
export function formatCompactCalendarTime(
  date: Date,
  timeFormat: CalendarTimeFormat,
  showDayPeriod = true
) {
  if (timeFormat === '24-hour') {
    return calendarTimeFormatter(timeFormat).format(date);
  }

  const formatter =
    date.getMinutes() === 0
      ? new Intl.DateTimeFormat(getDateLocale(), {
          hour: 'numeric',
          hour12: true,
        })
      : calendarTimeFormatter(timeFormat);
  return compactDayPeriod(formatter.formatToParts(date), showDayPeriod);
}

/** Formats an event-card range without repeating a shared AM/PM marker. */
export function formatCompactCalendarTimeRange(
  start: Date,
  end: Date,
  timeFormat: CalendarTimeFormat
) {
  const startIsAm = start.getHours() < 12;
  const endIsAm = end.getHours() < 12;
  const sharesDayPeriod = timeFormat === '12-hour' && startIsAm === endIsAm;

  return `${formatCompactCalendarTime(
    start,
    timeFormat,
    !sharesDayPeriod
  )}–${formatCompactCalendarTime(end, timeFormat)}`;
}

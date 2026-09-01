import { formatRelativeTime } from '@app/lib/i18n';

/** Formats a session timestamp with the active locale and a useful unit. */
export function formatRecentSessionTime(
  value: Date | string,
  now = new Date()
) {
  const date = value instanceof Date ? value : new Date(value);
  const seconds = (date.getTime() - now.getTime()) / 1000;
  const absoluteSeconds = Math.abs(seconds);
  const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] =
    absoluteSeconds < 60
      ? [seconds, 'second']
      : absoluteSeconds < 3_600
        ? [seconds / 60, 'minute']
        : absoluteSeconds < 86_400
          ? [seconds / 3_600, 'hour']
          : absoluteSeconds < 604_800
            ? [seconds / 86_400, 'day']
            : absoluteSeconds < 2_629_800
              ? [seconds / 604_800, 'week']
              : absoluteSeconds < 31_557_600
                ? [seconds / 2_629_800, 'month']
                : [seconds / 31_557_600, 'year'];

  return formatRelativeTime(Math.round(amount), unit, { numeric: 'auto' });
}

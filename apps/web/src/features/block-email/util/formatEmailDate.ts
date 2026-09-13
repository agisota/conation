import { formatDateTime } from '@core/i18n';
import type { DateValue } from '@core/util/date';

export function formatFullDate(date: DateValue): string {
  return formatDateTime(new Date(date), {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).replace(',', '');
}

export function formatShortDate(date: DateValue): string {
  const d = new Date(date);
  if (d.getFullYear() !== new Date().getFullYear()) {
    return formatDateTime(d, {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit',
    });
  }
  return formatDateTime(d, {
    month: 'short',
    day: 'numeric',
  });
}

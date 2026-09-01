import { formatNumber, t } from '@app/lib/i18n';

export function formatCallDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0)
    return t('call.duration.hoursMinutes', {
      hours: formatNumber(hours),
      minutes: formatNumber(minutes),
    });
  if (minutes > 0)
    return t('call.duration.minutesSeconds', {
      minutes: formatNumber(minutes),
      seconds: formatNumber(seconds),
    });
  return t('call.duration.seconds', { seconds: formatNumber(seconds) });
}

import { formatDateTime, t } from '@app/lib/i18n';
import { CONATION_AI_NAME, isConationAiId } from '@core/constant/conationAi';
import { macroIdToEmail, tryMacroId } from '@core/user';
import { getHashedPaletteColor } from '@ui/utils/palette';

export function userColor(userId: string): string {
  const color = getHashedPaletteColor(userId);
  return `var(--color-${color}, var(--color-pink))`;
}

export function userLabel(userId: string): string {
  if (userId === 'unknown') return t('markdown.history.unknownUser');
  if (isConationAiId(userId)) {
    return t('markdown.history.agentLabel', { name: CONATION_AI_NAME });
  }
  const id = tryMacroId(userId);
  return id ? macroIdToEmail(id) : userId;
}

export function formatTimestamp(at: Date): string {
  return formatDateTime(at, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function humanizeDuration(ms: number): string {
  const d = ms / 86_400_000;
  if (d >= 1) {
    return t('markdown.history.durationDays', { count: Math.round(d) });
  }
  const h = ms / 3_600_000;
  if (h >= 1) {
    return t('markdown.history.durationHours', { count: Math.round(h) });
  }
  return t('markdown.history.durationMinutes', {
    count: Math.max(1, Math.round(ms / 60_000)),
  });
}

export {
  buildCompressedTimeline,
  type CompressedTimeline,
  type Interval,
  warpedIntervalEnd,
} from './timeline';

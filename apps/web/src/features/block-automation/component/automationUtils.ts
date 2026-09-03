import {
  formatDateTime as formatLocalizedDateTime,
  getDateLocale,
  t,
} from '@app/lib/i18n';
import { DEFAULT_MODEL } from '@core/component/AI/constant';
import type { Model } from '@core/component/AI/types';
import { blockNameToDefaultFile } from '@core/constant/allBlocks';
import {
  buildCron as buildCronExpression,
  type CronParts,
  DEFAULT_TIME,
  DEFAULT_WEEKDAYS,
  getDefaultTimezone,
  isValidTime,
  parseCron as parseCronParts,
} from '@core/util/cron';
import { ThrownResultError } from '@core/util/result';
import type {
  AgentTask,
  CreateScheduledAction,
  ScheduledAction,
  UpdateScheduledAction,
} from '@service-scheduled-action/generated/schemas';
import type { ScheduleDraft, ScheduleFrequency } from './types';

export {
  DEFAULT_TIME,
  getDefaultTimezone,
  isValidTime,
  WEEKDAY_OPTIONS,
} from '@core/util/cron';

export const INPUT_CLASS =
  'w-full border border-edge-muted rounded-sm bg-surface px-2 py-1.5 text-sm text-ink outline-none placeholder:text-ink-placeholder focus:border-accent/20 cursor-default';

export const FREQUENCY_OPTIONS: Array<{
  value: ScheduleFrequency;
  labelKey: string;
}> = [
  { value: 'week', labelKey: 'automation.frequency.week' },
  { value: 'month', labelKey: 'automation.frequency.month' },
];

/** Localized short weekday label for the cron crate's 1=Sunday numbering. */
export function weekdayLabel(value: string): string {
  const day = Number(value);
  if (!Number.isInteger(day) || day < 1 || day > 7) return value;
  return formatLocalizedDateTime(new Date(2026, 0, 3 + day), {
    weekday: 'short',
  });
}

function normalizePrompt(value: string) {
  return value
    .trim()
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
}

function deriveScheduleName(prompt: string) {
  const summary = normalizePrompt(prompt);
  if (!summary) return blockNameToDefaultFile('automation');
  return summary.length > 72 ? `${summary.slice(0, 71)}…` : summary;
}

/** The cron-editable parts of a draft, which is all the shared helpers need. */
function cronParts(draft: ScheduleDraft): CronParts {
  return {
    frequency: draft.frequency,
    time: draft.time,
    daysOfWeek: draft.daysOfWeek,
    dayOfMonth: draft.dayOfMonth,
  };
}

export function describeSchedule(draft: ScheduleDraft, timezone: string) {
  const parts = cronParts(draft);
  const [hour, minute] = parts.time.split(':').map(Number);
  const time = isValidTime(parts.time)
    ? formatLocalizedDateTime(new Date(2026, 0, 1, hour, minute), {
        hour: 'numeric',
        minute: '2-digit',
      })
    : parts.time;

  if (parts.frequency === 'month') {
    const day = Number(parts.dayOfMonth);
    return Number.isInteger(day) && day >= 1 && day <= 31
      ? t('automation.schedule.monthlyDay', { day, time, timezone })
      : t('automation.schedule.monthly', { time, timezone });
  }

  const sorted = [...parts.daysOfWeek].sort((a, b) => Number(a) - Number(b));
  let days: string;
  if (sorted.length === 0) {
    days = t('automation.schedule.noDays');
  } else if (sorted.length === 7) {
    days = t('automation.schedule.everyDay');
  } else if (
    sorted.length === 5 &&
    sorted.every((day) => DEFAULT_WEEKDAYS.includes(day))
  ) {
    days = t('automation.schedule.weekdays');
  } else if (
    sorted.length === 2 &&
    sorted.includes('1') &&
    sorted.includes('7')
  ) {
    days = t('automation.schedule.weekends');
  } else {
    days = new Intl.ListFormat(getDateLocale(), {
      style: 'long',
      type: 'conjunction',
    }).format(sorted.map(weekdayLabel));
  }
  return t('automation.schedule.weekly', { days, time, timezone });
}

type ParsedCron = Pick<
  ScheduleDraft,
  'frequency' | 'time' | 'daysOfWeek' | 'dayOfMonth'
>;

/**
 * Read a cron expression into the parts an automation's picker edits.
 *
 * A pass-through: the shared parser only ever reports frequencies this picker
 * can render, so there is nothing to adapt.
 */
export function parseCron(cron: string): ParsedCron {
  return parseCronParts(cron);
}

function buildCron(draft: ScheduleDraft) {
  return buildCronExpression(cronParts(draft));
}

export function createEmptyDraft(): ScheduleDraft {
  return {
    name: '',
    prompt: '',
    frequency: 'week',
    time: DEFAULT_TIME,
    daysOfWeek: [...DEFAULT_WEEKDAYS],
    dayOfMonth: '1',
    model: DEFAULT_MODEL,
    enabled: true,
  };
}

function getAgentTask(schedule: ScheduledAction): AgentTask {
  // Backend stores task as a JSON object; for kind === "Agent" it is shaped
  // like AgentTask. Cast through unknown to satisfy the open-ended type.
  return schedule.task as unknown as AgentTask;
}

export function draftFromSchedule(schedule: ScheduledAction): ScheduleDraft {
  const parsed = parseCron(schedule.schedule);
  const task = getAgentTask(schedule);

  return {
    id: schedule.id ?? undefined,
    name: schedule.name,
    prompt: task.user_prompt ?? '',
    frequency: parsed.frequency,
    time: parsed.time,
    daysOfWeek: parsed.daysOfWeek,
    dayOfMonth: parsed.dayOfMonth,
    model: (task.model as Model) ?? undefined,
    enabled: schedule.enabled,
  };
}

function buildAgentTask(draft: ScheduleDraft): AgentTask {
  return {
    model: draft.model,
    prompt: '',
    user_prompt: draft.prompt.trim(),
  };
}

export function draftToCreateBody(draft: ScheduleDraft): CreateScheduledAction {
  return {
    name: draft.name.trim() || deriveScheduleName(draft.prompt),
    schedule: buildCron(draft),
    kind: 'Agent',
    timezone: getDefaultTimezone(),
    task: buildAgentTask(draft) as unknown as CreateScheduledAction['task'],
    enabled: draft.enabled,
  };
}

export function draftToUpdateBody(
  draft: ScheduleDraft,
  previous: ScheduledAction
): UpdateScheduledAction {
  return {
    name: draft.name.trim() || deriveScheduleName(draft.prompt),
    schedule: buildCron(draft),
    kind: 'Agent',
    timezone: previous.timezone || getDefaultTimezone(),
    task: buildAgentTask(draft) as unknown as UpdateScheduledAction['task'],
    enabled: draft.enabled,
  };
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return t('automation.date.never');

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('automation.date.invalid');

  return formatLocalizedDateTime(date, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function getErrorMessage(error: unknown) {
  if (error instanceof ThrownResultError) {
    return error.errors.map((item) => item.message).join(', ');
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return t('automation.error.tryAgain');
}

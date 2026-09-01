import { getDateLocale, t } from '@app/lib/i18n';
import { formatDateAndTime } from '@entity';
import BellSimple from '@phosphor-icons/core/regular/bell-simple.svg';
import Check from '@phosphor-icons/core/regular/check.svg';
import Trash from '@phosphor-icons/core/regular/trash.svg';
import type { NamedTool } from '@service-cognition/generated/tools/tool';
import type {
  ListReminders as ListRemindersTool,
  ReminderEntityType,
  UpdateReminder as UpdateReminderTool,
} from '@service-cognition/generated/tools/types';
import { createSignal, For, Show } from 'solid-js';
import { BaseTool } from './BaseTool';
import { Tool } from './Tool';
import { createToolRenderer } from './ToolRenderer';

type ToolReminder = NamedTool<
  'ListReminders',
  'response'
>['data']['reminders'][number];

const ENTITY_TYPE_KEYS: Record<ReminderEntityType, string> = {
  document: 'ai.tools.reminders.entities.document',
  ai_chat: 'ai.tools.reminders.entities.chat',
  project: 'ai.tools.reminders.entities.project',
  email: 'ai.tools.reminders.entities.email',
  channel: 'ai.tools.reminders.entities.channel',
  call: 'ai.tools.reminders.entities.call',
  calendar_event: 'ai.tools.reminders.entities.calendarEvent',
};

const entityTypeLabel = (entityType: ReminderEntityType) =>
  t(ENTITY_TYPE_KEYS[entityType]);

const formatList = (items: string[]) =>
  new Intl.ListFormat(getDateLocale(), {
    style: 'long',
    type: 'conjunction',
  }).format(items);

/** What the list call asked for, in the same voice as the notification tools. */
const formatReminderFilters = (filters: ListRemindersTool) => {
  if (filters.reminderIds?.length) {
    return t('ai.tools.reminders.filters.byId', {
      count: filters.reminderIds.length,
    });
  }

  const parts = [
    t(
      filters.completed
        ? 'ai.tools.reminders.filters.done'
        : 'ai.tools.reminders.filters.notDone'
    ),
  ];
  if (filters.overdue != null) {
    parts.push(
      t(
        filters.overdue
          ? 'ai.tools.reminders.filters.overdue'
          : 'ai.tools.reminders.filters.upcoming'
      )
    );
  }

  let text = t('ai.tools.reminders.filters.filteredBy', {
    filters: formatList(parts),
  });
  if (filters.entityType) {
    text += ` ${t('ai.tools.reminders.filters.forEntity', {
      entity: entityTypeLabel(filters.entityType),
    })}`;
  }
  return text;
};

/**
 * What an update actually changed, so the row is readable without expanding
 * the arguments. Reads off the request rather than the response because the
 * response is the merged reminder and no longer says which fields moved.
 */
const formatReminderUpdate = (update: UpdateReminderTool) => {
  const changes: string[] = [];
  if (update.completed === true)
    changes.push(t('ai.tools.reminders.update.markDone'));
  if (update.completed === false)
    changes.push(t('ai.tools.reminders.update.reopen'));
  if (update.remindAt)
    changes.push(
      t('ai.tools.reminders.update.moveTo', {
        date: formatDateAndTime(update.remindAt),
      })
    );
  if (update.description != null)
    changes.push(t('ai.tools.reminders.update.reword'));
  return changes.length > 0
    ? changes.join(', ')
    : t('ai.tools.reminders.update.update');
};

const ReminderList = (props: { reminders: ToolReminder[] }) => (
  <Tool.List>
    <div class="max-h-60 overflow-y-auto overscroll-contain">
      <For each={props.reminders}>
        {(reminder) => (
          <Tool.ListItem icon={<BellSimple class="size-4" />}>
            <div class="flex min-w-0 items-center justify-between gap-3">
              <span class="min-w-0 truncate text-ink">
                {reminder.description}
              </span>
              <span
                class="shrink-0 whitespace-nowrap text-xs"
                classList={{
                  'text-ink-extra-muted': !reminder.overdue,
                  'text-ink-muted': reminder.overdue,
                }}
              >
                {reminder.overdue
                  ? `${t('ai.tools.reminders.overdue')} · `
                  : ''}
                {formatDateAndTime(reminder.nextRunAt)}
              </span>
            </div>
          </Tool.ListItem>
        )}
      </For>
    </div>
  </Tool.List>
);

const listRemindersHandler = createToolRenderer({
  name: 'ListReminders',
  render: (ctx) => {
    const [isExpanded, setIsExpanded] = createSignal(false);
    const reminders = () => ctx.response?.data.reminders ?? [];
    const hasResults = () => reminders().length > 0;
    const statusText = () => {
      if (!ctx.response) return undefined;
      const count = reminders().length;
      return t('ai.tools.reminders.resultCount', { count });
    };

    return (
      <BaseTool
        align="start"
        icon={BellSimple}
        renderContext={ctx.renderContext}
        type="call"
        response={
          hasResults() && isExpanded() ? (
            <ReminderList reminders={reminders()} />
          ) : undefined
        }
      >
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <div class="flex min-w-0 items-center justify-between gap-3 overflow-hidden">
            <span class="min-w-0 truncate">{t('ai.tools.reminders.read')}</span>
            <Tool.ResultToggle
              expanded={isExpanded()}
              onToggle={() => setIsExpanded((expanded) => !expanded)}
              showToggle={hasResults()}
              status={statusText()}
            />
          </div>
          <div class="min-w-0 truncate text-xs text-ink-placeholder">
            {formatReminderFilters(ctx.tool.data)}
          </div>
        </div>
      </BaseTool>
    );
  },
});

const createReminderHandler = createToolRenderer({
  name: 'CreateReminder',
  render: (ctx) => (
    <BaseTool
      align="start"
      icon={BellSimple}
      renderContext={ctx.renderContext}
      type="call"
    >
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <div class="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <span class="shrink-0">
            {t(
              ctx.response
                ? 'ai.tools.reminders.created'
                : 'ai.tools.reminders.create'
            )}
          </span>
          <span class="min-w-0 truncate text-ink">
            {ctx.response?.data.description ?? ctx.tool.data.description}
          </span>
        </div>
        <div class="min-w-0 truncate text-xs text-ink-placeholder">
          {formatDateAndTime(
            ctx.response?.data.nextRunAt ?? ctx.tool.data.remindAt
          )}
          <Show when={ctx.tool.data.entityType}>
            {(entityType) => (
              <>
                {' '}
                ·{' '}
                {t('ai.tools.reminders.aboutEntity', {
                  entity: entityTypeLabel(entityType()),
                })}
              </>
            )}
          </Show>
        </div>
      </div>
    </BaseTool>
  ),
});

const updateReminderHandler = createToolRenderer({
  name: 'UpdateReminder',
  render: (ctx) => (
    <BaseTool
      align="start"
      icon={ctx.tool.data.completed === true ? Check : BellSimple}
      renderContext={ctx.renderContext}
      type="call"
    >
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <div class="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <span class="shrink-0">
            {t(
              ctx.response
                ? 'ai.tools.reminders.updated'
                : 'ai.tools.reminders.update.title'
            )}
          </span>
          <Show when={ctx.response?.data.description}>
            {(description) => (
              <span class="min-w-0 truncate text-ink">{description()}</span>
            )}
          </Show>
        </div>
        <div class="min-w-0 truncate text-xs text-ink-placeholder">
          {formatReminderUpdate(ctx.tool.data)}
          <Show when={ctx.response?.data.nextRunAt}>
            {(nextRunAt) => (
              <>
                {' '}
                ·{' '}
                {t('ai.tools.reminders.firesAt', {
                  date: formatDateAndTime(nextRunAt()),
                })}
              </>
            )}
          </Show>
        </div>
      </div>
    </BaseTool>
  ),
});

const deleteReminderHandler = createToolRenderer({
  name: 'DeleteReminder',
  render: (ctx) => (
    <BaseTool icon={Trash} renderContext={ctx.renderContext} type="call">
      {t(
        ctx.response
          ? 'ai.tools.reminders.deleted'
          : 'ai.tools.reminders.delete'
      )}
    </BaseTool>
  ),
});

export {
  createReminderHandler,
  deleteReminderHandler,
  listRemindersHandler,
  updateReminderHandler,
};

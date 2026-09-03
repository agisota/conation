import { getDateLocale, t } from '@app/lib/i18n';
import Check from '@phosphor-icons/core/regular/check.svg';
import List from '@phosphor-icons/core/regular/list.svg';
import type { ListNotifications as ListNotificationsTool } from '@service-cognition/generated/tools/types';
import { Show } from 'solid-js';
import { BaseTool } from './BaseTool';
import { createToolRenderer } from './ToolRenderer';

type NotificationFilterType = NonNullable<
  ListNotificationsTool['includeTypes']
>[number];

const NOTIFICATION_TYPE_KEYS: Record<NotificationFilterType, string> = {
  email: 'ai.tools.notifications.types.email',
  message: 'ai.tools.notifications.types.message',
  channel: 'ai.tools.notifications.types.channel',
  document: 'ai.tools.notifications.types.document',
  project: 'ai.tools.notifications.types.project',
  chat: 'ai.tools.notifications.types.chat',
  call: 'ai.tools.notifications.types.call',
  task: 'ai.tools.notifications.types.task',
  github: 'ai.tools.notifications.types.github',
  reminder: 'ai.tools.notifications.types.reminder',
  calendar: 'ai.tools.notifications.types.calendar',
};

const formatList = (items: string[]) => {
  return new Intl.ListFormat(getDateLocale(), {
    style: 'long',
    type: 'conjunction',
  }).format(items);
};

const formatNotificationFilters = (filters: ListNotificationsTool) => {
  const statusFilters = [
    t(
      filters.done
        ? 'ai.tools.notifications.filters.done'
        : 'ai.tools.notifications.filters.notDone'
    ),
  ];
  if (filters.seen != null) {
    statusFilters.push(
      t(
        filters.seen
          ? 'ai.tools.notifications.filters.seen'
          : 'ai.tools.notifications.filters.unseen'
      )
    );
  }

  let text = t('ai.tools.notifications.filters.filteredBy', {
    filters: formatList(statusFilters),
  });

  if (filters.includeTypes?.length) {
    text += ` ${t('ai.tools.notifications.filters.inTypes', {
      types: formatList(
        filters.includeTypes.map((type) => t(NOTIFICATION_TYPE_KEYS[type]))
      ),
    })}`;
  }

  if (filters.entities?.length) {
    text += ` ${t('ai.tools.notifications.filters.entityCount', {
      count: filters.entities.length,
    })}`;
  }

  return text;
};

const listNotificationsHandler = createToolRenderer({
  name: 'ListNotifications',
  render: (ctx) => {
    const count = () => ctx.response?.data.notifications.length ?? 0;
    const statusText = () => {
      if (!ctx.response) return undefined;
      return t('ai.tools.notifications.readCount', { count: count() });
    };

    return (
      <BaseTool
        align="start"
        icon={List}
        renderContext={ctx.renderContext}
        type="call"
      >
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <div class="flex min-w-0 items-center justify-between gap-3 overflow-hidden">
            <span class="min-w-0 truncate">
              {t('ai.tools.notifications.read')}
            </span>
            <Show when={statusText()}>
              {(text) => (
                <span class="shrink-0 whitespace-nowrap text-xs text-ink-extra-muted">
                  {text()}
                </span>
              )}
            </Show>
          </div>
          <div class="min-w-0 truncate text-xs text-ink-placeholder">
            {formatNotificationFilters(ctx.tool.data)}
          </div>
        </div>
      </BaseTool>
    );
  },
});

const markNotificationsSeenHandler = createToolRenderer({
  name: 'MarkNotificationsSeen',
  render: (ctx) => (
    <BaseTool icon={Check} renderContext={ctx.renderContext} type="call">
      {t('ai.tools.notifications.markSeen', {
        count: ctx.tool.data.notificationIds.length,
      })}
    </BaseTool>
  ),
});

const markNotificationsDoneHandler = createToolRenderer({
  name: 'MarkNotificationsDone',
  render: (ctx) => (
    <BaseTool icon={Check} renderContext={ctx.renderContext} type="call">
      {t('ai.tools.notifications.markDone', {
        count: ctx.tool.data.notificationIds.length,
        state: ctx.tool.data.done ? 'done' : 'notDone',
      })}
    </BaseTool>
  ),
});

export {
  listNotificationsHandler,
  markNotificationsDoneHandler,
  markNotificationsSeenHandler,
};

import { t } from '@app/lib/i18n';
import type { SettingsTab } from '@core/constant/SettingsState';
import type { NotificationEventGroupId } from '@notifications/notification-event-catalog';

const SETTINGS_GROUP_KEYS: Record<string, string> = {
  Admin: 'settings.navigation.groups.admin',
  General: 'settings.navigation.groups.general',
  Workspace: 'settings.navigation.groups.workspace',
};

const SETTINGS_TAB_KEYS: Partial<Record<SettingsTab, string>> = {
  Account: 'settings.navigation.tabs.account',
  Admin: 'settings.navigation.tabs.debug',
  Agent: 'settings.navigation.tabs.mcpServer',
  Appearance: 'settings.navigation.tabs.appearance',
  Billing: 'settings.navigation.tabs.billing',
  Bots: 'settings.navigation.tabs.bots',
  Connected: 'settings.navigation.tabs.connections',
  CRM: 'settings.navigation.tabs.crm',
  'Mobile App': 'settings.navigation.tabs.mobileApp',
  Notifications: 'settings.navigation.tabs.notifications',
  Shortcuts: 'settings.navigation.tabs.shortcuts',
  Tags: 'settings.navigation.tabs.tags',
  Team: 'settings.navigation.tabs.team',
};

const NOTIFICATION_GROUP_KEYS: Record<NotificationEventGroupId, string> = {
  ai: 'settings.notifications.groups.ai',
  calendar: 'settings.notifications.groups.calendar',
  channels: 'settings.notifications.groups.channels',
  documents: 'settings.notifications.groups.documents',
  email: 'settings.notifications.groups.email',
  github: 'settings.notifications.groups.github',
  tasks: 'settings.notifications.groups.tasks',
};

const NOTIFICATION_EVENT_KEYS: Record<
  string,
  { description: string; label: string }
> = {
  ai_response: {
    description: 'settings.notifications.events.aiReplies.description',
    label: 'settings.notifications.events.aiReplies.label',
  },
  calendar_event_reminder: {
    description:
      'settings.notifications.events.calendarEventReminders.description',
    label: 'settings.notifications.events.calendarEventReminders.label',
  },
  channel_mention: {
    description: 'settings.notifications.events.channelMentions.description',
    label: 'settings.notifications.events.channelMentions.label',
  },
  channel_message_reply: {
    description: 'settings.notifications.events.threadReplies.description',
    label: 'settings.notifications.events.threadReplies.label',
  },
  channel_message_send: {
    description: 'settings.notifications.events.newChannelMessages.description',
    label: 'settings.notifications.events.newChannelMessages.label',
  },
  commented_on_document: {
    description: 'settings.notifications.events.newComments.description',
    label: 'settings.notifications.events.newComments.label',
  },
  document_mention: {
    description: 'settings.notifications.events.documentMentions.description',
    label: 'settings.notifications.events.documentMentions.label',
  },
  github_pr_comment: {
    description:
      'settings.notifications.events.pullRequestComments.description',
    label: 'settings.notifications.events.pullRequestComments.label',
  },
  github_pr_mention: {
    description:
      'settings.notifications.events.pullRequestMentions.description',
    label: 'settings.notifications.events.pullRequestMentions.label',
  },
  github_pr_review: {
    description: 'settings.notifications.events.pullRequestReviews.description',
    label: 'settings.notifications.events.pullRequestReviews.label',
  },
  github_pr_status_changed: {
    description: 'settings.notifications.events.pullRequestStatus.description',
    label: 'settings.notifications.events.pullRequestStatus.label',
  },
  github_review_requested: {
    description: 'settings.notifications.events.reviewRequested.description',
    label: 'settings.notifications.events.reviewRequested.label',
  },
  mentioned_in_document_comment: {
    description: 'settings.notifications.events.commentMentions.description',
    label: 'settings.notifications.events.commentMentions.label',
  },
  new_email: {
    description: 'settings.notifications.events.newEmail.description',
    label: 'settings.notifications.events.newEmail.label',
  },
  replied_to_document_comment_thread: {
    description: 'settings.notifications.events.commentReplies.description',
    label: 'settings.notifications.events.commentReplies.label',
  },
  task_assigned: {
    description: 'settings.notifications.events.taskAssignments.description',
    label: 'settings.notifications.events.taskAssignments.label',
  },
  task_due: {
    description: 'settings.notifications.events.taskDue.description',
    label: 'settings.notifications.events.taskDue.label',
  },
};

const MUTED_ENTITY_KEYS: Record<string, string> = {
  calendar_event: 'settings.notifications.muted.entities.calendarEvent',
  channel: 'settings.notifications.muted.entities.channel',
  channel_message: 'settings.notifications.muted.entities.thread',
  chat: 'settings.notifications.muted.entities.chat',
  document: 'settings.notifications.muted.entities.document',
  email: 'settings.notifications.muted.entities.email',
  email_thread: 'settings.notifications.muted.entities.email',
  foreign: 'settings.notifications.muted.entities.github',
  foreign_entity: 'settings.notifications.muted.entities.github',
  reminder: 'settings.notifications.muted.entities.reminder',
  team: 'settings.notifications.muted.entities.team',
};

function translateOrFallback(key: string, fallback: string): string {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

export function settingsGroupLabel(label: string): string {
  const key = SETTINGS_GROUP_KEYS[label];
  return key ? translateOrFallback(key, label) : label;
}

export function settingsTabLabel(tab: SettingsTab, label: string): string {
  const key = SETTINGS_TAB_KEYS[tab];
  return key ? translateOrFallback(key, label) : label;
}

export function notificationGroupLabel(
  id: NotificationEventGroupId,
  label: string
): string {
  return translateOrFallback(NOTIFICATION_GROUP_KEYS[id], label);
}

export function notificationEventLabel(type: string, label: string): string {
  const keys = NOTIFICATION_EVENT_KEYS[type];
  return keys ? translateOrFallback(keys.label, label) : label;
}

export function notificationEventDescription(
  type: string,
  description: string
): string {
  const keys = NOTIFICATION_EVENT_KEYS[type];
  return keys
    ? translateOrFallback(keys.description, description)
    : description;
}

export function mutedEntityLabel(itemType: string, label: string): string {
  const key = MUTED_ENTITY_KEYS[itemType];
  return key ? translateOrFallback(key, label) : label;
}

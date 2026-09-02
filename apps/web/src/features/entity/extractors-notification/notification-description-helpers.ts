import { t } from '@app/lib/i18n';
import type { NotificationType } from '@core/types';
import { GITHUB_EVENT_TYPES } from '@notifications/github-event-types';
import { match } from 'ts-pattern';
import type { Notification } from '../types/notification';

/**
 * Whether the notification type is one of the GitHub PR event types, whose
 * sender is always presented as the GitHub identity.
 * @internal
 */
export function isGithubNotificationType(type: NotificationType): boolean {
  return (GITHUB_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * Gets unique sender IDs from a notification stack
 * @internal
 */
export function getUniqueSenderIds(notifications: Notification[]): string[] {
  const senderIds = new Set<string>();
  for (const notification of notifications) {
    if (notification.sender_id) {
      senderIds.add(notification.sender_id);
    }
  }
  return Array.from(senderIds);
}

/**
 * The GitHub login of the user who triggered a GitHub PR notification, carried
 * in the notification metadata. GitHub notifications always name the sender by
 * this login — never by the linked Macro user's name — even when the actor is
 * a Macro user and the notification has a `sender_id`.
 * @internal
 */
export function getGithubSenderLogin(
  notification: Notification
): string | undefined {
  const metadata = notification.notification_metadata;
  const content = (metadata as { content?: unknown }).content;
  if (
    content &&
    typeof content === 'object' &&
    'senderGithubLogin' in content
  ) {
    const login = (content as { senderGithubLogin?: string | null })
      .senderGithubLogin;
    return login ?? undefined;
  }
  return undefined;
}

/**
 * The GitHub avatar for the sender of a GitHub PR notification. Prefers the
 * avatar URL captured from the webhook, falling back to the login-derived
 * GitHub avatar endpoint.
 * @internal
 */
export function getGithubSenderAvatarUrl(
  notification: Notification
): string | undefined {
  const metadata = notification.notification_metadata;
  const content = (metadata as { content?: unknown }).content;
  if (
    content &&
    typeof content === 'object' &&
    'senderGithubAvatarUrl' in content
  ) {
    const url = (content as { senderGithubAvatarUrl?: string | null })
      .senderGithubAvatarUrl;
    if (url) return url;
  }

  const login = getGithubSenderLogin(notification);
  return login
    ? `https://github.com/${encodeURIComponent(login)}.png?size=80`
    : undefined;
}

/**
 * Gets unique GitHub sender logins from a notification stack, preserving order.
 * @internal
 */
export function getUniqueGithubLogins(notifications: Notification[]): string[] {
  const logins = new Set<string>();
  for (const notification of notifications) {
    const login = getGithubSenderLogin(notification);
    if (login) {
      logins.add(login);
    }
  }
  return Array.from(logins);
}

/**
 * Gets the action verb for a notification type
 * @internal
 */
export function getActionVerb(type: NotificationType): string {
  return (
    match(type)
      .with('channel_mention', () =>
        t('notifications.description.actions.channelMention')
      )
      .with('document_mention', () =>
        t('notifications.description.actions.documentShared')
      )
      .with('mentioned_in_document_comment', () =>
        t('notifications.description.actions.commentMention')
      )
      .with('replied_to_document_comment_thread', () =>
        t('notifications.description.actions.replied')
      )
      .with('commented_on_document', () =>
        t('notifications.description.actions.commented')
      )
      .with('channel_message_reply', () =>
        t('notifications.description.actions.replied')
      )
      .with('channel_message_send', () =>
        t('notifications.description.actions.messageSent')
      )
      .with('ai_response', () =>
        t('notifications.description.actions.aiResponse')
      )
      .with('new_email', () => t('notifications.description.actions.emailSent'))
      .with('channel_invite', () =>
        t('notifications.description.actions.invited')
      )
      .with('invite_to_team', () =>
        t('notifications.description.actions.invited')
      )
      .with('task_assigned', () =>
        t('notifications.description.actions.taskAssigned')
      )
      .with('github_pr_status_changed', () =>
        t('notifications.description.actions.pullRequestUpdated')
      )
      .with('github_pr_check_run', () =>
        t('notifications.description.actions.checkCompleted')
      )
      .with('github_review_requested', () =>
        t('notifications.description.actions.reviewRequested')
      )
      .with('github_pr_comment', () =>
        t('notifications.description.actions.pullRequestCommented')
      )
      .with('github_pr_mention', () =>
        t('notifications.description.actions.pullRequestMention')
      )
      .with('github_pr_review', () =>
        t('notifications.description.actions.pullRequestReviewed')
      )
      .with('call_started', () =>
        t('notifications.description.actions.callStarted')
      )
      // Reads as a standalone phrase, not an actor's action — nobody sent it.
      .with('reminder', () => t('notifications.description.actions.reminder'))
      .with('calendar_event_reminder', () =>
        t('notifications.description.actions.upcomingEvent')
      )
      .with('inbox_reauth_required', () =>
        t('notifications.description.actions.inboxReconnect')
      )
      .exhaustive()
  );
}

/**
 * Gets a noun for the notification type (for multi-notification descriptions)
 * @internal
 */
export function getTypeNoun(type: NotificationType, count: number): string {
  return match(type)
    .with('channel_message_reply', () =>
      t('notifications.description.nouns.reply', { count })
    )
    .with('channel_message_send', () =>
      t('notifications.description.nouns.message', { count })
    )
    .with('ai_response', () =>
      t('notifications.description.nouns.response', { count })
    )
    .with('channel_mention', () =>
      t('notifications.description.nouns.mention', { count })
    )
    .with('document_mention', () =>
      t('notifications.description.nouns.documentShared', { count })
    )
    .with('mentioned_in_document_comment', () =>
      t('notifications.description.nouns.mention', { count })
    )
    .with('replied_to_document_comment_thread', () =>
      t('notifications.description.nouns.reply', { count })
    )
    .with('commented_on_document', () =>
      t('notifications.description.nouns.comment', { count })
    )
    .with('new_email', () =>
      t('notifications.description.nouns.email', { count })
    )
    .with('channel_invite', () =>
      t('notifications.description.nouns.invite', { count })
    )
    .with('invite_to_team', () =>
      t('notifications.description.nouns.invite', { count })
    )
    .with('task_assigned', () =>
      t('notifications.description.nouns.task', { count })
    )
    .with('github_pr_status_changed', () =>
      t('notifications.description.nouns.pullRequest', { count })
    )
    .with('github_pr_check_run', () =>
      t('notifications.description.nouns.check', { count })
    )
    .with('github_review_requested', () =>
      t('notifications.description.nouns.reviewRequest', { count })
    )
    .with('github_pr_comment', () =>
      t('notifications.description.nouns.comment', { count })
    )
    .with('github_pr_mention', () =>
      t('notifications.description.nouns.mention', { count })
    )
    .with('github_pr_review', () =>
      t('notifications.description.nouns.review', { count })
    )
    .with('call_started', () =>
      t('notifications.description.nouns.call', { count })
    )
    .with('reminder', () =>
      t('notifications.description.nouns.reminder', { count })
    )
    .with('calendar_event_reminder', () =>
      t('notifications.description.nouns.event', { count })
    )
    .with('inbox_reauth_required', () =>
      t('notifications.description.nouns.inbox', { count })
    )
    .exhaustive();
}

export function getTypePreposition(type: NotificationType): string {
  return match(type)
    .with('document_mention', () =>
      t('notifications.description.prepositions.by')
    )
    .otherwise(() => t('notifications.description.prepositions.from'));
}

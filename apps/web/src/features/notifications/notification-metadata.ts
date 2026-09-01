import { formatDateTime, t } from '@app/lib/i18n';
import { match, P } from 'ts-pattern';
import { GITHUB_EVENT_TYPES } from './github-event-types';
import type { UnifiedNotification } from './types';

// Helper functions for derived notification data

export function getNotificationAction(n: UnifiedNotification): string {
  return (
    match(n.notification_metadata.tag)
      .with('channel_mention', () =>
        t('notifications.metadata.actions.channelMention')
      )
      .with('document_mention', () => {
        const meta = n.notification_metadata;
        if (
          meta.tag === 'document_mention' &&
          meta.content.subType?.type === 'task'
        ) {
          return t('notifications.metadata.actions.sentTask');
        }

        return t('notifications.metadata.actions.sentDocument');
      })
      .with('mentioned_in_document_comment', () =>
        t('notifications.metadata.actions.commentMention')
      )
      .with('replied_to_document_comment_thread', () =>
        t('notifications.metadata.actions.commentReply')
      )
      .with('commented_on_document', () =>
        t('notifications.metadata.actions.documentComment')
      )
      .with('channel_message_send', () =>
        t('notifications.metadata.actions.channelMessage')
      )
      .with('ai_response', () => t('notifications.metadata.actions.aiResponse'))
      .with('channel_message_reply', () =>
        t('notifications.metadata.actions.channelReply')
      )
      .with('call_started', () =>
        t('notifications.metadata.actions.callStarted')
      )
      .with('channel_invite', () =>
        t('notifications.metadata.actions.channelInvite')
      )
      .with('new_email', () => t('notifications.metadata.actions.newEmail'))
      .with('invite_to_team', () =>
        t('notifications.metadata.actions.teamInvite')
      )
      .with('task_assigned', () =>
        t('notifications.metadata.actions.taskAssigned')
      )
      // Self-set, so there is no actor — the sentence reads "Reminder about X"
      // rather than "<someone> reminded you about X".
      .with('reminder', () => t('notifications.metadata.actions.reminder'))
      // Same shape: no actor, reads "Upcoming event · <event title>".
      .with('calendar_event_reminder', () =>
        t('notifications.metadata.actions.upcomingEvent')
      )
      .with('github_pr_status_changed', () =>
        t('notifications.metadata.actions.pullRequestUpdated')
      )
      .with('github_pr_check_run', () => {
        const meta = n.notification_metadata;
        if (
          meta.tag === 'github_pr_check_run' &&
          meta.content.state === 'failed'
        ) {
          return t('notifications.metadata.actions.checkFailed');
        }

        return t('notifications.metadata.actions.checkCompleted');
      })
      .with('github_review_requested', () =>
        t('notifications.metadata.actions.reviewRequested')
      )
      .with('github_pr_comment', () =>
        t('notifications.metadata.actions.pullRequestComment')
      )
      .with('github_pr_mention', () =>
        t('notifications.metadata.actions.pullRequestMention')
      )
      .with('github_pr_review', () =>
        t('notifications.metadata.actions.pullRequestReviewed')
      )
      .with('inbox_reauth_required', () =>
        t('notifications.metadata.actions.inboxReconnect')
      )
      .exhaustive()
  );
}

export function getNotificationTargetName(
  n: UnifiedNotification
): string | undefined {
  const m = n.notification_metadata;
  return (
    match(m)
      .with({ tag: 'channel_invite' }, (m) => m.content.channelName)
      .with({ tag: 'document_mention' }, (m) => m.content.documentName)
      .with(
        { tag: 'mentioned_in_document_comment' },
        (m) => m.content.documentName
      )
      .with(
        { tag: 'replied_to_document_comment_thread' },
        (m) => m.content.documentName
      )
      .with({ tag: 'commented_on_document' }, (m) => m.content.documentName)
      .with({ tag: 'invite_to_team' }, (m) => m.content.teamName)
      .with({ tag: 'task_assigned' }, (m) => m.content.taskName ?? undefined)
      .with(
        { tag: P.union(...GITHUB_EVENT_TYPES) },
        (m) => `${m.content.owner}/${m.content.repo}#${m.content.number}`
      )
      .with({ tag: 'channel_mention' }, () => undefined)
      .with({ tag: 'channel_message_send' }, () => undefined)
      .with({ tag: 'ai_response' }, () => undefined)
      .with({ tag: 'channel_message_reply' }, () => undefined)
      .with({ tag: 'call_started' }, (m) => m.content.channel_name ?? undefined)
      .with({ tag: 'new_email' }, () => undefined)
      // The reminder's entity name is resolved from the notification's entity,
      // not carried in the metadata.
      .with({ tag: 'reminder' }, () => undefined)
      .with(
        { tag: 'calendar_event_reminder' },
        (m) => m.content.title || t('notifications.metadata.noTitle')
      )
      .with({ tag: 'inbox_reauth_required' }, () => undefined)
      .exhaustive()
  );
}

export function getNotificationContent(
  n: UnifiedNotification
): string | undefined {
  const m = n.notification_metadata;
  return (
    match(m)
      .with({ tag: 'channel_mention' }, (m) => m.content.messageContent)
      .with({ tag: 'channel_message_send' }, (m) => m.content.messageContent)
      .with({ tag: 'ai_response' }, (m) => m.content.summary)
      .with({ tag: 'channel_message_reply' }, (m) => m.content.messageContent)
      .with({ tag: 'call_started' }, () => undefined)
      .with({ tag: 'document_mention' }, (m) => m.content.documentName)
      .with({ tag: 'mentioned_in_document_comment' }, (m) => m.content.text)
      .with(
        { tag: 'replied_to_document_comment_thread' },
        (m) => m.content.text
      )
      .with({ tag: 'commented_on_document' }, (m) => m.content.text)
      .with({ tag: 'new_email' }, (m) => m.content.subject)
      .with({ tag: 'task_assigned' }, (m) => m.content.taskName ?? undefined)
      .with(
        { tag: P.union('github_pr_status_changed', 'github_review_requested') },
        (m) => m.content.title || m.content.displayName
      )
      .with(
        { tag: 'github_pr_check_run' },
        (m) => m.content.checkName || m.content.title || m.content.displayName
      )
      .with(
        { tag: 'github_pr_comment' },
        (m) =>
          m.content.commentSnippet || m.content.title || m.content.displayName
      )
      .with(
        { tag: 'github_pr_mention' },
        (m) => m.content.textSnippet || m.content.title || m.content.displayName
      )
      .with(
        { tag: 'github_pr_review' },
        (m) =>
          m.content.reviewSnippet || m.content.title || m.content.displayName
      )
      .with({ tag: 'channel_invite' }, () => undefined)
      .with({ tag: 'invite_to_team' }, () => undefined)
      // The description the user wrote is the whole point of a reminder.
      .with({ tag: 'reminder' }, (m) => m.content.description)
      .with({ tag: 'calendar_event_reminder' }, (m) =>
        formatCalendarReminderTime(m.content)
      )
      .with({ tag: 'inbox_reauth_required' }, (m) => m.content.emailAddress)
      .exhaustive()
  );
}

/**
 * Renders the occurrence's time in the viewer's zone: "2:30 PM – 3:00 PM"
 * for timed events, "All day" otherwise. Kept in the viewer's zone — a
 * reminder is read where the user is, not where the event was created.
 */
export function formatCalendarReminderTime(content: {
  startsAt?: string | null;
  endsAt?: string | null;
  startDate?: string | null;
}): string | undefined {
  if (!content.startsAt) {
    return content.startDate ? t('notifications.metadata.allDay') : undefined;
  }
  const start = formatDateTime(new Date(content.startsAt), {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (!content.endsAt) return start;
  const end = formatDateTime(new Date(content.endsAt), {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${start} – ${end}`;
}

export function shouldShowNotificationTarget(n: UnifiedNotification): boolean {
  const m = n.notification_metadata;
  return (
    match(m)
      .with(
        { tag: 'channel_mention' },
        (m) => m.content.channelType !== 'directMessage'
      )
      .with(
        { tag: 'channel_message_send' },
        (m) => m.content.channelType !== 'directMessage'
      )
      .with(
        { tag: 'channel_message_reply' },
        (m) => m.content.channelType !== 'directMessage'
      )
      .with({ tag: 'ai_response' }, () => false)
      .with({ tag: 'call_started' }, () => true)
      .with({ tag: 'new_email' }, () => false)
      .with({ tag: 'task_assigned' }, () => true)
      .with({ tag: P.union(...GITHUB_EVENT_TYPES) }, () => true)
      .with({ tag: 'document_mention' }, () => true)
      .with({ tag: 'mentioned_in_document_comment' }, () => true)
      .with({ tag: 'replied_to_document_comment_thread' }, () => true)
      .with({ tag: 'commented_on_document' }, () => true)
      .with({ tag: 'channel_invite' }, () => true)
      .with({ tag: 'invite_to_team' }, () => true)
      // Shown so "Reminder" reads as being about something; a standalone
      // reminder resolves to no target name and renders without one anyway.
      .with({ tag: 'reminder' }, () => true)
      .with({ tag: 'calendar_event_reminder' }, () => true)
      .with({ tag: 'inbox_reauth_required' }, () => false)
      .exhaustive()
  );
}

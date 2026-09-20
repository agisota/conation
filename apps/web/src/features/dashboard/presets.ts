/**
 * Seeded dashboard ViewSchema presets.
 *
 * Each entry is a valid `View`. Titles use `dashboard.presets.*` keys already
 * seeded in locale JSON. Queries are intentionally minimal — soup filter
 * composition lives in next-soup; presets only need parseable `Query` objects.
 */

import type { View, Widget } from '@app/features/dynamic-ui/schema';
import { NIL_UUID } from '@app/features/next-soup/filters/configs/base';
import type { Query } from '@app/features/next-soup/filters/filter-store';
import { t } from '@app/lib/i18n';

export const DASHBOARD_PRESET_IDS = [
  'morning',
  'inboxZero',
  'channels',
  'myTasks',
  'leadBoard',
  'calendarPins',
  'disk',
  'notes',
  'canvases',
  'agents',
  'crmStandup',
  'afterCall',
  'watch',
  'favorites',
  'activity',
  'mailMeetings',
  'newLead',
  'support',
  'content',
  'blank',
] as const;

export type DashboardPresetId = (typeof DASHBOARD_PRESET_IDS)[number];

export type DashboardPreset = {
  id: DashboardPresetId;
  view: View;
};

const unreadDm: Query = {
  include: { channelType: ['direct_message'], channelSeen: false },
};

const dms: Query = {
  include: { channelType: ['direct_message'] },
};

const myTasksOpen: Query = {
  include: { subType: ['task'], documentDone: false },
};

const tasks: Query = { include: { subType: ['task'] } };

const mailImportant: Query = {
  include: { emailImportance: true, emailShared: 'exclude' },
  emailView: 'inbox',
};

const unreadMail: Query = {
  include: { emailSeen: false },
  emailView: 'inbox',
};

const inboxSignal: Query = {
  include: {
    emailDone: false,
    emailImportance: true,
    channelDone: false,
  },
  emailView: 'inbox',
};

const watchedUnread: Query = {
  include: {
    channelImportance: true,
    channelIsParticipant: [true],
    channelSeen: false,
  },
};

const remindersActive: Query = {
  include: { includeReminders: true, reminderCompleted: false },
};

const notes: Query = {
  documentWhere: {
    op: 'and',
    clauses: [
      { include: { fileType: ['md'] } },
      { exclude: { subType: ['snippet', 'task', 'skill'] } },
    ],
  },
};

const canvases: Query = {
  documentWhere: { include: { fileType: ['canvas'] } },
};

const recentDocs: Query = { exclude: { subType: ['task'] } };

const files: Query = {
  exclude: { fileAssoc: ['assoc:md', 'assoc:canvas'], subType: ['task'] },
};

const agents: Query = { exclude: { chatId: [NIL_UUID] } };

const companiesActive: Query = { include: { crmCompanyHidden: false } };

const missedCalls: Query = { include: { callStatus: 'MISSED' } };

const mailCalendar: Query = {
  include: { emailCalendarOnly: true, emailShared: 'exclude' },
  emailView: 'all',
};

const mentions: Query = {
  include: { channelImportance: true, channelSeen: false },
};

const emptyQuery: Query = {};

const unpinnedMessage = (): Widget => ({
  type: 'channelMessage',
  channelId: '',
  messageId: '',
});

const list = (query: Query, limit?: number): Widget => ({
  type: 'list',
  source: { kind: 'query', query },
  ...(limit === undefined ? {} : { limit }),
});

const kpi = (query: Query, metric: 'count' | 'overdue' | 'unread'): Widget => ({
  type: 'kpi',
  query,
  metric,
});

function view(id: DashboardPresetId, widgets: Widget[]): View {
  return { title: t(`dashboard.presets.${id}`), widgets };
}

const builders: Record<DashboardPresetId, () => View> = {
  morning: () =>
    view('morning', [
      {
        type: 'container',
        direction: 'row',
        gap: 3,
        children: [kpi(unreadDm, 'unread'), kpi(myTasksOpen, 'count')],
      },
      { type: 'calendar', range: 'day', source: 'mine' },
      list(dms, 10),
    ]),

  inboxZero: () =>
    view('inboxZero', [
      list(mailImportant, 10),
      kpi(unreadMail, 'unread'),
      list(inboxSignal),
    ]),

  channels: () =>
    view('channels', [
      list(watchedUnread),
      {
        type: 'container',
        direction: 'row',
        gap: 3,
        children: [unpinnedMessage(), unpinnedMessage()],
      },
      list(dms),
    ]),

  myTasks: () =>
    view('myTasks', [
      list(myTasksOpen),
      kpi(myTasksOpen, 'overdue'),
      { type: 'calendar', range: 'week', source: 'mine' },
    ]),

  leadBoard: () =>
    view('leadBoard', [
      // Schema groupBy is date | entity_type | project — not status.
      list(tasks, 20),
      list(tasks),
    ]),

  calendarPins: () =>
    view('calendarPins', [
      { type: 'calendar', range: 'week', source: 'team' },
      { type: 'pins', kind: 'explicit', entities: [] },
      list(remindersActive),
    ]),

  disk: () =>
    view('disk', [
      { type: 'pins', kind: 'explicit', entities: [] },
      list(recentDocs),
      kpi(files, 'count'),
    ]),

  notes: () =>
    view('notes', [
      list(notes, 10),
      { type: 'pins', kind: 'explicit', entities: [] },
      { type: 'md', markdown: `# ${t('dashboard.modules.md')}` },
    ]),

  canvases: () =>
    view('canvases', [
      list(canvases),
      { type: 'pins', kind: 'explicit', entities: [] },
    ]),

  agents: () =>
    view('agents', [list(agents), list(agents), kpi(agents, 'count')]),

  crmStandup: () =>
    view('crmStandup', [
      list(companiesActive),
      kpi(companiesActive, 'count'),
      list(tasks),
    ]),

  afterCall: () =>
    view('afterCall', [
      list(missedCalls),
      { type: 'calendar', range: 'day', source: 'mine' },
      list(tasks),
    ]),

  watch: () =>
    view('watch', [list(watchedUnread), list(mailImportant), kpi(mentions, 'unread')]),

  favorites: () =>
    view('favorites', [
      { type: 'pins', kind: 'favorites' },
      list(recentDocs),
      { type: 'calendar', range: 'agenda', source: 'mine' },
    ]),

  activity: () =>
    view('activity', [
      { type: 'activity', filter: 'team', limit: 20 },
      list(tasks),
      unpinnedMessage(),
    ]),

  mailMeetings: () =>
    view('mailMeetings', [
      list(mailCalendar),
      { type: 'calendar', range: 'week', source: 'mine' },
      list(myTasksOpen),
    ]),

  newLead: () =>
    view('newLead', [
      { type: 'md', markdown: '- [ ]\n- [ ]\n- [ ]' },
      list(emptyQuery),
      { type: 'pins', kind: 'explicit', entities: [] },
    ]),

  support: () =>
    view('support', [
      list(inboxSignal),
      list(tasks),
      kpi(myTasksOpen, 'overdue'),
    ]),

  content: () =>
    view('content', [
      list(notes),
      list(canvases),
      { type: 'pins', kind: 'explicit', entities: [] },
    ]),

  blank: () =>
    view('blank', [
      {
        type: 'container',
        direction: 'row',
        gap: 4,
        align: 'stretch',
        children: [
          {
            type: 'container',
            direction: 'col',
            gap: 3,
            title: t('dashboard.editor.addModule'),
            children: [
              { type: 'md', markdown: t('dashboard.editor.addModule') },
            ],
          },
          {
            type: 'container',
            direction: 'col',
            gap: 3,
            title: t('dashboard.editor.addModule'),
            children: [
              { type: 'md', markdown: t('dashboard.editor.addModule') },
            ],
          },
        ],
      },
    ]),
};

/** Locale-aware View for one seeded preset. */
export function getDashboardPreset(id: DashboardPresetId): View {
  return builders[id]();
}

/** All twenty presets, in catalog order. */
export function getDashboardPresets(): DashboardPreset[] {
  return DASHBOARD_PRESET_IDS.map((id) => ({
    id,
    view: builders[id](),
  }));
}

/** Factory map — call the entry so titles pick up the current locale. */
export const DASHBOARD_PRESETS = builders;

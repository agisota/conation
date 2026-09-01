import type { ListView } from '@app/constants/list-views';
import { t } from '@app/lib/i18n';
import type { TabItem } from '@core/component/Tabs';

/** Views that have tab definitions. Shared between VIEW_TAB_LISTS and VIEW_TAB_PRESETS. */
export type TabbedListView = Extract<
  ListView,
  | 'inbox'
  | 'agents'
  | 'mail'
  | 'documents'
  | 'tasks'
  | 'channels'
  | 'calls'
  | 'folders'
  | 'reminders'
>;

/** Tab definitions for each list view. */
export const VIEW_TAB_LISTS: Record<TabbedListView, TabItem[]> = {
  inbox: [
    {
      value: 'signal',
      get label() {
        return t('soup.tabs.signal');
      },
    },
    {
      value: 'noise',
      get label() {
        return t('soup.tabs.noise');
      },
    },
    {
      value: 'all',
      get label() {
        return t('soup.tabs.all');
      },
    },
    // Hidden from every tab surface for unflagged users (see
    // `useVisibleViewTabs`); listed here so the tab/preset consistency tests
    // still cover it.
    {
      value: 'reminders',
      get label() {
        return t('soup.tabs.reminders');
      },
    },
  ],
  agents: [
    {
      value: 'owned',
      get label() {
        return t('soup.tabs.owned');
      },
    },
    {
      value: 'running',
      get label() {
        return t('soup.tabs.running');
      },
    },
    {
      value: 'shared',
      get label() {
        return t('soup.tabs.shared');
      },
    },
    {
      value: 'automations',
      get label() {
        return t('soup.tabs.automations');
      },
    },
    {
      value: 'skills',
      get label() {
        return t('soup.tabs.skills');
      },
    },
  ],
  mail: [
    {
      value: 'important',
      get label() {
        return t('soup.tabs.signal');
      },
    },
    {
      value: 'noise',
      get label() {
        return t('soup.tabs.noise');
      },
    },
    {
      value: 'sent',
      get label() {
        return t('soup.tabs.sent');
      },
    },
    {
      value: 'calendar',
      get label() {
        return t('soup.tabs.calendar');
      },
    },
    {
      value: 'drafts',
      get label() {
        return t('soup.tabs.drafts');
      },
    },
    {
      value: 'shared',
      get label() {
        return t('soup.tabs.shared');
      },
    },
    {
      value: 'all',
      get label() {
        return t('soup.tabs.all');
      },
    },
  ],
  documents: [
    {
      value: 'owned',
      get label() {
        return t('soup.tabs.owned');
      },
    },
    {
      value: 'shared',
      get label() {
        return t('soup.tabs.shared');
      },
    },
    {
      value: 'attachments',
      get label() {
        return t('soup.tabs.attachments');
      },
    },
    {
      value: 'folders',
      get label() {
        return t('soup.tabs.folders');
      },
    },
    {
      value: 'all',
      get label() {
        return t('soup.tabs.all');
      },
    },
  ],
  tasks: [
    {
      value: 'my-tasks',
      get label() {
        return t('soup.tabs.myTasks');
      },
    },
    {
      value: 'all',
      get label() {
        return t('soup.tabs.all');
      },
    },
  ],
  channels: [
    {
      value: 'recent',
      get label() {
        return t('soup.tabs.recent');
      },
    },
    {
      value: 'people',
      get label() {
        return t('soup.tabs.people');
      },
    },
    {
      value: 'teams',
      get label() {
        return t('soup.tabs.teams');
      },
    },
  ],
  calls: [
    {
      value: 'all',
      get label() {
        return t('soup.tabs.all');
      },
    },
    {
      value: 'missed',
      get label() {
        return t('soup.tabs.missed');
      },
    },
    {
      value: 'unattended',
      get label() {
        return t('soup.tabs.unattended');
      },
    },
  ],
  folders: [
    {
      value: 'owned',
      get label() {
        return t('soup.tabs.owned');
      },
    },
    {
      value: 'all',
      get label() {
        return t('soup.tabs.all');
      },
    },
  ],
  reminders: [
    {
      value: 'active',
      get label() {
        return t('soup.tabs.active');
      },
    },
    {
      value: 'scheduled',
      get label() {
        return t('soup.tabs.scheduled');
      },
    },
    {
      value: 'done',
      get label() {
        return t('soup.tabs.done');
      },
    },
  ],
};

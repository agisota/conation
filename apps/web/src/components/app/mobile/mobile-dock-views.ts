import { useCalendarUiFlag } from '@app/features/calendar/hooks/use-calendar-ui-flag';
import { buildDocumentTypeQuery } from '@app/features/next-soup/filters/configs/document-type-query';
import { t } from '@app/lib/i18n';
import WideCalendarIcon from '@icon/wide-calendar.svg';
import { AnimatedCallIcon } from '@icon/wide-call';
import { AnimatedChannelIcon } from '@icon/wide-channel';
import { AnimatedCompanyIcon } from '@icon/wide-company';
import { AnimatedEmailIcon } from '@icon/wide-email';
import { AnimatedFileMdIcon } from '@icon/wide-fileMd';
import { AnimatedHomeIcon } from '@icon/wide-home';
import { AnimatedInboxIcon } from '@icon/wide-inbox';
import { AnimatedStarIcon } from '@icon/wide-star';
import { AnimatedTaskIcon } from '@icon/wide-task';
import BellIcon from '@phosphor/bell-simple.svg';
import GridFourIcon from '@phosphor/grid-four.svg';
import NotepadIcon from '@phosphor/notepad.svg';
import { type Accessor, createMemo } from 'solid-js';
import type { MobileTouchIconComponent } from './MobileTouchMenu';
import type { MobileNavViewId } from './mobile-nav-views';

export type MobileDockView = {
  id: Exclude<MobileNavViewId, 'search' | 'settings'>;
  label: string;
  /** Views-menu row icon (animated where available). */
  icon: MobileTouchIconComponent;
  /** Plain svg icons (e.g. the calendar) don't accept `triggerAnimation`. */
  animateIcon?: boolean;
  /** When set, the scope pill renders icon-only with this icon. */
  pillIcon?: MobileTouchIconComponent;
};

/** Destinations that appear only in the dock More menu, not the search pills. */
export type MobileMoreDestination = {
  id: 'home' | 'dashboard' | 'companies' | 'notes' | 'reminders';
  label: string;
  icon: MobileTouchIconComponent;
  /** Plain svg icons don't accept `triggerAnimation`. */
  animateIcon?: boolean;
};

const markdownDocumentsQuery = buildDocumentTypeQuery(['doc-markdown']);

/** Documents list filtered to markdown — desktop Notes dest. No `notes` component. */
export const MOBILE_NOTES_DOCUMENTS_CONTENT = {
  type: 'component' as const,
  id: 'documents' as const,
  params: {
    initialFilters: markdownDocumentsQuery ?? {},
    initialClientFilters: {
      and: ['document-or-file'],
      or: ['doc-markdown'],
    },
  },
};

export const isMobileNotesDocumentsContent = (content: {
  type: string;
  id: string;
  params?: Record<string, unknown>;
} | undefined): boolean => {
  if (content?.type !== 'component' || content.id !== 'documents') return false;
  const or = (
    content.params?.initialClientFilters as
      | { or?: readonly unknown[] }
      | undefined
  )?.or;
  return or?.includes('doc-markdown') ?? false;
};

/**
 * More-menu destinations that are not search-scope pills. Ungated — CRM /
 * reminders / dashboard flags are applied by the destination itself.
 * `companies` is the customers list-view id; `dashboard` is the dashboard
 * list-view id (not Home). Notes opens the documents list with markdown
 * filters — there is no registered `notes` component.
 */
export const MOBILE_MORE_DESTINATIONS: MobileMoreDestination[] = [
  {
    id: 'home',
    get label() {
      return t('shell.navigation.home');
    },
    icon: AnimatedHomeIcon,
  },
  {
    id: 'dashboard',
    get label() {
      return t('shell.navigation.dashboard');
    },
    icon: GridFourIcon,
    animateIcon: false,
  },
  {
    id: 'companies',
    get label() {
      return t('shell.navigation.customers');
    },
    icon: AnimatedCompanyIcon,
  },
  {
    id: 'notes',
    get label() {
      return t('shell.navigation.notes');
    },
    icon: NotepadIcon,
    animateIcon: false,
  },
  {
    id: 'reminders',
    get label() {
      return t('shell.navigation.reminders');
    },
    icon: BellIcon,
    animateIcon: false,
  },
];

/**
 * The navigation views shared by the search scope pills (MobileViewsRow) and
 * the dock's Views menu (MoreViewsMenu), in canonical order: the pill row
 * renders it as-is after the "All" pill, the menu reversed so Inbox stays
 * nearest the thumb. "All" (pills only) and Settings (menu only) are
 * per-surface additions at the edges.
 */
const MOBILE_DOCK_VIEWS: MobileDockView[] = [
  {
    id: 'inbox',
    get label() {
      return t('shell.navigation.inbox');
    },
    icon: AnimatedInboxIcon,
    pillIcon: BellIcon,
  },
  {
    id: 'calendar',
    get label() {
      return t('shell.navigation.calendar');
    },
    icon: WideCalendarIcon,
    animateIcon: false,
    pillIcon: WideCalendarIcon,
  },
  {
    id: 'mail',
    get label() {
      return t('shell.navigation.email');
    },
    icon: AnimatedEmailIcon,
  },
  {
    id: 'channels',
    get label() {
      return t('shell.navigation.channels');
    },
    icon: AnimatedChannelIcon,
  },
  {
    id: 'documents',
    get label() {
      return t('shell.navigation.files');
    },
    icon: AnimatedFileMdIcon,
  },
  {
    id: 'agents',
    get label() {
      return t('shell.navigation.agents');
    },
    icon: AnimatedStarIcon,
  },
  {
    id: 'tasks',
    get label() {
      return t('shell.navigation.tasks');
    },
    icon: AnimatedTaskIcon,
  },
  {
    id: 'calls',
    get label() {
      return t('shell.navigation.calls');
    },
    icon: AnimatedCallIcon,
  },
];

/** The dock views with feature gating applied (the calendar UI flag). */
export function useMobileDockViews(): Accessor<MobileDockView[]> {
  const calendarUiEnabled = useCalendarUiFlag();
  return createMemo(() =>
    MOBILE_DOCK_VIEWS.filter(
      (view) => view.id !== 'calendar' || calendarUiEnabled()
    )
  );
}

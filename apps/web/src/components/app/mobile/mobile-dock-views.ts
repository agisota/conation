import { useCalendarUiFlag } from '@app/features/calendar/hooks/use-calendar-ui-flag';
import { buildDocumentTypeQuery } from '@app/features/next-soup/filters/configs/document-type-query';
import { t } from '@app/lib/i18n';
import { getIconConfig } from '@core/component/EntityIcon';
import { AnimatedCompanyIcon } from '@icon/wide-company';
import { AnimatedHomeIcon } from '@icon/wide-home';
import BellIcon from '@phosphor/bell.svg';
import BellSimpleIcon from '@phosphor/bell-simple.svg';
import GridFourIcon from '@phosphor/grid-four.svg';
import NotepadIcon from '@phosphor/notepad.svg';
import BellFillIcon from '@phosphor-fill/bell-fill.svg';
import CalendarFillIcon from '@phosphor-fill/calendar-fill.svg';
import EmailFillIcon from '@phosphor-fill/envelope-fill.svg';
import FilesFillIcon from '@phosphor-fill/files-fill.svg';
import ChannelFillIcon from '@phosphor-fill/hash-straight-fill.svg';
import { type Accessor, createMemo } from 'solid-js';
import type { MobileDockIcon } from './MobileDockButton';
import type { MobileNavViewId } from './mobile-nav-views';

export type MobileDockView = {
  id: Exclude<MobileNavViewId, 'search' | 'settings'>;
  label: string;
  /** Phosphor glyph for this view. */
  icon: MobileDockIcon;
  iconActive?: MobileDockIcon;
  /** When set, the scope pill renders icon-only with this icon. */
  pillIcon?: MobileDockIcon;
};

/** Destinations that appear only in the dock More menu, not the search pills. */
export type MobileMoreDestination = {
  id: 'home' | 'dashboard' | 'companies' | 'notes' | 'reminders';
  label: string;
  icon: MobileDockIcon;
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

export const isMobileNotesDocumentsContent = (content:
  | {
      type: string;
      id: string;
      params?: Record<string, unknown>;
    }
  | undefined): boolean => {
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
  },
  {
    id: 'reminders',
    get label() {
      return t('shell.navigation.reminders');
    },
    icon: BellSimpleIcon,
  },
];

/**
 * Shared navigation order for the dock and search scope pills. The dock shows
 * as many views as fit and puts the remainder in More. All and Settings are
 * added by their respective surfaces.
 */
const MOBILE_DOCK_VIEWS: readonly MobileDockView[] = [
  {
    id: 'inbox',
    get label() {
      return t('shell.navigation.inbox');
    },
    icon: BellIcon,
    iconActive: BellFillIcon,
    pillIcon: BellIcon,
  },
  {
    id: 'calendar',
    get label() {
      return t('shell.navigation.calendar');
    },
    icon: getIconConfig('calendar').icon,
    iconActive: CalendarFillIcon,
    pillIcon: getIconConfig('calendar').icon,
  },
  {
    id: 'mail',
    get label() {
      return t('shell.navigation.email');
    },
    icon: getIconConfig('email').icon,
    iconActive: EmailFillIcon,
  },
  {
    id: 'channels',
    get label() {
      return t('shell.navigation.channels');
    },
    icon: getIconConfig('channel').icon,
    iconActive: ChannelFillIcon,
  },
  {
    id: 'documents',
    get label() {
      return t('shell.navigation.files');
    },
    icon: getIconConfig('files').icon,
    iconActive: FilesFillIcon,
  },
  {
    id: 'agents',
    get label() {
      return t('shell.navigation.agents');
    },
    icon: getIconConfig('agent').icon,
  },
  {
    id: 'tasks',
    get label() {
      return t('shell.navigation.tasks');
    },
    icon: getIconConfig('task').icon,
  },
  {
    id: 'calls',
    get label() {
      return t('shell.navigation.calls');
    },
    icon: getIconConfig('call').icon,
  },
];

/** The dock views with feature gating applied (the calendar UI flag). */
export function useMobileDockViews(): Accessor<MobileDockView[]> {
  const calendarEnabled = useCalendarUiFlag();
  return createMemo(() =>
    MOBILE_DOCK_VIEWS.filter(
      (view) => view.id !== 'calendar' || calendarEnabled()
    )
  );
}

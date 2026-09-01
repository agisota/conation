import { useCalendarSearchUiFlag } from '@app/features/calendar/hooks/use-calendar-ui-flag';
import type {
  CallStatus,
  PropertyFilter,
  TagFilterMode,
} from '@app/features/next-soup/filters/filter-store/types';
import { usePosthog } from '@app/lib/analytics/posthog';
import { t } from '@app/lib/i18n';
import { EntityIcon } from '@core/component/EntityIcon';
import { UserIcon } from '@core/component/UserIcon';
import { useQuickAccess } from '@core/context/quickAccess';
import { useUserId } from '@core/context/user';
import { EntityIcon as EntityIconWithAvatar } from '@entity/extractors/entity-icon';
import { PropertyValueIcon } from '@property/component/propertyValue/PropertyValueIcon';
import { PROPERTY_OPTION_IDS } from '@property/constants';
import { type Accessor, createEffect, createMemo, type JSX } from 'solid-js';
import { useInboxPicker } from '../inbox-picker';
import type { SearchableOption } from '../searchable-multi-select';
import { useTagOptions } from '../tag-filter';
import type {
  SearchFiltersController,
  SearchIndexId,
  SearchTypeValue,
} from './search-filters-state';

export const SEARCH_INDEX_OPTIONS: {
  value: SearchIndexId;
  label: string;
  icon: () => JSX.Element;
}[] = [
  {
    value: 'channels',
    get label() {
      return t('soup.entityTypes.channels');
    },
    icon: () => (
      <EntityIcon targetType="channel" size="xs" theme="monochrome" />
    ),
  },
  {
    value: 'document-or-file',
    get label() {
      return t('soup.entityTypes.documents');
    },
    icon: () => <EntityIcon targetType="md" size="xs" theme="monochrome" />,
  },
  {
    value: 'task',
    get label() {
      return t('soup.entityTypes.tasks');
    },
    icon: () => <EntityIcon targetType="task" size="xs" theme="monochrome" />,
  },
  {
    value: 'email',
    get label() {
      return t('soup.entityTypes.email');
    },
    icon: () => <EntityIcon targetType="email" size="xs" theme="monochrome" />,
  },
  {
    value: 'calls',
    get label() {
      return t('soup.entityTypes.calls');
    },
    icon: () => <EntityIcon targetType="call" size="xs" theme="monochrome" />,
  },
  {
    value: 'folders',
    get label() {
      return t('soup.entityTypes.folders');
    },
    icon: () => (
      <EntityIcon targetType="project" size="xs" theme="monochrome" />
    ),
  },
  {
    value: 'agent',
    get label() {
      return t('soup.entityTypes.agents');
    },
    icon: () => <EntityIcon targetType="chat" size="xs" theme="monochrome" />,
  },
];

/**
 * Calendar is offered as a search type only where the calendar UI is enabled:
 * opening an event needs the calendar block, which the same flag gates, so a
 * disabled workspace would surface events it can't open.
 */
const CALENDAR_TYPE_OPTION: (typeof SEARCH_INDEX_OPTIONS)[number] = {
  value: 'calendar',
  get label() {
    return t('soup.entityTypes.calendar');
  },
  icon: () => <EntityIcon targetType="calendar" size="xs" theme="monochrome" />,
};

const CALL_STATUS_LABELS: Record<CallStatus, string> = {
  get ATTENDED() {
    return t('soup.call.status.attended');
  },
  get MISSED() {
    return t('soup.call.status.missed');
  },
  get UNATTENDED() {
    return t('soup.call.status.unattended');
  },
};

const optionIcon = (optionId: string) => () => (
  <PropertyValueIcon optionId={optionId} class="size-3.5" />
);

const TASK_STATUS_OPTIONS: SearchableOption[] = [
  {
    id: PROPERTY_OPTION_IDS.STATUS.NOT_STARTED,
    get label() {
      return t('soup.taskStatus.notStarted');
    },
    icon: optionIcon(PROPERTY_OPTION_IDS.STATUS.NOT_STARTED),
  },
  {
    id: PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS,
    get label() {
      return t('soup.taskStatus.inProgress');
    },
    icon: optionIcon(PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS),
  },
  {
    id: PROPERTY_OPTION_IDS.STATUS.IN_REVIEW,
    get label() {
      return t('soup.taskStatus.inReview');
    },
    icon: optionIcon(PROPERTY_OPTION_IDS.STATUS.IN_REVIEW),
  },
  {
    id: PROPERTY_OPTION_IDS.STATUS.COMPLETED,
    get label() {
      return t('soup.taskStatus.completed');
    },
    icon: optionIcon(PROPERTY_OPTION_IDS.STATUS.COMPLETED),
  },
  {
    id: PROPERTY_OPTION_IDS.STATUS.CANCELED,
    get label() {
      return t('soup.taskStatus.canceled');
    },
    icon: optionIcon(PROPERTY_OPTION_IDS.STATUS.CANCELED),
  },
];

const TASK_PRIORITY_OPTIONS: SearchableOption[] = [
  {
    id: PROPERTY_OPTION_IDS.PRIORITY.URGENT,
    get label() {
      return t('soup.priority.urgent');
    },
    icon: optionIcon(PROPERTY_OPTION_IDS.PRIORITY.URGENT),
  },
  {
    id: PROPERTY_OPTION_IDS.PRIORITY.HIGH,
    get label() {
      return t('soup.priority.highShort');
    },
    icon: optionIcon(PROPERTY_OPTION_IDS.PRIORITY.HIGH),
  },
  {
    id: PROPERTY_OPTION_IDS.PRIORITY.MEDIUM,
    get label() {
      return t('soup.priority.mediumShort');
    },
    icon: optionIcon(PROPERTY_OPTION_IDS.PRIORITY.MEDIUM),
  },
  {
    id: PROPERTY_OPTION_IDS.PRIORITY.LOW,
    get label() {
      return t('soup.priority.lowShort');
    },
    icon: optionIcon(PROPERTY_OPTION_IDS.PRIORITY.LOW),
  },
];

export type FacetOption = {
  id: string;
  label: string;
  icon?: () => JSX.Element;
};

type FacetBase = {
  id: string;
  label: string;
  /** Display values — at least one entry; neutral state is synthesized. */
  values: Accessor<FacetOption[]>;
  isDefault: Accessor<boolean>;
  reset: () => void;
};

/** Optional any-of/all-of segment on a multi facet, à la Linear's label
 * filter. Rendered as its own dropdown segment between the facet label and
 * the values, only while `visible` (mode is meaningless under 2 values). */
export type FacetModeVM = {
  value: Accessor<TagFilterMode>;
  onSelect: (mode: TagFilterMode) => void;
  visible: Accessor<boolean>;
};

export type SearchFacetVM = FacetBase &
  (
    | {
        kind: 'single';
        options: FacetOption[];
        selectedId: Accessor<string>;
        onSelect: (id: string) => void;
      }
    | {
        kind: 'multi';
        options: Accessor<SearchableOption[]>;
        activeIds: Accessor<string[]>;
        onChange: (ids: string[]) => void;
        placeholder: string;
        preserveOrder?: boolean;
        onOnly?: (id: string) => void;
        mode?: FacetModeVM;
      }
  );

/**
 * Picker for the "In" chip (channels + DMs). Used by channel-message and
 * call-record search.
 */
function useChannelPicker(): Accessor<SearchableOption[]> {
  const { useList } = useQuickAccess();
  const channels = useList('channel', 'dm').items;

  return createMemo(() =>
    channels()
      .filter((ch) => ch.data.name)
      .map((ch) => ({
        id: ch.id,
        label: ch.data.name,
        icon: () => (
          <div class="size-4">
            <EntityIconWithAvatar
              entity={ch.data}
              suppressClick
              showTooltip={false}
            />
          </div>
        ),
      }))
  );
}

/**
 * Picker for the "From" chip (people). Used by channel-message sender
 * filter and call-record speaker filter.
 */
function usePersonPicker(): Accessor<SearchableOption[]> {
  const { useList } = useQuickAccess();
  const currentUserId = useUserId();
  const people = useList('person').items;

  return createMemo(() => {
    const uid = currentUserId();
    let me: SearchableOption | undefined;
    const others: SearchableOption[] = [];
    for (const s of people()) {
      const opt: SearchableOption = {
        id: s.id,
        label:
          s.id === uid
            ? s.data.name
              ? t('soup.people.currentUserNamed', { name: s.data.name })
              : t('soup.people.me')
            : s.data.name || s.id,
        icon: () => (
          <UserIcon id={s.id} size="sm" suppressClick showTooltip={false} />
        ),
      };
      if (s.id === uid) me = opt;
      else others.push(opt);
    }
    return [...(me ? [me] : []), ...others];
  });
}

function singleFacet(args: {
  id: string;
  label: string;
  options: FacetOption[];
  defaultId: string;
  selectedId: Accessor<string>;
  onSelect: (id: string) => void;
}): SearchFacetVM {
  return {
    kind: 'single',
    id: args.id,
    get label() {
      return args.label;
    },
    options: args.options,
    selectedId: args.selectedId,
    onSelect: args.onSelect,
    isDefault: () => args.selectedId() === args.defaultId,
    reset: () => args.onSelect(args.defaultId),
    values: () => {
      const selected = args.selectedId();
      const option = args.options.find((o) => o.id === selected);
      return [option ?? args.options[0]];
    },
  };
}

function multiFacet(args: {
  id: string;
  label: string;
  neutralLabel: string;
  placeholder: string;
  options: Accessor<SearchableOption[]>;
  activeIds: Accessor<string[]>;
  onChange: (ids: string[]) => void;
}): Extract<SearchFacetVM, { kind: 'multi' }> {
  return {
    kind: 'multi',
    id: args.id,
    get label() {
      return args.label;
    },
    options: args.options,
    activeIds: args.activeIds,
    onChange: args.onChange,
    get placeholder() {
      return args.placeholder;
    },
    isDefault: () => args.activeIds().length === 0,
    reset: () => args.onChange([]),
    values: () => {
      const ids = args.activeIds();
      if (ids.length === 0) return [{ id: 'all', label: args.neutralLabel }];
      const options = args.options();
      return ids.map((id) => {
        const option = options.find((o) => o.id === id);
        return { id, label: option?.label ?? id, icon: option?.icon };
      });
    },
  };
}

/**
 * Materializes the facet registry against the controller. Each facet is
 * defined once; which ones render follows the active type. Adding a facet =
 * one definition here + its compile line in `compileSearchQuery`.
 */
export function useSearchFacets(
  controller: SearchFiltersController
): Accessor<SearchFacetVM[]> {
  const channelOptions = useChannelPicker();
  const personOptions = usePersonPicker();
  const inboxPicker = useInboxPicker({
    selectedIds: controller.emailInbox,
    setSelectedIds: controller.setEmailInbox,
  });

  const tagSource = useTagOptions();
  const calendarSearchEnabled = useCalendarSearchUiFlag();
  const posthog = usePosthog();

  // The calendar type exists only while calendar search is enabled. If the flag
  // turns off (or a persisted search restores a calendar scope while it is off),
  // its Type option disappears and the chip falls back to "All", but the
  // compiled query would still carry the calendar seed — reset the type so the
  // displayed chip and the query agree. Wait for the flags to load first: a
  // PostHog flag reads `false` until it resolves, and resetting on that would
  // rewrite a legitimately-restored Calendar search to All before the flag
  // arrives.
  createEffect(() => {
    if (
      posthog.flagsLoaded() &&
      !calendarSearchEnabled() &&
      controller.type() === 'calendar'
    ) {
      controller.setType('all');
    }
  });

  const typeOptions = createMemo<FacetOption[]>(() => [
    { id: 'all', label: t('soup.tabs.all') },
    ...[
      ...SEARCH_INDEX_OPTIONS,
      ...(calendarSearchEnabled() ? [CALENDAR_TYPE_OPTION] : []),
    ].map((o) => ({ id: o.value, label: o.label, icon: o.icon })),
  ]);

  const buildTypeFacet = () =>
    singleFacet({
      id: 'type',
      label: t('soup.filters.categories.type'),
      options: typeOptions(),
      defaultId: 'all',
      selectedId: controller.type,
      onSelect: (id) => controller.setType(id as SearchTypeValue),
    });

  const importance = singleFacet({
    id: 'importance',
    get label() {
      return t('soup.search.facets.importance');
    },
    options: [
      {
        id: 'all',
        get label() {
          return t('soup.tabs.all');
        },
      },
      {
        id: 'signal',
        get label() {
          return t('soup.tabs.signal');
        },
      },
      {
        id: 'noise',
        get label() {
          return t('soup.tabs.noise');
        },
      },
    ],
    defaultId: 'all',
    selectedId: () => {
      const value = controller.emailImportance();
      if (value === undefined) return 'all';
      return value ? 'signal' : 'noise';
    },
    onSelect: (id) =>
      controller.setEmailImportance(id === 'all' ? undefined : id === 'signal'),
  });

  const inbox: SearchFacetVM = {
    kind: 'multi',
    id: 'email-inbox',
    get label() {
      return t('soup.search.facets.inbox');
    },
    options: inboxPicker.options,
    activeIds: inboxPicker.activeIds,
    onChange: (ids) =>
      ids.length ? inboxPicker.onChange(ids) : inboxPicker.reset(),
    onOnly: inboxPicker.selectOnly,
    get placeholder() {
      return t('soup.filters.inboxes.searchPlaceholder');
    },
    preserveOrder: true,
    isDefault: inboxPicker.isDefault,
    reset: inboxPicker.reset,
    values: () => {
      const ids = controller.emailInbox();
      if (ids === undefined)
        return [{ id: 'all', label: t('soup.filters.inboxes.all') }];
      if (ids.length === 0)
        return [{ id: 'none', label: t('soup.filters.inboxes.none') }];
      const options = inboxPicker.options();
      return ids.map((id) => {
        const option = options.find((o) => o.id === id);
        return { id, label: option?.label ?? id, icon: option?.icon };
      });
    },
  };

  const channelIn = multiFacet({
    id: 'channel-in',
    get label() {
      return t('soup.search.facets.in');
    },
    get neutralLabel() {
      return t('soup.search.facets.allChannels');
    },
    get placeholder() {
      return t('soup.search.facets.searchChannels');
    },
    options: channelOptions,
    activeIds: controller.channelIn,
    onChange: controller.setChannelIn,
  });

  const channelFrom = multiFacet({
    id: 'channel-from',
    get label() {
      return t('soup.search.facets.from');
    },
    get neutralLabel() {
      return t('soup.search.facets.anyone');
    },
    get placeholder() {
      return t('soup.search.facets.searchSenders');
    },
    options: personOptions,
    activeIds: controller.channelFrom,
    onChange: controller.setChannelFrom,
  });

  const callIn = multiFacet({
    id: 'call-in',
    get label() {
      return t('soup.search.facets.in');
    },
    get neutralLabel() {
      return t('soup.search.facets.allChannels');
    },
    get placeholder() {
      return t('soup.search.facets.searchChannels');
    },
    options: channelOptions,
    activeIds: controller.callIn,
    onChange: controller.setCallIn,
  });

  const callFrom = multiFacet({
    id: 'call-from',
    get label() {
      return t('soup.search.facets.from');
    },
    get neutralLabel() {
      return t('soup.search.facets.anyone');
    },
    get placeholder() {
      return t('soup.search.facets.searchSpeakers');
    },
    options: personOptions,
    activeIds: controller.callFrom,
    onChange: controller.setCallFrom,
  });

  const callStatus = singleFacet({
    id: 'call-status',
    get label() {
      return t('soup.fields.status');
    },
    options: [
      {
        id: 'all',
        get label() {
          return t('soup.tabs.all');
        },
      },
      ...(Object.keys(CALL_STATUS_LABELS) as CallStatus[]).map((status) => ({
        id: status,
        get label() {
          return CALL_STATUS_LABELS[status];
        },
      })),
    ],
    defaultId: 'all',
    selectedId: () => controller.callStatus() ?? 'all',
    onSelect: (id) =>
      controller.setCallStatus(id === 'all' ? undefined : (id as CallStatus)),
  });

  const taskStatus = multiFacet({
    id: 'task-status',
    get label() {
      return t('soup.fields.status');
    },
    get neutralLabel() {
      return t('soup.search.facets.anyStatus');
    },
    get placeholder() {
      return t('soup.search.facets.filterStatus');
    },
    options: () => TASK_STATUS_OPTIONS,
    activeIds: controller.taskStatus,
    onChange: controller.setTaskStatus,
  });

  const taskPriority = multiFacet({
    id: 'task-priority',
    get label() {
      return t('soup.fields.priority');
    },
    get neutralLabel() {
      return t('soup.search.facets.anyPriority');
    },
    get placeholder() {
      return t('soup.search.facets.filterPriority');
    },
    options: () => TASK_PRIORITY_OPTIONS,
    activeIds: controller.taskPriority,
    onChange: controller.setTaskPriority,
  });

  const taskAssignee = multiFacet({
    id: 'task-assignee',
    get label() {
      return t('soup.fields.assignee');
    },
    get neutralLabel() {
      return t('soup.search.facets.anyone');
    },
    get placeholder() {
      return t('soup.filters.assignees.placeholder');
    },
    options: personOptions,
    activeIds: controller.taskAssignees,
    onChange: controller.setTaskAssignees,
  });

  const taskCreatedBy = multiFacet({
    id: 'task-created-by',
    get label() {
      return t('soup.fields.createdBy');
    },
    get neutralLabel() {
      return t('soup.search.facets.anyone');
    },
    get placeholder() {
      return t('soup.filters.creators.placeholder');
    },
    options: personOptions,
    activeIds: controller.taskCreatedBy,
    onChange: controller.setTaskCreatedBy,
  });

  const tags: SearchFacetVM = {
    ...multiFacet({
      id: 'tags',
      get label() {
        return t('soup.fields.tags');
      },
      get neutralLabel() {
        return t('soup.search.facets.anyTag');
      },
      get placeholder() {
        return t('soup.filters.tags.placeholder');
      },
      options: tagSource.options,
      activeIds: () => controller.tags().map((t) => t.value),
      onChange: (ids) => {
        const byOption = tagSource.defByOption();
        controller.setTags(
          ids.reduce<PropertyFilter[]>((acc, id) => {
            const propertyId = byOption.get(id);
            if (propertyId) acc.push({ propertyId, type: 'select', value: id });
            return acc;
          }, [])
        );
      },
    }),
    mode: {
      value: controller.tagMode,
      onSelect: controller.setTagMode,
      visible: () => controller.tags().length >= 2,
    },
  };

  // Tags show only where tagging applies (all/documents/tasks/emails/agents/
  // folders), and hidden when the caller has no tags defined.
  const tagFacets = (): SearchFacetVM[] => (tagSource.hasTags() ? [tags] : []);

  return createMemo(() => {
    const type = buildTypeFacet();
    switch (controller.type()) {
      case 'email':
        return inboxPicker.hasMultiple()
          ? [type, importance, inbox, ...tagFacets()]
          : [type, importance, ...tagFacets()];
      case 'channels':
        return [type, channelIn, channelFrom];
      case 'calls':
        return [type, callIn, callFrom, callStatus, ...tagFacets()];
      case 'task':
        return [
          type,
          taskStatus,
          taskPriority,
          taskAssignee,
          taskCreatedBy,
          ...tagFacets(),
        ];
      case 'document-or-file':
      case 'agent':
      case 'folders':
      case 'all':
        return [type, ...tagFacets()];
      // Calendar keyword search only for now; who/where/when facets come later.
      case 'calendar':
        return [type];
      default:
        return [type];
    }
  });
}

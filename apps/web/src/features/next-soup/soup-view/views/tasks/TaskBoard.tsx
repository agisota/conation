import {
  isCanceled,
  isCompleted,
} from '@app/features/next-soup/filters/predicates';
import { SoupEntityContextMenu } from '@app/features/next-soup/soup-view/soup-entity-context-menu';
import { useSoupView } from '@app/features/next-soup/soup-view/soup-view-context';
import {
  openEntityInSplitFromUnifiedList,
  preventDuplicatePreviewEntityOpen,
} from '@app/features/next-soup/utils';
import { formatDateTime, t } from '@app/lib/i18n';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { UserIcon } from '@core/component/UserIcon';
import {
  Entity,
  type EntityData,
  getTaskAssigneeIds,
  getTaskStatusOptionId,
  isTaskEntity,
  type TaskEntityWithProperties,
} from '@entity';
import { soupPropertyToProperty } from '@entity/extractors-property';
import { getTaskPriorityOptionId } from '@entity/utils/task-properties';
import CalendarBlank from '@phosphor/calendar-blank.svg';
import CircleDashed from '@phosphor/circle-dashed.svg';
import { PropertyValueIcon } from '@property/component/propertyValue';
import { PROPERTY_OPTION_IDS, SYSTEM_PROPERTY_IDS } from '@property/constants';
import { useBulkSaveEntityPropertiesMutation } from '@queries/properties/entity';
import { getSoupEntityById } from '@queries/soup/normalized-cache';
import { EntityType } from '@service-properties/generated/schemas/entityType';
import { createElementSize } from '@solid-primitives/resize-observer';
import { cn, Layer } from '@ui';
import { endOfWeek, isBefore, isToday, startOfDay } from 'date-fns';
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';

const MIN_COLUMN_WIDTH = 224;
const COLUMN_GAP = 12;
const BOARD_PADDING_X = 24;

const STATUS_PROPERTY = soupPropertyToProperty({
  id: SYSTEM_PROPERTY_IDS.STATUS,
  definition: {
    id: SYSTEM_PROPERTY_IDS.STATUS,
    display_name: 'Status',
    data_type: 'SELECT_STRING',
    is_metadata: false,
    is_multi_select: false,
    is_system: true,
    owner: { scope: 'system' },
    specific_entity_type: undefined,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  },
});

type StatusColumnKey =
  (typeof PROPERTY_OPTION_IDS.STATUS)[keyof typeof PROPERTY_OPTION_IDS.STATUS];

type TimelineColumnKey =
  | 'overdue'
  | 'today'
  | 'thisWeek'
  | 'later'
  | 'noDate';

type BoardColumn = {
  key: string;
  label: string;
  optionId?: string;
};

const STATUS_COLUMN_KEYS: StatusColumnKey[] = [
  PROPERTY_OPTION_IDS.STATUS.NOT_STARTED,
  PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS,
  PROPERTY_OPTION_IDS.STATUS.IN_REVIEW,
  PROPERTY_OPTION_IDS.STATUS.COMPLETED,
  PROPERTY_OPTION_IDS.STATUS.CANCELED,
];

const STATUS_LABEL_KEYS: Record<StatusColumnKey, string> = {
  [PROPERTY_OPTION_IDS.STATUS.NOT_STARTED]: 'soup.tasks.board.notStarted',
  [PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS]: 'soup.tasks.board.inProgress',
  [PROPERTY_OPTION_IDS.STATUS.IN_REVIEW]: 'soup.tasks.board.inReview',
  [PROPERTY_OPTION_IDS.STATUS.COMPLETED]: 'soup.tasks.board.completed',
  [PROPERTY_OPTION_IDS.STATUS.CANCELED]: 'soup.tasks.board.canceled',
};

const TIMELINE_LABEL_KEYS: Record<TimelineColumnKey, string> = {
  overdue: 'soup.tasks.timeline.overdue',
  today: 'soup.tasks.timeline.today',
  thisWeek: 'soup.tasks.timeline.thisWeek',
  later: 'soup.tasks.timeline.later',
  noDate: 'soup.tasks.timeline.noDate',
};

const TIMELINE_COLUMN_KEYS: TimelineColumnKey[] = [
  'overdue',
  'today',
  'thisWeek',
  'later',
  'noDate',
];

function getTaskDueDate(entity: TaskEntityWithProperties): Date | undefined {
  const due = entity.properties?.find(
    (property) => property.definition.id === SYSTEM_PROPERTY_IDS.DUE_DATE
  );
  if (!due?.value || due.value.type !== 'Date') return undefined;
  const raw = due.value.value;
  if (raw == null) return undefined;
  const date = new Date(raw as string | number);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function statusColumnKey(entity: TaskEntityWithProperties): StatusColumnKey {
  const optionId = getTaskStatusOptionId(entity);
  if (optionId && optionId in STATUS_LABEL_KEYS) {
    return optionId as StatusColumnKey;
  }
  if (isCompleted(entity)) return PROPERTY_OPTION_IDS.STATUS.COMPLETED;
  if (isCanceled(entity)) return PROPERTY_OPTION_IDS.STATUS.CANCELED;
  return PROPERTY_OPTION_IDS.STATUS.NOT_STARTED;
}

function timelineColumnKey(entity: TaskEntityWithProperties): TimelineColumnKey {
  const due = getTaskDueDate(entity);
  if (!due) return 'noDate';
  if (isToday(due)) return 'today';
  if (isBefore(due, startOfDay(new Date()))) return 'overdue';
  if (!isBefore(endOfWeek(new Date(), { weekStartsOn: 1 }), due)) {
    return 'thisWeek';
  }
  return 'later';
}

function withCachedProperties(
  entity: TaskEntityWithProperties
): TaskEntityWithProperties {
  if (entity.properties) return entity;
  const cached = getSoupEntityById(entity.id);
  if (cached?.tag !== 'document') return entity;
  return { ...entity, properties: cached.data.properties };
}

/**
 * Kanban / due-date board for the Tasks view. Board columns follow status;
 * timeline columns bucket by due date. Cards drag between status columns to
 * update STATUS (SELECT_STRING). Timeline is view-only.
 */
export function TaskBoard(props: { onScrollBottom?: VoidFunction }) {
  const { source, soup, viewMode } = useSoupView();
  const panel = useSplitPanelOrThrow();

  const isStatusBoard = () => viewMode() === 'board';

  const [statusOverrides, setStatusOverrides] = createSignal<
    ReadonlyMap<string, StatusColumnKey>
  >(new Map());

  const setStatusOverride = (entityId: string, statusKey: StatusColumnKey) => {
    setStatusOverrides((prev) => new Map(prev).set(entityId, statusKey));
  };

  const clearStatusOverride = (
    entityId: string,
    statusKey?: StatusColumnKey
  ) => {
    setStatusOverrides((prev) => {
      if (statusKey !== undefined && prev.get(entityId) !== statusKey) {
        return prev;
      }
      if (!prev.has(entityId)) return prev;
      const next = new Map(prev);
      next.delete(entityId);
      return next;
    });
  };

  const saveMutation = useBulkSaveEntityPropertiesMutation({
    onError: (_error, variables) => {
      for (const item of variables.properties) {
        if (item.apiValues.valueType !== 'SELECT_STRING') continue;
        const statusKey = item.apiValues.values?.[0];
        if (!statusKey || !(statusKey in STATUS_LABEL_KEYS)) continue;
        clearStatusOverride(item.entityId, statusKey as StatusColumnKey);
      }
    },
  });

  const tasks = createMemo(() => {
    const fromRows = soup
      .rows()
      .filter((row) => !row.getIsGrouped() && !row.getIsLoadMore())
      .map((row) => row.original);
    const fromSource = source.data();
    const merged = fromRows.length > 0 ? fromRows : fromSource;
    return merged.filter(isTaskEntity).map(withCachedProperties);
  });

  const effectiveStatus = (task: TaskEntityWithProperties) =>
    statusOverrides().get(task.id) ?? statusColumnKey(task);

  const boardColumns = createMemo((): BoardColumn[] => {
    if (isStatusBoard()) {
      return STATUS_COLUMN_KEYS.map((key) => ({
        key,
        label: t(STATUS_LABEL_KEYS[key]),
        optionId: key,
      }));
    }
    return TIMELINE_COLUMN_KEYS.map((key) => ({
      key,
      label: t(TIMELINE_LABEL_KEYS[key]),
    }));
  });

  const columns = createMemo(() => {
    const defs = boardColumns();
    const buckets = new Map<string, EntityData[]>(
      defs.map((column) => [column.key, []])
    );
    const fallback = defs[0]?.key;
    for (const task of tasks()) {
      const key = isStatusBoard()
        ? effectiveStatus(task)
        : timelineColumnKey(task);
      (buckets.get(buckets.has(key) ? key : fallback) ?? []).push(task);
    }
    return defs.map((column) => ({
      ...column,
      entities: buckets.get(column.key) ?? [],
    }));
  });

  const [draggedId, setDraggedId] = createSignal<string>();
  const [dropTarget, setDropTarget] = createSignal<string>();
  const [scrollRef, setScrollRef] = createSignal<HTMLDivElement>();

  const boardSize = createElementSize(scrollRef);
  const columnWidth = createMemo(() => {
    const width = boardSize.width;
    const count = boardColumns().length;
    if (!width || count === 0) return undefined;
    const usable = width - BOARD_PADDING_X;
    const fit = Math.max(
      1,
      Math.min(
        count,
        Math.floor((usable + COLUMN_GAP) / (MIN_COLUMN_WIDTH + COLUMN_GAP))
      )
    );
    return Math.floor((usable - (fit - 1) * COLUMN_GAP) / fit);
  });

  const handleColumnScroll = (event: Event & { currentTarget: HTMLElement }) => {
    const el = event.currentTarget;
    const threshold = Math.max(300, el.clientHeight);
    if (el.scrollHeight - el.clientHeight - el.scrollTop <= threshold) {
      props.onScrollBottom?.();
    }
  };

  createEffect(() => {
    void tasks().length;
    if (
      source.isFetching() ||
      source.isFetchingNextPage() ||
      !source.hasNextPage()
    )
      return;
    props.onScrollBottom?.();
  });

  const moveToStatus = (entityId: string, statusKey: string) => {
    if (!(statusKey in STATUS_LABEL_KEYS)) return;
    const key = statusKey as StatusColumnKey;
    const entity = tasks().find((task) => task.id === entityId);
    if (!entity) return;
    if (effectiveStatus(entity) === key) return;

    setStatusOverride(entityId, key);
    saveMutation.mutate({
      properties: [
        {
          entityId,
          entityType: EntityType.TASK,
          property: STATUS_PROPERTY,
          apiValues: {
            valueType: 'SELECT_STRING',
            values: [key],
          },
        },
      ],
    });
  };

  const openTask = (entity: EntityData, event: MouseEvent) => {
    if (
      !event.shiftKey &&
      !event.altKey &&
      panel.handle.isControllerSplit() &&
      preventDuplicatePreviewEntityOpen(entity, panel.handle)
    ) {
      return;
    }
    soup.focus.set(entity.id);

    void openEntityInSplitFromUnifiedList(entity, {
      openInNewSplit: event.shiftKey,
      replacePreview: !event.shiftKey && event.altKey,
      splitHandle: panel.handle,
      referredFrom: 'tasks',
    });
  };

  return (
    <div class="relative size-full min-w-0">
      <div
        ref={setScrollRef}
        class="size-full overflow-x-auto overflow-y-hidden scrollbar-hidden"
      >
        <div class="flex h-full gap-3 p-3">
          <For each={columns()}>
            {(column) => (
              <div
                class={cn(
                  'flex h-full min-w-56 flex-1 flex-col rounded-lg border border-edge-muted bg-surface',
                  dropTarget() === column.key &&
                    draggedId() &&
                    'border-accent/50 bg-accent/5'
                )}
                style={
                  columnWidth() !== undefined
                    ? { width: `${columnWidth()}px`, flex: 'none' }
                    : undefined
                }
                onDragOver={(e) => {
                  if (!isStatusBoard() || !draggedId()) return;
                  e.preventDefault();
                  setDropTarget(column.key);
                }}
                onDragLeave={(e) => {
                  if (
                    e.relatedTarget instanceof Node &&
                    e.currentTarget.contains(e.relatedTarget)
                  ) {
                    return;
                  }
                  if (dropTarget() === column.key) setDropTarget(undefined);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!isStatusBoard()) return;
                  const id =
                    draggedId() ?? e.dataTransfer?.getData('text/plain');
                  setDropTarget(undefined);
                  setDraggedId(undefined);
                  if (id) moveToStatus(id, column.key);
                }}
              >
                <div class="flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-ink-muted">
                  <Show
                    when={column.optionId}
                    fallback={
                      <CircleDashed class="size-3.5 text-ink-extra-muted" />
                    }
                  >
                    {(optionId) => (
                      <PropertyValueIcon
                        optionId={optionId()}
                        class="size-3.5"
                      />
                    )}
                  </Show>
                  <span class="truncate">{column.label}</span>
                  <span class="ml-auto tabular-nums text-ink-extra-muted font-medium">
                    {column.entities.length}
                  </span>
                </div>
                <div
                  class="min-h-0 flex-1 overflow-y-auto scrollbar-hidden flex flex-col gap-2 px-2 pb-2"
                  onScroll={handleColumnScroll}
                >
                  <For each={column.entities}>
                    {(entity) => (
                      <div class="shrink-0">
                        <SoupEntityContextMenu entity={entity}>
                          <TaskBoardCard
                            entity={entity}
                            draggable={isStatusBoard()}
                            dragging={draggedId() === entity.id}
                            onDragStart={(e) => {
                              if (!isStatusBoard()) return;
                              e.dataTransfer?.setData('text/plain', entity.id);
                              if (e.dataTransfer) {
                                e.dataTransfer.effectAllowed = 'move';
                              }
                              setDraggedId(entity.id);
                            }}
                            onDragEnd={() => {
                              setDraggedId(undefined);
                              setDropTarget(undefined);
                            }}
                            onClick={(e) => openTask(entity, e)}
                          />
                        </SoupEntityContextMenu>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
      <CustomScrollbar
        scrollContainer={scrollRef}
        horizontal
        revealZone={48}
        gutterSize={20}
        watchContent
      />
    </div>
  );
}

function TaskBoardCard(props: {
  entity: EntityData;
  draggable: boolean;
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onClick: (e: MouseEvent) => void;
}) {
  const task = () => props.entity as TaskEntityWithProperties;
  const assigneeIds = () => getTaskAssigneeIds(task());
  const priorityId = () => getTaskPriorityOptionId(task());

  return (
    <Layer depth={2}>
      <div
        draggable={props.draggable}
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
        onClick={props.onClick}
        class={cn(
          'flex flex-col gap-1.5 rounded-lg border border-edge-muted bg-panel p-2.5 text-sm',
          'hover:border-edge hover:bg-active transition-colors',
          props.dragging && 'opacity-40'
        )}
      >
        <div class="flex items-start gap-2 min-w-0">
          <div class="size-4 shrink-0">
            <Entity.Icon entity={props.entity} />
          </div>
          <span class="ph-no-capture line-clamp-2 font-semibold min-w-0">
            <Entity.Title entity={props.entity} />
          </span>
        </div>
        <div class="flex items-center gap-1.5 min-w-0">
          <Show when={priorityId()}>
            {(id) => (
              <PropertyValueIcon optionId={id()} class="size-3.5 shrink-0" />
            )}
          </Show>
          <Show when={getTaskDueDate(task())}>
            {(due) => (
              <span
                class={cn(
                  'inline-flex items-center gap-1 text-xs text-ink-extra-muted min-w-0',
                  isBefore(due(), startOfDay(new Date())) && 'text-failure'
                )}
              >
                <CalendarBlank class="size-3 shrink-0" />
                <span class="truncate">
                  {formatDateTime(due(), { month: 'short', day: 'numeric' })}
                </span>
              </span>
            )}
          </Show>
          <div class="ml-auto flex items-center -space-x-1 shrink-0">
            <For each={assigneeIds().slice(0, 2)}>
              {(id) => <UserIcon id={id} size="sm" suppressClick />}
            </For>
          </div>
        </div>
      </div>
    </Layer>
  );
}

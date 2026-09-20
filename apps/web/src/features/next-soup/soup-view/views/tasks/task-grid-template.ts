import { isTaskEntity, type EntityData } from '@entity';
import { differenceInCalendarDays, startOfDay } from 'date-fns';
import { createSignal } from 'solid-js';
import { t } from '@app/lib/i18n';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import { DataType } from '@service-storage/generated/schemas/dataType';
import { EntityType } from '@service-storage/generated/schemas/entityType';

export const TASK_GRID_COLUMNS = [
  {
    id: 'status',
    get label() {
      return t('soup.fields.status');
    },
    defId: SYSTEM_PROPERTY_IDS.STATUS,
    dataType: DataType.SELECT_STRING,
    isMultiSelect: false,
    specificEntityType: null,
    sortKey: 'status',
    // CSS variable with fallback - updated by container queries in task-grid.css
    width: 'var(--task-col-status, 7rem)',
  },
  {
    id: 'priority',
    get label() {
      return t('soup.fields.priority');
    },
    defId: SYSTEM_PROPERTY_IDS.PRIORITY,
    dataType: DataType.SELECT_STRING,
    isMultiSelect: false,
    specificEntityType: null,
    sortKey: 'priority',
    width: 'var(--task-col-priority, 7rem)',
  },
  {
    id: 'assignees',
    get label() {
      return t('soup.fields.assignees');
    },
    defId: SYSTEM_PROPERTY_IDS.ASSIGNEES,
    dataType: DataType.ENTITY,
    isMultiSelect: true,
    specificEntityType: EntityType.USER,
    width: 'var(--task-col-assignees, 7rem)',
  },
  {
    id: 'due',
    get label() {
      return t('soup.group.date');
    },
    defId: SYSTEM_PROPERTY_IDS.DUE_DATE,
    dataType: DataType.DATE,
    isMultiSelect: false,
    specificEntityType: null,
    sortKey: 'due_date',
    width: 'var(--task-col-due, 7rem)',
  },
] as const;

/** Width for the "Created By" column - only shown on wide containers */
const CREATED_BY_COLUMN_WIDTH = 'var(--task-col-created-by, 7rem)';

export type TaskGridColumn = (typeof TASK_GRID_COLUMNS)[number];

/** Grid template for narrow containers (no Created By column) */
const TASK_GRID_TEMPLATE_COLUMNS_NARROW = `1rem minmax(0, 100%) ${TASK_GRID_COLUMNS.map(
  (c) => c.width
).join(' ')} var(--task-col-timestamp, 5rem)`;

/** Grid template for wide containers (includes Created By column) */
export const TASK_GRID_TEMPLATE_COLUMNS_WIDE = `1rem minmax(0, 100%) ${TASK_GRID_COLUMNS.map(
  (c) => c.width
).join(' ')} ${CREATED_BY_COLUMN_WIDTH} var(--task-col-timestamp, 5rem)`;

/** Wide template without the leading indicator (checkbox) column. */
export const TASK_GRID_TEMPLATE_COLUMNS_WIDE_NO_INDICATOR = `minmax(0, 100%) ${TASK_GRID_COLUMNS.map(
  (c) => c.width
).join(' ')} ${CREATED_BY_COLUMN_WIDTH} var(--task-col-timestamp, 5rem)`;

/** @deprecated Use TASK_GRID_TEMPLATE_COLUMNS_NARROW or TASK_GRID_TEMPLATE_COLUMNS_WIDE */
const _TASK_GRID_TEMPLATE_COLUMNS = TASK_GRID_TEMPLATE_COLUMNS_NARROW;

/** Grid template areas for narrow containers (no Created By column) */
const TASK_GRID_TEMPLATE_AREAS_NARROW = `"indicator content ${TASK_GRID_COLUMNS.map(
  (c) => c.id
).join(' ')} timestamp"`;

/** Grid template areas for wide containers (includes Created By column) */
export const TASK_GRID_TEMPLATE_AREAS_WIDE = `"indicator content ${TASK_GRID_COLUMNS.map(
  (c) => c.id
).join(' ')} createdBy timestamp"`;

/** Wide template areas without the leading indicator (checkbox) column. */
export const TASK_GRID_TEMPLATE_AREAS_WIDE_NO_INDICATOR = `"content ${TASK_GRID_COLUMNS.map(
  (c) => c.id
).join(' ')} createdBy timestamp"`;

/** @deprecated Use TASK_GRID_TEMPLATE_AREAS_NARROW or TASK_GRID_TEMPLATE_AREAS_WIDE */
const _TASK_GRID_TEMPLATE_AREAS = TASK_GRID_TEMPLATE_AREAS_NARROW;

export type TaskDueFilter = 'all' | 'overdue' | 'dueSoon' | 'noDate';

/** Client-side due filter for the tasks list/grid. Defaults to all loaded rows. */
export const [taskDueFilter, setTaskDueFilter] =
  createSignal<TaskDueFilter>('all');

export function getTaskDueDate(entity: EntityData): Date | undefined {
  if (!isTaskEntity(entity)) return undefined;
  const due = entity.properties?.find(
    (property) => property.definition.id === SYSTEM_PROPERTY_IDS.DUE_DATE
  );
  if (!due?.value || due.value.type !== 'Date') return undefined;
  const raw = due.value.value;
  if (raw == null) return undefined;
  const date = new Date(raw as string | number);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** overdue = before today; due soon = today through 7 calendar days. */
export function matchesTaskDueFilter(
  entity: EntityData,
  filter: TaskDueFilter = taskDueFilter()
): boolean {
  if (filter === 'all') return true;
  const due = getTaskDueDate(entity);
  if (filter === 'noDate') return due === undefined;
  if (!due) return false;
  const days = differenceInCalendarDays(due, startOfDay(new Date()));
  if (filter === 'overdue') return days < 0;
  return days >= 0 && days <= 7;
}

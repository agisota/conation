import {
  compileToAst,
  defineQueryFilters,
  queryStateFrom,
} from '@app/features/next-soup/filters/filter-store';
import { soupItemMatchesQuery } from '@app/features/next-soup/filters/query-filters';
import { t } from '@app/lib/i18n';
import {
  isTaskEntity,
  unreadFilterFn,
  type EntityData,
  type TaskEntityWithProperties,
  type WithNotification,
} from '@entity';
import { isTaskClosed } from '@entity/utils/task-properties';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import { type SoupAstItemsQueryArgs, useSoupAstItemsQuery } from '@queries/soup/items';
import { cn } from '@ui';
import { isBefore, startOfDay } from 'date-fns';
import { createMemo, Show, Suspense } from 'solid-js';
import { match } from 'ts-pattern';
import type { WidgetOf } from '../schema';
import { SURFACE, TEXT } from '../tokens';

export type KpiProps = Omit<WidgetOf<'kpi'>, 'type'>;

function compileQuery(query: KpiProps['query']): SoupAstItemsQueryArgs['body'] {
  return compileToAst(queryStateFrom(defineQueryFilters(query)));
}

function dueDate(entity: TaskEntityWithProperties): Date | undefined {
  const due = entity.properties?.find(
    (property) => property.definition.id === SYSTEM_PROPERTY_IDS.DUE_DATE
  );
  if (!due?.value || due.value.type !== 'Date') return undefined;
  const raw = due.value.value;
  if (raw == null) return undefined;
  const date = new Date(raw as string | number);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isOverdue(entity: EntityData): boolean {
  if (!isTaskEntity(entity)) return false;
  const task = entity as TaskEntityWithProperties;
  if (isTaskClosed(task)) return false;
  const due = dueDate(task);
  return due !== undefined && isBefore(due, startOfDay(new Date()));
}

/**
 * A single numeric metric over a soup list query — match count, overdue tasks,
 * or unread items. Caps at the same 200-row soup page the list widget uses.
 */
export function Kpi(props: KpiProps) {
  return (
    <div
      class={cn(
        'flex min-w-0 flex-col gap-1 rounded-lg border px-3 py-3',
        SURFACE.borderMuted
      )}
    >
      <span
        class={cn(
          'text-xxs font-medium uppercase tracking-wide',
          TEXT.tertiary
        )}
      >
        {props.title ??
          match(props.metric)
            .with('overdue', () => t('soup.tasks.timeline.overdue'))
            .with('unread', () => t('soup.states.unread'))
            .with('count', () => t('dashboard.modules.kpi'))
            .exhaustive()}
      </span>
      <Suspense
        fallback={
          <span class={cn('text-2xl font-semibold', TEXT.primary)}>—</span>
        }
      >
        <Value query={props.query} metric={props.metric} />
      </Suspense>
    </div>
  );
}

function Value(props: { query: KpiProps['query']; metric: KpiProps['metric'] }) {
  const itemsQuery = useSoupAstItemsQuery(
    () => ({
      params: { limit: 200 },
      body: compileQuery(props.query),
    }),
    () => {
      const source = props.query;
      return {
        meta: { itemFilter: (item) => soupItemMatchesQuery(item, source) },
      };
    }
  );

  const value = createMemo(() => {
    const entities = itemsQuery.data?.entities ?? [];
    return match(props.metric)
      .with('count', () => entities.length)
      .with('overdue', () => entities.filter(isOverdue).length)
      .with('unread', () =>
        entities.filter((entity) =>
          unreadFilterFn(entity as WithNotification<EntityData>)
        ).length
      )
      .exhaustive();
  });

  return (
    <Show
      when={itemsQuery.data}
      fallback={
        <span class={cn('text-2xl font-semibold', TEXT.primary)}>—</span>
      }
    >
      <span class={cn('text-2xl font-semibold tabular-nums', TEXT.primary)}>
        {value()}
      </span>
    </Show>
  );
}

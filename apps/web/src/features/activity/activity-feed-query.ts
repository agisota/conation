import { tz } from '@date-fns/tz';
import { format } from 'date-fns';

/** Action kinds the feed can filter by. Unknown tags stay visible. */
export const ACTIVITY_FILTER_CATEGORIES = [
  'GraphqlActivityCreated',
  'GraphqlActivityEdited',
  'GraphqlActivityOpened',
  'GraphqlActivityDeleted',
  'GraphqlActivityMessaged',
  'GraphqlActivitySent',
  'GraphqlActivityPropertyChanged',
  'GraphqlActivityParticipantAdded',
  'GraphqlActivityParticipantRemoved',
  'GraphqlActivityCallStarted',
] as const;

export type ActivityFilterCategory =
  (typeof ACTIVITY_FILTER_CATEGORIES)[number];

export type ActivitySort = 'newest' | 'oldest';

export type ActivityFeedItem = {
  occurredAt: string;
  action: { __typename: string };
};

const UTC = tz('UTC');

/** Local `YYYY-MM-DD` for an event instant in the viewer's IANA zone. */
export function eventLocalDate(occurredAt: string, timeZone: string): string {
  const instant = new Date(occurredAt);
  if (Number.isNaN(instant.getTime())) return '';
  try {
    return format(instant, 'yyyy-MM-dd', { in: tz(timeZone) });
  } catch {
    return format(instant, 'yyyy-MM-dd', { in: UTC });
  }
}

/**
 * Keep events that match the selected heatmap day and category chips.
 * An empty category set means "all categories".
 */
export function filterActivityEvents<T extends ActivityFeedItem>(
  events: readonly T[],
  options: {
    selectedDate: string | null;
    timeZone: string;
    categories: ReadonlySet<string>;
  }
): T[] {
  return events.filter((event) => {
    if (
      options.selectedDate &&
      eventLocalDate(event.occurredAt, options.timeZone) !==
        options.selectedDate
    ) {
      return false;
    }
    if (
      options.categories.size > 0 &&
      !options.categories.has(event.action.__typename)
    ) {
      return false;
    }
    return true;
  });
}

/** Order the already-filtered feed. Newest is the product default. */
export function sortActivityEvents<T extends ActivityFeedItem>(
  events: readonly T[],
  sort: ActivitySort
): T[] {
  const copy = [...events];
  copy.sort((a, b) => {
    const cmp = a.occurredAt.localeCompare(b.occurredAt);
    if (cmp !== 0) return sort === 'newest' ? -cmp : cmp;
    return 0;
  });
  return copy;
}

export function toggleActivityCategory(
  current: ReadonlySet<string>,
  category: ActivityFilterCategory
): Set<string> {
  const next = new Set(current);
  if (next.has(category)) next.delete(category);
  else next.add(category);
  return next;
}

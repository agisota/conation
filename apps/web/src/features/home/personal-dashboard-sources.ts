import { buildTaskQuery } from '@app/features/tasks-view/queries/task-query';
import { isTaskEntity } from '@entity';
import { createCalendarOccurrenceQueryRange, useCalendarOccurrencesQuery } from '@queries/calendar/occurrences';
import { useSoupAstItemsQuery } from '@queries/soup/items';
import { throwOnErr } from '@core/util/result';
import { emailClient } from '@service-email/client';
import { useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';

export function useDashboardCalendars(ownerId: string) {
  return useQuery(() => ({
    queryKey: ['personal-dashboard', ownerId, 'calendars'],
    queryFn: async () => (await throwOnErr(() => emailClient.listCalendars())).calendars,
    retry: false,
    staleTime: 0,
  }));
}

export function useDashboardTasks(ownerId: string) {
  const query = useSoupAstItemsQuery(
    () => buildTaskQuery({
      tab: 'my-tasks',
      userId: ownerId,
      facets: {},
      groupBy: 'none',
      sort: [{ id: 'updated_at' }],
    }),
    () => ({ enabled: true })
  );
  return {
    loading: () => query.isLoading,
    error: () => query.error,
    tasks: () => query.isLoading || query.isPlaceholderData
      ? []
      : (query.data?.entities ?? []).filter(isTaskEntity).filter((task) => !task.subType.is_completed).slice(0, 5),
    retry: () => query.refetch(),
  };
}

export function useDashboardOccurrences(ownerId: string, connected: Accessor<boolean>) {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  const range = createCalendarOccurrenceQueryRange(start, end);
  return useCalendarOccurrencesQuery(
    () => ({ userId: ownerId, range }),
    () => ({ enabled: connected(), pollWhileSyncing: false })
  );
}

import { throwOnErr } from '@core/util/result';
import { storageServiceClient } from '@service-storage/client';
import { useQuery } from '@tanstack/solid-query';
import { parsePersonalDashboard, PERSONAL_DASHBOARD_ID, readPersonalDashboard, type DashboardLayout } from './personal-dashboard';

export function usePersonalDashboardQuery(ownerId: string) {
  return useQuery(() => ({
    queryKey: ['personal-dashboard', ownerId],
    queryFn: async () => {
      const response = await throwOnErr(() => storageServiceClient.views.getSavedViews());
      return readPersonalDashboard(response.views, ownerId);
    },
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always' as const,
  }));
}

/** POST is the only personal writer; the server compares owner and revision atomically. */
export async function savePersonalDashboard(ownerId: string, layout: DashboardLayout) {
  const saved = await throwOnErr(() => storageServiceClient.views.createSavedView({
    name: PERSONAL_DASHBOARD_ID,
    ownerId,
    expectedRevision: layout.revision - 1,
    config: layout,
  }));
  if (saved.userId !== ownerId) throw new Error('Сервер вернул доску другого аккаунта.');
  const confirmed = parsePersonalDashboard(saved.config);
  if (confirmed.revision !== layout.revision) throw new Error('Сервер вернул другую редакцию доски.');
  return confirmed;
}

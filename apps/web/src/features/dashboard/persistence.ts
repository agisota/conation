/**
 * Dashboard layout persistence.
 *
 * - Personal layout is a singleton `/saved_views` row (`kind: 'dashboard'`).
 *   Config shape is frontend-owned, same as CRM personal views.
 * - Team default lives on GET/PUT `/team/dashboard` (members read; team
 *   admin/owner writes), analogous to CRM `team_views`.
 * - Reload restores personal if present, otherwise the team default.
 */

import { SERVER_HOSTS } from '@core/constant/servers';
import { throwOnErr } from '@core/util/result';
import { useCurrentTeamQuery, useIsTeamAdmin } from '@queries/team/teams';
import { fetchWithAuth } from '@service-auth/fetch';
import { storageServiceClient } from '@service-storage/client';
import type { View } from '@service-storage/generated/schemas/view';
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import { createMemo } from 'solid-js';

const authHost = SERVER_HOSTS['auth-service'];

/** Well-known `/saved_views` name for the caller's personal dashboard. */
export const DASHBOARD_PERSONAL_VIEW_NAME = 'dashboard:personal';

const DASHBOARD_SAVED_VIEWS_QUERY_KEY = ['dashboard', 'saved-views'] as const;
const DASHBOARD_TEAM_LAYOUT_QUERY_KEY = ['dashboard', 'team-layout'] as const;

/**
 * Saved dashboard layout. `kind` is the discriminator against other
 * `/saved_views` configs; remaining fields are optional so old rows keep
 * working as the editor shape evolves.
 */
export type DashboardLayout = {
  kind: 'dashboard';
  /** Ordered modules; frontend-owned shape. */
  modules?: unknown[];
};

export type DashboardLayoutSource = 'personal' | 'team';

type TeamDashboardLayoutResponse = {
  layout: unknown | null;
};

export function isDashboardLayout(value: unknown): value is DashboardLayout {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  if (!('kind' in value)) return false;
  return value.kind === 'dashboard';
}

/** Returns a layout object suitable for restore, or `undefined` if none. */
export function parseDashboardLayout(
  value: unknown
): DashboardLayout | undefined {
  return isDashboardLayout(value) ? value : undefined;
}

function personalDashboardView(views: View[] | undefined): View | undefined {
  const matches = (views ?? []).filter((view) =>
    isDashboardLayout(view.config)
  );
  return (
    matches.find((view) => view.name === DASHBOARD_PERSONAL_VIEW_NAME) ??
    matches[0]
  );
}

async function fetchTeamDashboardLayout(): Promise<DashboardLayout | null> {
  const response = await throwOnErr(() =>
    fetchWithAuth<TeamDashboardLayoutResponse>(`${authHost}/team/dashboard`, {
      method: 'GET',
    })
  );
  return parseDashboardLayout(response.layout) ?? null;
}

async function putTeamDashboardLayout(
  layout: DashboardLayout | null
): Promise<DashboardLayout | null> {
  const response = await throwOnErr(() =>
    fetchWithAuth<TeamDashboardLayoutResponse>(`${authHost}/team/dashboard`, {
      method: 'PUT',
      body: JSON.stringify({ layout }),
    })
  );
  return parseDashboardLayout(response.layout) ?? null;
}

/**
 * Load and persist the dashboard layout. Personal `/saved_views` wins on
 * reload; otherwise the team default is used. Team-default writes are
 * admin-gated server-side.
 */
export function useDashboardPersistence() {
  const queryClient = useQueryClient();
  const teamQuery = useCurrentTeamQuery();
  const isTeamAdmin = useIsTeamAdmin();

  const personalQuery = useQuery(() => ({
    queryKey: DASHBOARD_SAVED_VIEWS_QUERY_KEY,
    queryFn: async () =>
      await throwOnErr(
        async () => await storageServiceClient.views.getSavedViews()
      ),
  }));

  const teamLayoutQuery = useQuery(() => ({
    queryKey: DASHBOARD_TEAM_LAYOUT_QUERY_KEY,
    queryFn: fetchTeamDashboardLayout,
    enabled: teamQuery.data != null,
  }));

  const personalView = createMemo(() =>
    personalDashboardView(personalQuery.data?.views)
  );

  const personal = createMemo((): DashboardLayout | undefined => {
    if (personalQuery.isPending) return undefined;
    return parseDashboardLayout(personalView()?.config);
  });

  const teamDefaultPending = () =>
    teamQuery.isPending ||
    (teamQuery.data != null && teamLayoutQuery.isPending);

  const teamDefault = createMemo((): DashboardLayout | undefined => {
    if (teamDefaultPending()) return undefined;
    if (teamQuery.data == null) return undefined;
    return teamLayoutQuery.data ?? undefined;
  });

  const layout = createMemo((): DashboardLayout | undefined => {
    if (personalQuery.isPending) return undefined;
    // teamDefault() stays undefined until its query settles, so a personal
    // miss does not resolve as empty before the team default is known.
    return personal() ?? teamDefault();
  });

  const source = createMemo((): DashboardLayoutSource | undefined => {
    if (personalQuery.isPending) return undefined;
    if (personal()) return 'personal';
    if (teamDefault()) return 'team';
    return undefined;
  });

  const isLoading = () =>
    personalQuery.isPending || (!personal() && teamDefaultPending());

  const savePersonalMutation = useMutation(() => ({
    mutationFn: async (next: DashboardLayout) => {
      const current = personalView();
      const config: DashboardLayout = { ...next, kind: 'dashboard' };
      if (current) {
        await throwOnErr(
          async () =>
            await storageServiceClient.views.patchView({
              saved_view_id: current.id,
              config,
            })
        );
        return;
      }
      await throwOnErr(
        async () =>
          await storageServiceClient.views.createSavedView({
            name: DASHBOARD_PERSONAL_VIEW_NAME,
            config,
          })
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: DASHBOARD_SAVED_VIEWS_QUERY_KEY,
      }),
    onError: (error: Error) => {
      console.error('Failed to save personal dashboard layout', error);
    },
  }));

  const clearPersonalMutation = useMutation(() => ({
    mutationFn: async () => {
      const current = personalView();
      if (!current) return;
      await throwOnErr(
        async () =>
          await storageServiceClient.views.deleteView({
            savedViewId: current.id,
          })
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: DASHBOARD_SAVED_VIEWS_QUERY_KEY,
      }),
    onError: (error: Error) => {
      console.error('Failed to clear personal dashboard layout', error);
    },
  }));

  const saveTeamDefaultMutation = useMutation(() => ({
    mutationFn: async (next: DashboardLayout) =>
      await putTeamDashboardLayout({ ...next, kind: 'dashboard' }),
    onSuccess: (saved) => {
      queryClient.setQueryData(DASHBOARD_TEAM_LAYOUT_QUERY_KEY, saved);
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: DASHBOARD_TEAM_LAYOUT_QUERY_KEY,
      }),
    onError: (error: Error) => {
      console.error('Failed to save team default dashboard layout', error);
    },
  }));

  const clearTeamDefaultMutation = useMutation(() => ({
    mutationFn: async () => await putTeamDashboardLayout(null),
    onSuccess: (saved) => {
      queryClient.setQueryData(DASHBOARD_TEAM_LAYOUT_QUERY_KEY, saved);
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: DASHBOARD_TEAM_LAYOUT_QUERY_KEY,
      }),
    onError: (error: Error) => {
      console.error('Failed to clear team default dashboard layout', error);
    },
  }));

  return {
    /** Layout restored on reload: personal, else team default. */
    layout,
    source,
    personal,
    teamDefault,
    isLoading,
    canEditTeamDefault: isTeamAdmin,
    savePersonal: savePersonalMutation.mutate,
    clearPersonal: clearPersonalMutation.mutate,
    saveTeamDefault: saveTeamDefaultMutation.mutate,
    clearTeamDefault: clearTeamDefaultMutation.mutate,
    isSavingPersonal: () => savePersonalMutation.isPending,
    isSavingTeamDefault: () => saveTeamDefaultMutation.isPending,
  };
}

import { throwOnErr } from '@core/util/result';
import { storageServiceClient } from '@service-storage/client';
import type { View } from '@service-storage/generated/schemas/view';
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import { type Accessor, createMemo } from 'solid-js';
import type { ActivitySort } from './activity-feed-query';
import {
  ACTIVITY_PREFS_VIEW_NAME,
  type ActivityViewScope,
  activityPrefsEqual,
  isActivityPrefsConfig,
  parseActivityPrefs,
  toActivityPrefsConfig,
} from './activity-prefs';

const ACTIVITY_PREFS_QUERY_KEY = ['activity', 'saved-prefs'] as const;

type StoredPrefs = { sort: ActivitySort; categories: string[] };

function prefsFromView(view: View | undefined): StoredPrefs {
  return parseActivityPrefs(view?.config);
}

/** Load and persist activity filter/sort for one surface (My or Space). */
export function useActivityViewPrefs(scope: Accessor<ActivityViewScope>) {
  const queryClient = useQueryClient();

  const viewsQuery = useQuery(() => ({
    queryKey: ACTIVITY_PREFS_QUERY_KEY,
    queryFn: async () =>
      await throwOnErr(
        async () => await storageServiceClient.views.getSavedViews()
      ),
  }));

  const storedView = createMemo((): View | undefined => {
    const wanted = scope();
    return (viewsQuery.data?.views ?? []).find((view) => {
      if (!isActivityPrefsConfig(view.config)) return false;
      return view.config.scope === wanted;
    });
  });

  const loaded = createMemo((): StoredPrefs | undefined => {
    if (viewsQuery.isLoading) return undefined;
    return prefsFromView(storedView());
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ACTIVITY_PREFS_QUERY_KEY });

  const persist = useMutation(() => ({
    mutationFn: async (vars: StoredPrefs) => {
      const wanted = scope();
      const current = storedView();
      if (activityPrefsEqual(prefsFromView(current), vars)) return;
      const config = toActivityPrefsConfig(wanted, vars);
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
            name: ACTIVITY_PREFS_VIEW_NAME[wanted],
            config,
          })
      );
    },
    onSuccess: () => invalidate(),
    onError: (error: Error) => {
      console.error('Failed to persist activity prefs', error);
    },
  }));

  return {
    loaded,
    isLoading: () => viewsQuery.isLoading,
    persist: persist.mutate,
  };
}

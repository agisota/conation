import { throwOnErr } from '@core/util/result';
import { storageServiceClient } from '@service-storage/client';
import type { View } from '@service-storage/generated/schemas/view';
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import { createMemo } from 'solid-js';
import {
  AGENT_MODE_VIEW_NAME,
  type AgentMode,
  isAgentModePrefsConfig,
  parseAgentMode,
  toAgentModePrefsConfig,
} from './agent-mode-prefs';

const AGENT_MODE_QUERY_KEY = ['agent', 'mode-prefs'] as const;

function viewMode(view: View | undefined): AgentMode {
  return parseAgentMode(view?.config);
}

/** Account default for YOLO / per-task / control-actions. */
export function useAgentModePrefs() {
  const queryClient = useQueryClient();

  const viewsQuery = useQuery(() => ({
    queryKey: AGENT_MODE_QUERY_KEY,
    queryFn: async () =>
      await throwOnErr(
        async () => await storageServiceClient.views.getSavedViews()
      ),
  }));

  const storedView = createMemo((): View | undefined =>
    (viewsQuery.data?.views ?? []).find((view) =>
      isAgentModePrefsConfig(view.config)
    )
  );

  const loaded = createMemo((): AgentMode | undefined => {
    if (viewsQuery.isLoading) return undefined;
    return viewMode(storedView());
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: AGENT_MODE_QUERY_KEY });

  const persist = useMutation(() => ({
    mutationFn: async (mode: AgentMode) => {
      const current = storedView();
      if (viewMode(current) === mode && current) return;
      const config = toAgentModePrefsConfig(mode);
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
            name: AGENT_MODE_VIEW_NAME,
            config,
          })
      );
    },
    onSuccess: () => invalidate(),
    onError: (error: Error) => {
      console.error('Failed to persist agent mode', error);
    },
  }));

  return {
    loaded,
    isLoading: () => viewsQuery.isLoading,
    persist: persist.mutate,
  };
}

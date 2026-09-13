import { setPreviewOnCreate } from '@queries/preview/preview';
import { refetchSoupEntity } from '@queries/soup/cache';
import { Button } from '@ui';
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import {
  dismissKeepBoth,
  listKeepBoth,
  restoreKeepBoth,
  soupIdsFromKeepBoth,
  type KeepBothRecord,
} from '../../lib/graphql-cache/keep-both';
import {
  isLocalFirstId,
  listLocalFirstBindings,
  resolveSoupId,
  type LocalFirstBinding,
} from '../../lib/core/util/offline-create';
import { SettingsCard, SettingsSection } from './primitives';

function loadConflicts(): KeepBothRecord[] {
  return listKeepBoth();
}

function loadBindings(): LocalFirstBinding[] {
  return listLocalFirstBindings();
}

function openSoupIds(soupIds: string[], title?: string): void {
  for (const soupId of soupIds) {
    const resolved = resolveSoupId(soupId);
    setPreviewOnCreate({
      itemId: resolved,
      itemType: 'document',
      name: title ?? resolved,
      fileType: 'md',
    });
    if (!isLocalFirstId(resolved)) {
      void refetchSoupEntity(resolved, 'document', {
        ownTouch: true,
        refreshGraphql: true,
      });
    }
  }
}

/** Restore keep-both snapshots and show local-first soup ids for queued creates. */
export function KeepBothRestore() {
  const [conflicts, setConflicts] = createSignal(loadConflicts());
  const [bindings, setBindings] = createSignal(loadBindings());

  const refresh = () => {
    setConflicts(loadConflicts());
    setBindings(loadBindings());
  };

  onMount(() => {
    window.addEventListener('online', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
  });
  onCleanup(() => {
    window.removeEventListener('online', refresh);
    window.removeEventListener('storage', refresh);
    window.removeEventListener('focus', refresh);
  });

  const restore = (transactionId: string, side: 'local' | 'remote') => {
    const restored = restoreKeepBoth(transactionId, side);
    if (!restored) return;
    openSoupIds(restored.soupIds, restored.title);
    dismissKeepBoth(transactionId);
    refresh();
  };

  return (
    <Show when={conflicts().length > 0 || bindings().length > 0}>
      <SettingsSection
        title="Offline versions"
        description="Queued creates keep a local soup id until the server accepts them. Unmergeable edits keep both copies."
      >
        <SettingsCard>
          <For each={conflicts()}>
            {(row) => {
              const ids = () => soupIdsFromKeepBoth(row).join(', ') || 'unknown';
              return (
                <div class="flex flex-col gap-2 px-6 py-3.5 min-h-[60px] border-b border-hairline last:border-b-0">
                  <div class="text-sm text-ink">
                    Conflict {row.operationName ?? row.transactionId}
                  </div>
                  <div class="text-xs text-ink-muted font-mono break-all">
                    Soup IDs: {ids()}
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      depth={3}
                      onClick={() => restore(row.transactionId, 'local')}
                    >
                      Restore local
                    </Button>
                    <Button
                      variant="outline"
                      depth={3}
                      onClick={() => restore(row.transactionId, 'remote')}
                    >
                      Restore remote
                    </Button>
                    <Button
                      variant="outline"
                      depth={2}
                      onClick={() => {
                        dismissKeepBoth(row.transactionId);
                        refresh();
                      }}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              );
            }}
          </For>
          <For each={bindings()}>
            {(row) => (
              <div class="flex items-center justify-between gap-4 px-6 py-3.5 min-h-[60px]">
                <div class="min-w-0">
                  <div class="text-sm text-ink">
                    {row.title || row.kind} ({row.kind})
                  </div>
                  <div class="text-xs text-ink-muted font-mono break-all">
                    {row.localId}
                    {row.serverId ? ` → ${row.serverId}` : ' (queued)'}
                  </div>
                </div>
                <Button
                  variant="outline"
                  depth={3}
                  onClick={() =>
                    openSoupIds(
                      [row.serverId ?? row.localId],
                      row.title
                    )
                  }
                >
                  Open
                </Button>
              </div>
            )}
          </For>
        </SettingsCard>
      </SettingsSection>
    </Show>
  );
}

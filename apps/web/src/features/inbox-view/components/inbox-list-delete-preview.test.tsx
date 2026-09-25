import { ViewShell } from '@app/components/view-shell';
import { createSoupEntityRow } from '@app/features/soup/collection';
import {
  SplitRouter,
  type SplitRouterEntry,
  type SplitRouterLayout,
  type SplitRouterSettledChange,
} from '@app/lib/split-router';
import { createMemorySplitRouterLocation } from '@app/lib/split-router/integrations/memory';
import type { PreviewPanelSelection } from '@components/app/previewTarget';
import {
  SplitPanelContext,
  type SplitPanelContextType,
} from '@components/app/split-layout/context';
import { appSplitRoutes } from '@components/app/split-layout/split-router/app-routes';
import type { EntityData, WithNotification } from '@entity';
import { MutationUndoProvider } from '@queries/undo';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { For, type JSX, onMount } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InboxViewProvider, useInboxView } from '../inbox-view-context';
import type { InboxDataSourceItem } from '../queries/use-inbox-query';
import { InboxList } from './InboxList';

// jsdom has no element measurements; keep the real desktop Aside mounted.
vi.mock('@solid-primitives/resize-observer', () => ({
  createResizeObserver: () => {},
  createElementSize: () => ({ width: 1200, height: 800 }),
}));
// The real menu remains mounted; only jsdom's zero-sized virtual viewport is bypassed.
vi.mock('virtua/solid', () => ({
  Virtualizer: (props: {
    data: InboxDataSourceItem[];
    children: (row: InboxDataSourceItem, index: () => number) => JSX.Element;
    ref?: (handle: unknown) => void;
  }) => {
    onMount(() =>
      props.ref?.({
        scrollOffset: 0,
        scrollTo: () => {},
        scrollToIndex: () => {},
      })
    );
    return (
      <For each={props.data}>{(row, index) => props.children(row, index)}</For>
    );
  },
}));
vi.mock('@core/hotkey/hotkeys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@core/hotkey/hotkeys')>()),
  registerHotkey: () => ({ withGroup: () => {} }),
}));
vi.mock('@service-storage/websocket', () => ({
  storageWS: { reconnectIfDisconnected: vi.fn() },
  createWebSocketJob: vi.fn(),
}));
vi.mock('@service-connection/websocket', () => ({
  ws: { addEventListener: vi.fn(), send: vi.fn() },
  state: () => 'closed',
  createConnectionBlockWebsocketEffect: vi.fn(),
  createConnectionWebsocketEffect: vi.fn(),
}));
vi.mock('@components/app/createPreviewSelectionGuard', () => ({
  createPreviewSelectionGuard: () =>
    Object.assign(() => true, { canSelect: () => true }),
}));
const boundary = vi.hoisted(() => ({
  rows: [] as InboxDataSourceItem[],
  modal: undefined as
    | {
        view: string;
        entities: EntityData[];
        onFinish?: () => void;
        onCancel?: () => void;
        onError?: (error: unknown) => void;
      }
    | undefined,
}));

vi.mock('../queries/use-inbox-query', () => ({
  useInboxDataSource: () => ({
    items: () => boundary.rows,
    isLoading: () => false,
    isFetching: () => false,
    isLoadingMore: () => false,
    error: () => undefined,
    warning: () => undefined,
    hasMore: () => false,
    loadMore: async () => {},
    refresh: async () => {},
  }),
}));
vi.mock('@app/features/entity/bulk-edit/BulkEditEntityModal', () => ({
  openBulkEditModal: (props: typeof boundary.modal) => {
    boundary.modal = props ?? undefined;
  },
}));
vi.mock('@core/context/user', () => ({ useUserId: () => () => 'alice' }));
vi.mock('@core/context/channels', () => ({
  useChannelsContext: () => ({ channelsById: () => new Map() }),
}));
vi.mock('@components/app/GlobalAppState', () => ({
  useGlobalNotificationSource: () => ({ mutedEntities: () => [] }),
}));
vi.mock('@app/lib/analytics/analytics-context', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}));
vi.mock('@queries/crm/companies', () => ({
  useSetCompanyHiddenMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@app/lib/debugSettings', () => ({
  DEBUG_SETTING_KEYS: { FORCE_EMPTY_STATES: 'force-empty-states' },
  useDebugSetting: () => () => false,
}));
vi.mock('@queries/properties/definitions', () => ({
  useListPropertiesQuery: () => ({
    isLoading: false,
    isError: false,
    data: [],
  }),
}));
vi.mock('@core/mobile/isTouchDevice', () => ({ isTouchDevice: () => false }));
vi.mock('@core/mobile/isMobile', () => ({ isMobile: () => false }));
vi.mock('@entity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entity')>();
  return {
    ...actual,
    createBulkDeleteDssItemsMutation: () => ({ mutateAsync: vi.fn() }),
  };
});

function HomeInboxList() {
  const inbox = useInboxView();
  return (
    <InboxList
      previewEntity={inbox.previewEntity()}
      onPreviewEntityChange={(entity: PreviewPanelSelection | undefined) =>
        entity ? inbox.openPreview(entity) : inbox.closePreview()
      }
    />
  );
}

function createLayout(): SplitRouterLayout<string> {
  let current: (SplitRouterEntry & { splitId: string }) | undefined;
  const listeners = new Set<(change: SplitRouterSettledChange) => void>();
  const notify = () => {
    for (const listener of listeners) listener({ history: 'push' });
  };
  return {
    snapshot: () => ({ entries: current ? [current] : [] }),
    updateCurrentEntry(_splitId, update) {
      if (!current) return;
      current = { splitId: current.splitId, ...update(current) };
      notify();
    },
    open: () => {},
    reconcile(entries) {
      const next = entries[0];
      current = next ? { splitId: 'split', ...next } : undefined;
      notify();
    },
    activate: () => {},
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function document(id: string, fileType: 'md' | 'spreadsheet') {
  return {
    type: 'document',
    id,
    name: id,
    fileType,
    ownerId: 'alice',
    sortTs: '2026-09-25T12:00:00.000Z',
    notifiedAt: '2026-09-25T12:00:00.000Z',
    notifications: () => [],
  } as unknown as WithNotification<EntityData>;
}

function mountHome(fileType: 'md' | 'spreadsheet') {
  const target = document(`target-${fileType}`, fileType);
  const survivor = document(`survivor-${fileType}`, fileType);
  boundary.rows = [target, survivor].map((entity) =>
    createSoupEntityRow(entity)
  ) as InboxDataSourceItem[];

  const handle = {
    content: () => ({ type: 'component', id: 'inbox' }),
    currentEntryState: () => ({}),
    registerEntryStateCaptor: () => () => {},
  };
  const panel = {
    handle,
    splitHotkeyScope: 'test-home',
    isPanelActive: () => true,
    panelRef: () => null,
    panelSize: undefined,
    contentOffsetTop: () => 0,
    setContentOffsetTop: () => {},
    bottomPanel: () => undefined,
    registerBottomPanel: () => () => {},
    layoutRefs: {},
    titleFileMenuRef: () => undefined,
    setTitleFileMenuRef: () => {},
    titleFileMenuTrigger: () => undefined,
    setTitleFileMenuTrigger: () => {},
    titleFileMenuActions: () => undefined,
    setTitleFileMenuActions: () => {},
    replaceOwnedSlot: (_name: string, factory: () => unknown) => factory(),
  } as unknown as SplitPanelContextType;
  const location = createMemorySplitRouterLocation(
    `/inbox/${fileType}/${target.id}`
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const view = render(() => (
    <QueryClientProvider client={queryClient}>
      <MutationUndoProvider>
        <SplitRouter.Root
          layout={createLayout()}
          routes={appSplitRoutes}
          location={location}
        >
          <SplitRouter.Scope splitId="split">
            <SplitPanelContext.Provider value={panel}>
              <InboxViewProvider initialState={{ groupBy: 'none' }}>
                <ViewShell.Root asidePreferenceKey="inbox">
                  <ViewShell.Aside>
                    <HomeInboxList />
                  </ViewShell.Aside>
                  <ViewShell.Main />
                </ViewShell.Root>
              </InboxViewProvider>
            </SplitPanelContext.Provider>
          </SplitRouter.Scope>
        </SplitRouter.Root>
      </MutationUndoProvider>
    </QueryClientProvider>
  ));

  return { ...view, location, target, survivor };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('scrollTo', vi.fn());
  localStorage.clear();
  boundary.modal = undefined;
  boundary.rows = [];
});

describe.each(['md', 'spreadsheet'] as const)(
  'Home %s preview deletion',
  (fileType) => {
    const openDeleteConfirmation = async (fileType: 'md' | 'spreadsheet') => {
      const view = mountHome(fileType);
      const row = await screen.findByRole('row', {
        name: new RegExp(`target-${fileType}`),
      });
      fireEvent.contextMenu(row, { clientX: 40, clientY: 40 });
      const deleteItem = await screen.findByRole('menuitem', {
        name: /Delete/,
      });
      expect(deleteItem.getAttribute('data-disabled')).toBeNull();
      deleteItem.focus();
      fireEvent.keyDown(deleteItem, { key: 'Enter' });
      await waitFor(() => expect(boundary.modal?.view).toBe('delete'));
      expect(boundary.modal?.entities.map((entity) => entity.id)).toEqual([
        `target-${fileType}`,
      ]);
      return view;
    };

    it('keeps the active preview route when deletion is cancelled', async () => {
      const view = await openDeleteConfirmation(fileType);
      expect(view.location.read().pathname).toBe(
        `/inbox/${fileType}/target-${fileType}`
      );

      expect(boundary.modal?.onCancel).toBeTypeOf('function');
      boundary.modal?.onCancel?.();

      await waitFor(() =>
        expect(view.location.read().pathname).toBe(
          `/inbox/${fileType}/target-${fileType}`
        )
      );
    });

    it('advances the preview route to the next Home item after confirmation', async () => {
      const view = await openDeleteConfirmation(fileType);
      boundary.modal?.onFinish?.();

      await waitFor(() =>
        expect(view.location.read().pathname).toBe(
          `/inbox/${fileType}/survivor-${fileType}`
        )
      );
    });
  }
);

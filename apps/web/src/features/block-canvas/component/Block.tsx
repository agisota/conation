import { useBlockEntityCommands } from '@app/features/next-soup/actions';
import { t } from '@app/lib/i18n';
import { createNumericParser } from '@block-canvas/util/parse';
import { FileSidePanelSections, SidePanel } from '@components/app/side-panel';
import {
  useBlockId,
  useBlockNestedContext,
  useIsNestedBlock,
} from '@core/block';
import { DocumentBlockContainer } from '@core/component/DocumentBlockContainer';
import { toast } from '@core/component/Toast/Toast';
import { createMethodRegistration } from '@core/orchestrator';
import { blockFileSignal, blockHandleSignal } from '@core/signal/load';
import { getPermissionToken } from '@core/signal/token';
import type { IDocumentStorageServiceFile } from '@filesystem/file';
import { storageServiceClient } from '@service-storage/client';
import { syncServiceClient } from '@service-sync/client';
import { createSyncServiceSource } from '@service-sync/source';
import { createCallback } from '@solid-primitives/rootless';
import { debounce } from '@solid-primitives/scheduled';
import { useSearchParams } from '@solidjs/router';
import {
  createEffect,
  createMemo,
  createRenderEffect,
  createResource,
  createSignal,
  on,
  onCleanup,
  Show,
} from 'solid-js';
import { blockDataSignal } from '../signal/canvasBlockData';
import {
  pendingUpdates,
  useLoadCanvasData,
  useSaveCanvasDataImmediate,
} from '../store/canvasData';
import { peekCanvasLoro, type CanvasLoroJson } from '../store/canvas-loro';
import {
  connectCanvasLiveSync,
  disconnectCanvasLiveSync,
  seedMissingCanvasSnapshot,
  type CanvasLiveSource,
} from '../store/canvas-sync';
import { peekOfflineCanvas } from '../store/offline-canvas';
import type { Canvas } from '../model/CanvasModel';
import { isAnimating, renderStateStore } from '../store/RenderState';
import { CanvasController } from './CanvasController';
import { CanvasPresenceCursors } from './CanvasPresence';
import { CanvasRenderer } from './CanvasRenderer';
import { Loading } from './Loading';
import { ModalsProvider } from './ModalsProvider';
import { ToolBar } from './ToolBar';
import { TopBar } from './TopBar';

const LoadingView = () => (
  <div class="size-full flex items-center justify-center">
    <Loading />
  </div>
);

const parseParams = createNumericParser<{
  x?: number;
  y?: number;
  scale?: number;
}>({
  x: ['x', 'canvas_x'],
  y: ['y', 'canvas_y'],
  scale: ['s', 'scale', 'canvas_scale'],
});

const numberOrUndefined = (
  n: string | undefined | null
): number | undefined => {
  const num = Number(n);
  return n == null || Number.isNaN(num) ? undefined : num;
};

type BlockDataState = 'loading' | 'error' | 'blockdata' | 'initialized';

export type BlockCanvasProps = {
  view?: {
    x: number;
    y: number;
    scale: number;
  };
};

export default function BlockCanvas(props: BlockCanvasProps) {
  useBlockEntityCommands();
  const documentId = useBlockId();
  const isNestedBlock = useIsNestedBlock();
  const nestedContext = useBlockNestedContext<'canvas'>();
  const loadCanvasData = useLoadCanvasData();
  const saveCanvasDataImmediate = useSaveCanvasDataImmediate();
  const [pending] = pendingUpdates;
  const [, setRenderState] = renderStateStore;
  const [dataState, setDataState] = createSignal<BlockDataState>('loading');
  const [visible, setVisible] = createSignal(false);
  const [offline, setOffline] = createSignal(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [pendingOffline, setPendingOffline] = createSignal(
    !!peekOfflineCanvas(documentId)
  );

  createEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    onCleanup(() => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    });
  });

  createEffect(() => {
    const id = documentId;
    onCleanup(() => {
      disconnectCanvasLiveSync(id);
    });
  });

  // Flush pending saves on cleanup to prevent data loss when navigating away
  onCleanup(() => {
    if (pending()) {
      saveCanvasDataImmediate();
    }
  });

  // Also flush on page unload (refresh, close tab)
  createEffect(() => {
    const handleBeforeUnload = () => {
      if (pending()) {
        saveCanvasDataImmediate();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    onCleanup(() => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    });
  });

  createEffect(() => {
    const context = nestedContext?.parentContext;
    if (!context) return;
    const onLocationChange = context.canvas?.onLocationChange;
    if (!onLocationChange) return;
    const debouncedFn = debounce(onLocationChange, 100);
    if (!visible()) return;

    let initialized = false;
    createEffect(() => {
      const store = renderStateStore.get;
      let { x, y, scale } = store;
      const state = getCanvasState({ x, y, scale });
      // prevent the location from being set on the initial render if the view is the same as the initial view
      if (!initialized) {
        initialized = true;
        const initView = props.view;
        if (
          initView &&
          initView.x === state.x &&
          initView.y === state.y &&
          initView.scale === state.scale
        ) {
          return;
        }
      }
      debouncedFn(state);
    });
  });

  const blockDataLocationSource = createMemo(() => {
    if (props.view) return { sourceType: 'view' as const, data: props.view };

    if (isNestedBlock) return undefined;
    return { sourceType: 'blockData' as const, data: blockDataSignal() };
  });
  const [lastViewLocation, { refetch }] = createResource(
    blockDataLocationSource,
    async (source) => {
      if (source.sourceType === 'view') {
        return source.data;
      }

      const res = await storageServiceClient.getDocumentMetadata({
        documentId,
        init: {
          signal: AbortSignal.timeout(3000),
        },
      });

      if (res.isErr()) return null;
      const { viewLocation } = res.value;

      if (!viewLocation) return null;
      const initialParams = new URLSearchParams(viewLocation.replace('#', ''));
      const x = numberOrUndefined(initialParams.get('x'));
      const y = numberOrUndefined(initialParams.get('y'));
      const scale = numberOrUndefined(initialParams.get('s'));
      return { x, y, scale };
    }
  );

  createEffect(() => {
    const file = blockFileSignal();
    refetch();
    setDataState('blockdata');
    if (!file) {
      setDataState('error');
      return;
    }
    parseCanvasFile(file);
  });

  const [urlSearchParams] = useSearchParams();
  const [pendingLocationParams, setPendingLocationParams] =
    createSignal<Record<string, any>>();
  const blockHandle = blockHandleSignal.get;

  createMethodRegistration(blockHandle, {
    goToLocationFromParams: (params: Record<string, any>) => {
      setPendingLocationParams(params);
    },
  });

  // null = no location, undefined = pending location, object = some location
  const computedLocation = createMemo(() => {
    if (props.view) return props.view;
    if (isNestedBlock) return null;

    const pendingLocation = parseParams(pendingLocationParams() || {});
    if (pendingLocation) return pendingLocation;

    const urlLocation = parseParams({ ...urlSearchParams });
    if (urlLocation) return urlLocation;

    const serverLocation = lastViewLocation();
    if (lastViewLocation.loading) {
      return undefined;
    }
    if (serverLocation) return serverLocation;

    return null;
  });

  const [centerContentsPending, setCenterContentsPending] = createSignal(false);

  createEffect(
    on([dataState, computedLocation], () => {
      if (dataState() === 'initialized') {
        const location = computedLocation();
        if (location) {
          setCanvasState(location);
          setTimeout(() => {
            setVisible(true);
          }, 10);
        } else if (location === null) {
          setCenterContentsPending(true);
          setVisible(true);
        } else {
        }
      }
    })
  );

  createRenderEffect((prev) => {
    if (visible() || !centerContentsPending()) return;
    const animating = isAnimating();
    if (prev && !animating) {
      setTimeout(() => {
        setVisible(true);
      }, 10);
      setCenterContentsPending(false);
    }
    return animating;
  });

  const getCanvasState = (state: {
    x?: number;
    y?: number;
    scale?: number;
  }) => {
    const x = state.x && !isNaN(state.x) ? Math.round(state.x) : 0;
    const y = state.y && !isNaN(state.y) ? Math.round(state.y) : 0;
    const scale =
      state.scale != null && !isNaN(state.scale)
        ? Math.round(state.scale * 100)
        : 100;

    return { x, y, scale };
  };

  const setCanvasState = createCallback(
    (location: { x?: number; y?: number; scale?: number }) => {
      if (location.scale !== undefined && !isNaN(location.scale)) {
        setRenderState('scale', location.scale / 100);
      }
      if (location.x !== undefined && !isNaN(location.x)) {
        setRenderState('x', location.x);
      }
      if (location.y !== undefined && !isNaN(location.y)) {
        setRenderState('y', location.y);
      }
    }
  );

  async function parseCanvasFile(file: IDocumentStorageServiceFile) {
    try {
      const text = await file.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      const pending = peekOfflineCanvas(documentId);
      const loro = peekCanvasLoro(documentId);
      const board = loro ?? pending ?? json;
      if (!board) {
        throw new Error('canvas json missing');
      }
      await loadCanvasData(board as Canvas);
      try {
        const token = await getPermissionToken('canvas', documentId);
        if (token) {
          await seedMissingCanvasSnapshot({
            documentId,
            board: board as CanvasLoroJson,
            api: {
              exists: async (id) => {
                const res = await syncServiceClient.exists({ documentId: id });
                return res.isOk() && res.value.exists;
              },
              initialize: async (id, snapshot) => {
                const res = await syncServiceClient.initializeFromSnapshot({
                  documentId: id,
                  snapshot,
                });
                return res.isOk();
              },
            },
          });
          const { source, doInitialSync } = createSyncServiceSource(
            documentId,
            token
          );
          await connectCanvasLiveSync({
            documentId,
            source: source as CanvasLiveSource,
            doInitialSync: async () => {
              const result = await doInitialSync();
              if (result.isErr()) return null;
              return result.value;
            },
            onRemoteBoard: (remote) => {
              void loadCanvasData(remote as Canvas);
            },
          });
        }
      } catch (syncError) {
        console.error(syncError);
      }
      setDataState('initialized');
      setPendingOffline(!!pending);
      if (pending) {
        await saveCanvasDataImmediate();
        setPendingOffline(!!peekOfflineCanvas(documentId));
      }
    } catch (e) {
      setDataState('error');
      toast.failure(t('canvas.error.parseFailed'));
      console.error(e);
    }
    return file;
  }

  const CanvasBody = () => (
    <Show when={dataState() === 'initialized'} fallback={<LoadingView />}>
      <CanvasController>
        <Show when={visible()}>
          <CanvasRenderer />
          <CanvasPresenceCursors />
          <ToolBar />
        </Show>
      </CanvasController>
    </Show>
  );

  return (
    <DocumentBlockContainer>
      <div
        class="size-full select-none flex flex-col"
        // TODO: we need a more robust solution for preventing parent blocks from stealing clicks
        // This is a temporary fix for canvas in markdown but it doesn't necessarily generalize well
        on:click={(e) => {
          if (isNestedBlock) {
            e.stopPropagation();
          }
        }}
      >
        <ModalsProvider>
          <Show when={!isNestedBlock} fallback={<CanvasBody />}>
            <SidePanel.Layout defaultOpen={false}>
              <FileSidePanelSections />
              <div class="flex size-full min-w-0 flex-col overflow-hidden">
                <TopBar />
                <Show when={offline() || pendingOffline()}>
                  <div
                    role="status"
                    class="flex items-center justify-between gap-3 border-b border-alert/20 bg-alert-bg px-3 py-2 text-sm text-alert-ink"
                  >
                    <span>
                      {offline()
                        ? t('canvas.collaboration.offlineDescription')
                        : t('canvas.collaboration.pendingDescription')}
                    </span>
                    <button
                      type="button"
                      class="shrink-0 underline"
                      onClick={() => {
                        void saveCanvasDataImmediate().then(() => {
                          setPendingOffline(!!peekOfflineCanvas(documentId));
                        });
                      }}
                    >
                      {t('canvas.collaboration.retry')}
                    </button>
                  </div>
                </Show>
                <CanvasBody />
              </div>
            </SidePanel.Layout>
          </Show>
        </ModalsProvider>
      </div>
    </DocumentBlockContainer>
  );
}

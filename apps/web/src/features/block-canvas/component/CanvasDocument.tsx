import { t } from '@app/lib/i18n';
import type { PortalScope } from '@core/component/ScopedPortal';
import { toast } from '@core/component/Toast/Toast';
import { getPermissionToken } from '@core/signal/token';
import { syncServiceClient } from '@service-sync/client';
import { createSyncServiceSource } from '@service-sync/source';
import { debounce } from '@solid-primitives/scheduled';
import {
  createEffect,
  createMemo,
  createRenderEffect,
  createResource,
  createSignal,
  type JSX,
  on,
  onCleanup,
  Show,
} from 'solid-js';
import {
  CanvasDocumentProvider,
  type CanvasView,
  useCanvasDocument,
} from '../context/canvas-document-context';
import type { Canvas } from '../model/CanvasModel';
import { fetchCanvasViewLocation } from '../queries/canvas-document';
import {
  peekCanvasLoro,
  seedCanvasLoroPrior,
  type CanvasLoroJson,
} from '../store/canvas-loro';
import {
  connectCanvasLiveSync,
  disconnectCanvasLiveSync,
  seedMissingCanvasSnapshot,
  type CanvasLiveSource,
} from '../store/canvas-sync';
import {
  useExportCanvasData,
  useLoadCanvasData,
  useSaveCanvasDataImmediate,
} from '../store/canvasData';
import { peekOfflineCanvas } from '../store/offline-canvas';
import { createNumericParser } from '../util/parse';
import { CanvasController } from './CanvasController';
import { CanvasPresenceCursors } from './CanvasPresence';
import { CanvasRenderer } from './CanvasRenderer';
import { Loading } from './Loading';
import { ToolBar } from './ToolBar';

const parseParams = createNumericParser<{
  x?: number;
  y?: number;
  scale?: number;
}>({
  x: ['x', 'canvas_x'],
  y: ['y', 'canvas_y'],
  scale: ['s', 'scale', 'canvas_scale'],
});

type CanvasLoadError = 'canvas.error.parseFailed' | 'canvas.error.staleLive';
type CanvasDataState = 'loading' | 'error' | 'initialized';

export type CanvasDocumentMethods = {
  exportCanvas: () => Promise<Canvas>;
  goToLocationFromParams: (params: Record<string, unknown>) => void;
};

export type CanvasDocumentProps = {
  documentId: string;
  file?: Blob;
  canEdit: boolean;
  hotkeyScope: string;
  isNested?: boolean;
  portalScope?: PortalScope;
  view?: CanvasView;
  locationParams?: Record<string, string | string[] | undefined>;
  onLocationChange?: (location: CanvasView) => void;
  registerMethods?: (methods: Partial<CanvasDocumentMethods>) => void;
  children?: (content: JSX.Element) => JSX.Element;
};

export function CanvasDocument(props: CanvasDocumentProps) {
  return (
    <Show when={props.documentId} keyed>
      {(documentId) => (
        <CanvasDocumentProvider
          documentId={documentId}
          canEdit={props.canEdit}
          isNested={props.isNested}
          hotkeyScope={props.hotkeyScope}
          portalScope={props.portalScope}
          onLocationChange={props.onLocationChange}
        >
          <CanvasDocumentState {...props} />
        </CanvasDocumentProvider>
      )}
    </Show>
  );
}

function CanvasDocumentState(props: CanvasDocumentProps) {
  const canvas = useCanvasDocument();
  const { isNested, onLocationChange } = canvas;
  const loadCanvasData = useLoadCanvasData();
  const saveCanvasDataImmediate = useSaveCanvasDataImmediate();
  const exportCanvasData = useExportCanvasData();
  const [pending] = canvas.state.signals.pendingUpdates;
  const [renderState, setRenderState] = canvas.state.stores.render;
  const [animation] = canvas.state.stores.animation;
  const [dataState, setDataState] = createSignal<CanvasDataState>('loading');
  const [loadError, setLoadError] = createSignal<CanvasLoadError | null>(null);
  const [visible, setVisible] = createSignal(false);
  const [pendingLocationParams, setPendingLocationParams] =
    createSignal<Record<string, unknown>>();

  props.registerMethods?.({
    goToLocationFromParams: setPendingLocationParams,
  });

  createEffect(() => {
    if (dataState() !== 'initialized') return;
    props.registerMethods?.({
      exportCanvas: async () => exportCanvasData(),
    });
  });

  onCleanup(() => {
    if (pending()) void saveCanvasDataImmediate();
  });

  createEffect(() => {
    const handleBeforeUnload = () => {
      if (pending()) void saveCanvasDataImmediate();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    onCleanup(() => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    });
  });

  createEffect(() => {
    const documentId = props.documentId;
    onCleanup(() => {
      disconnectCanvasLiveSync(documentId);
    });
  });

  createEffect(() => {
    const notifyLocationChange = onLocationChange();
    if (!notifyLocationChange || !visible()) return;

    const notify = debounce(notifyLocationChange, 100);
    let initialized = false;
    createEffect(() => {
      const { x, y, scale } = renderState;
      const state = getCanvasState({ x, y, scale });
      if (!initialized) {
        initialized = true;
        const initialView = props.view;
        if (
          initialView &&
          initialView.x === state.x &&
          initialView.y === state.y &&
          initialView.scale === state.scale
        ) {
          return;
        }
      }
      notify(state);
    });
  });

  const locationSource = createMemo(() => {
    if (props.view) return { type: 'view' as const, view: props.view };
    if (isNested()) return;
    return {
      type: 'document' as const,
      documentId: props.documentId,
      file: props.file,
    };
  });
  const [lastViewLocation] = createResource(locationSource, async (source) => {
    if (source.type === 'view') return source.view;
    return fetchCanvasViewLocation(source.documentId);
  });

  createEffect(() => {
    const file = props.file;
    const documentId = props.documentId;
    setDataState('loading');
    setVisible(false);
    setLoadError(null);
    if (!file) {
      setLoadError('canvas.error.parseFailed');
      setDataState('error');
      toast.failure(t('canvas.error.parseFailed'));
      return;
    }

    let cancelled = false;
    const loadFile = async () => {
      try {
        const text = await file.text();
        if (cancelled) return;
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        const pendingOffline = peekOfflineCanvas(documentId);
        const loro = peekCanvasLoro(documentId);
        const board = loro ?? pendingOffline ?? json;
        if (!board) {
          throw new Error('canvas json missing');
        }
        seedCanvasLoroPrior(documentId, board as CanvasLoroJson);
        const loaded = await loadCanvasData(board as Canvas, () => !cancelled);
        if (!loaded || cancelled) return;

        let token: string | undefined;
        try {
          token = await getPermissionToken('canvas', documentId);
        } catch (tokenError) {
          console.error(tokenError);
        }
        if (token) {
          let liveSeed: 'exists' | 'initialized' | 'skipped' | undefined;
          let remoteSnapshotLen = 0;
          try {
            liveSeed = await seedMissingCanvasSnapshot({
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
            if (cancelled) return;
            const { source, doInitialSync } = createSyncServiceSource(
              documentId,
              token
            );
            const connected = await connectCanvasLiveSync({
              documentId,
              source: source as CanvasLiveSource,
              doInitialSync: async () => {
                const result = await doInitialSync();
                if (result.isErr()) return null;
                remoteSnapshotLen = result.value.snapshot.length;
                return result.value;
              },
              onRemoteBoard: (remote) => {
                seedCanvasLoroPrior(documentId, remote);
                void loadCanvasData(remote as Canvas);
              },
            });
            if (cancelled) return;
            // Empty/missing snapshot is a new board: keep parsed DSS JSON.
            // staleLive only if a non-empty remote session failed to apply.
            if (
              !connected &&
              (remoteSnapshotLen > 0 || liveSeed === 'exists')
            ) {
              setLoadError('canvas.error.staleLive');
              setDataState('error');
              toast.failure(t('canvas.error.staleLive'));
              return;
            }
          } catch (syncError) {
            console.error(syncError);
            if (remoteSnapshotLen > 0 || liveSeed === 'exists') {
              if (cancelled) return;
              setLoadError('canvas.error.staleLive');
              setDataState('error');
              toast.failure(t('canvas.error.staleLive'));
              return;
            }
          }
        }
        if (cancelled) return;
        setDataState('initialized');
        if (pendingOffline) {
          await saveCanvasDataImmediate();
        }
      } catch (error) {
        if (cancelled) return;
        setLoadError('canvas.error.parseFailed');
        setDataState('error');
        toast.failure(t('canvas.error.parseFailed'));
        console.error(error);
      }
    };
    void loadFile();
    onCleanup(() => {
      cancelled = true;
    });
  });

  const computedLocation = createMemo(() => {
    if (props.view) return props.view;
    if (isNested()) return null;

    const pendingLocation = parseParams(pendingLocationParams() ?? {});
    if (pendingLocation) return pendingLocation;

    const urlLocation = parseParams(props.locationParams ?? {});
    if (urlLocation) return urlLocation;

    if (lastViewLocation.loading) return;
    return lastViewLocation() ?? null;
  });

  const [centerContentsPending, setCenterContentsPending] = createSignal(false);

  createEffect(
    on([dataState, computedLocation], () => {
      if (dataState() !== 'initialized') return;

      const location = computedLocation();
      if (location) {
        setCanvasState(location);
        setTimeout(() => setVisible(true), 10);
      } else if (location === null) {
        setCenterContentsPending(true);
        setVisible(true);
      }
    })
  );

  createRenderEffect((wasAnimating) => {
    if (visible() || !centerContentsPending()) return;

    const animating = animation.isAnimating;
    if (wasAnimating && !animating) {
      setTimeout(() => setVisible(true), 10);
      setCenterContentsPending(false);
    }
    return animating;
  });

  const setCanvasState = (location: {
    x?: number;
    y?: number;
    scale?: number;
  }) => {
    if (location.scale !== undefined && !Number.isNaN(location.scale)) {
      setRenderState('scale', location.scale / 100);
    }
    if (location.x !== undefined && !Number.isNaN(location.x)) {
      setRenderState('x', location.x);
    }
    if (location.y !== undefined && !Number.isNaN(location.y)) {
      setRenderState('y', location.y);
    }
  };

  const content = (
    <Show
      when={dataState() === 'initialized'}
      fallback={
        <Show
          when={dataState() === 'error'}
          fallback={
            <div class="flex size-full items-center justify-center">
              <Loading />
            </div>
          }
        >
          <div
            role="alert"
            class="size-full flex items-center justify-center px-3 text-sm text-alert-ink"
          >
            {loadError() === 'canvas.error.staleLive'
              ? t('canvas.error.staleLive')
              : t('canvas.error.parseFailed')}
          </div>
        </Show>
      }
    >
      <CanvasController>
        <Show when={visible()}>
          <CanvasRenderer />
          <CanvasPresenceCursors />
          <ToolBar />
        </Show>
      </CanvasController>
    </Show>
  );

  return props.children ? props.children(content) : content;
}

function getCanvasState(state: {
  x?: number;
  y?: number;
  scale?: number;
}): CanvasView {
  const x = state.x && !Number.isNaN(state.x) ? Math.round(state.x) : 0;
  const y = state.y && !Number.isNaN(state.y) ? Math.round(state.y) : 0;
  const scale =
    state.scale != null && !Number.isNaN(state.scale)
      ? Math.round(state.scale * 100)
      : 100;

  return { x, y, scale };
}

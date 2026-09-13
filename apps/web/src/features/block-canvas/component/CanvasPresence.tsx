import { t } from '@app/lib/i18n';
import { useBlockId } from '@core/block';
import { LiveIndicators } from '@core/component/LiveIndicators';
import { useUserId } from '@core/context/user';
import { getHashedPaletteColor } from '@ui/utils/palette';
import { createEffect, createSignal, For, onCleanup } from 'solid-js';
import { unwrap } from 'solid-js/store';
import {
  canvasPointToOverlayStyle,
  canvasPresenceHex,
  publishCanvasPresence,
  subscribeCanvasPresence,
  type CanvasPeerPresence,
} from '../store/canvas-sync';
import { renderStateStore, useRenderState } from '../store/RenderState';

const HEARTBEAT_MS = 4_000;
const MOVE_THROTTLE_MS = 40;

/** Avatars of peers on the live canvas sync-service session. */
export function CanvasPresenceList() {
  const documentId = useBlockId();
  const userId = useUserId();
  const [peers, setPeers] = createSignal<CanvasPeerPresence[]>([]);

  createEffect(() => {
    const unsub = subscribeCanvasPresence(documentId, setPeers);
    onCleanup(unsub);
  });

  const userIds = () => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const peer of peers()) {
      if (seen.has(peer.userId)) continue;
      seen.add(peer.userId);
      ids.push(peer.userId);
    }
    return ids;
  };

  return (
    <div
      class="flex items-center"
      data-testid="canvas-presence-list"
      title={t('canvas.collaboration.presence')}
    >
      <LiveIndicators userIds={userIds()} currentUserId={userId()} />
    </div>
  );
}

/** Remote cursors for peers on the live canvas session. */
export function CanvasPresenceCursors() {
  const documentId = useBlockId();
  const userId = useUserId();
  const render = useRenderState();
  const [peers, setPeers] = createSignal<CanvasPeerPresence[]>([]);

  createEffect(() => {
    const unsub = subscribeCanvasPresence(documentId, setPeers);
    onCleanup(unsub);
  });

  createEffect(() => {
    const id = documentId;
    const uid = userId() ?? 'anonymous';
    const color = getHashedPaletteColor(uid);
    let last = { x: 0, y: 0 };
    let lastAt = 0;
    const push = (x: number, y: number) => {
      last = { x, y };
      publishCanvasPresence(id, {
        userId: uid,
        name: uid,
        color,
        x,
        y,
      });
    };
    push(0, 0);
    const onMove = (event: PointerEvent) => {
      const now = Date.now();
      if (now - lastAt < MOVE_THROTTLE_MS) return;
      lastAt = now;
      const point = render.clientToCanvas({
        clientX: event.clientX,
        clientY: event.clientY,
      });
      push(point.x, point.y);
    };
    window.addEventListener('pointermove', onMove);
    const beat = window.setInterval(() => push(last.x, last.y), HEARTBEAT_MS);
    onCleanup(() => {
      window.removeEventListener('pointermove', onMove);
      window.clearInterval(beat);
    });
  });

  return (
    <div
      class="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      aria-hidden="true"
      data-testid="canvas-presence-cursors"
    >
      <For each={peers()}>
        {(peer) => {
          const style = () => {
            const state = unwrap(renderStateStore.get);
            const rect = state.containerRect;
            return canvasPointToOverlayStyle(peer.x, peer.y, {
              x: state.x,
              y: state.y,
              scale: state.scale,
              width: rect?.width ?? 0,
              height: rect?.height ?? 0,
            });
          };
          const hex = canvasPresenceHex(peer.color);
          return (
            <div
              class="absolute -translate-x-px -translate-y-px"
              data-testid="canvas-presence-cursor"
              style={{
                left: style().left,
                top: style().top,
                color: hex,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1 1v13l4-4 5 5 2-2-5-5h8z" />
              </svg>
              <span
                class="ml-3 rounded px-1 text-[10px] leading-4 text-white"
                style={{ 'background-color': hex }}
              >
                {peer.name}
              </span>
            </div>
          );
        }}
      </For>
    </div>
  );
}

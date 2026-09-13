import { EphemeralStore } from 'loro-crdt';

const DEFAULT_TIMEOUT_MS = 10_000;

/** One tab's ephemeral canvas presence (cursor + identity). */
export type CanvasPresenceState = {
  userId: string;
  name: string;
  color: string;
  x: number;
  y: number;
};

/** Remote peer presence after decoding a Loro ephemeral store. */
export type CanvasPeerPresence = CanvasPresenceState & { peerId: string };

function isPresenceState(value: unknown): value is CanvasPresenceState {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.userId === 'string' &&
    typeof rec.name === 'string' &&
    typeof rec.color === 'string' &&
    typeof rec.x === 'number' &&
    typeof rec.y === 'number'
  );
}

function parsePeer(
  peerId: string,
  value: unknown
): CanvasPeerPresence | undefined {
  if (!isPresenceState(value)) return undefined;
  return { peerId, ...value };
}

/** Loro ephemeral store for canvas awareness over the existing sync-service WS. */
export function createCanvasPresenceStore(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const store = new EphemeralStore(timeoutMs);

  return {
    apply(bytes: Uint8Array): void {
      if (bytes.length === 0) return;
      store.apply(bytes);
    },
    set(peerId: string, state: CanvasPresenceState): void {
      store.set(peerId, state);
    },
    clear(peerId: string): void {
      store.set(peerId, undefined);
    },
    encode(peerId: string): Uint8Array {
      return store.encode(peerId);
    },
    list(excludePeerId?: string): CanvasPeerPresence[] {
      const all = store.getAllStates() as Record<string, unknown>;
      const peers: CanvasPeerPresence[] = [];
      for (const [peerId, value] of Object.entries(all)) {
        if (excludePeerId && peerId === excludePeerId) continue;
        const parsed = parsePeer(peerId, value);
        if (parsed) peers.push(parsed);
      }
      return peers;
    },
  };
}

export type CanvasPresenceStore = ReturnType<typeof createCanvasPresenceStore>;

/** Place a board-space cursor inside the pan/zoom overlay. */
export function canvasPointToOverlayStyle(
  canvasX: number,
  canvasY: number,
  view: { x: number; y: number; scale: number; width: number; height: number }
): { left: string; top: string } {
  return {
    left: `${canvasX * view.scale + view.width / 2 + view.x}px`,
    top: `${canvasY * view.scale + view.height / 2 + view.y}px`,
  };
}

const PRESENCE_HEX: Record<string, string> = {
  red: '#e11d48',
  orange: '#ea580c',
  amber: '#d97706',
  yellow: '#ca8a04',
  lime: '#65a30d',
  green: '#16a34a',
  teal: '#0d9488',
  cyan: '#0891b2',
  blue: '#2563eb',
  violet: '#7c3aed',
  purple: '#9333ea',
  pink: '#db2777',
};

/** CSS color for a palette name from presence. */
export function canvasPresenceHex(color: string): string {
  return PRESENCE_HEX[color] ?? PRESENCE_HEX.blue ?? '#2563eb';
}

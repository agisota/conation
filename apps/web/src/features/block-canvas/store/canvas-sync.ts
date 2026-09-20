import type { LoroDoc } from 'loro-crdt';
import { LoroDoc as Loro } from 'loro-crdt';
import {
  boardFromDoc,
  importCanvasLoroSnapshot,
  snapshotFromJson,
  type CanvasLoroJson,
} from './canvas-loro';
import {
  createCanvasPresenceStore,
  type CanvasPeerPresence,
  type CanvasPresenceState,
  type CanvasPresenceStore,
} from './canvas-presence';

export type { CanvasPeerPresence, CanvasPresenceState };
export {
  canvasPointToOverlayStyle,
  canvasPresenceHex,
} from './canvas-presence';

export type CanvasLiveRemoteEvent = {
  type: string;
  update?: Uint8Array;
  snapshot?: Uint8Array;
  awareness?: Uint8Array;
};

/** Minimal live-sync surface used after one-shot `initialize_from_snapshot`. */
export type CanvasLiveSource = {
  documentId: string;
  listen: (listener: (event: CanvasLiveRemoteEvent) => void) => () => void;
  pushUpdate: (updates: Uint8Array[]) => Promise<boolean>;
  pushAwareness?: (awareness: Uint8Array) => void;
  cleanup: () => void;
};

type Session = {
  source: CanvasLiveSource;
  doc: LoroDoc;
  unlisten: () => void;
  presence: CanvasPresenceStore;
};

const sessions = new Map<string, Session>();
const presenceListeners = new Map<
  string,
  Set<(peers: CanvasPeerPresence[]) => void>
>();

function importInto(doc: LoroDoc, bytes: Uint8Array): void {
  if (bytes.length === 0) return;
  doc.import(bytes);
}

function emitPresence(documentId: string, peers: CanvasPeerPresence[]): void {
  const listeners = presenceListeners.get(documentId);
  if (!listeners) return;
  for (const listener of listeners) listener(peers);
}

function notifyPresence(session: Session, documentId: string): void {
  emitPresence(documentId, session.presence.list(session.doc.peerIdStr));
}

export type CanvasSnapshotApi = {
  exists: (documentId: string) => Promise<boolean>;
  initialize: (documentId: string, snapshot: Uint8Array) => Promise<boolean>;
};

/**
 * Seed sync-service initialize for boards that never got a Loro snapshot
 * so the live WS session is not a no-op.
 */
export async function seedMissingCanvasSnapshot(opts: {
  documentId: string;
  board: CanvasLoroJson;
  api: CanvasSnapshotApi;
}): Promise<'exists' | 'initialized' | 'skipped'> {
  if (await opts.api.exists(opts.documentId)) return 'exists';
  const snapshot = snapshotFromJson(opts.board);
  if (snapshot.length === 0) return 'skipped';
  const ok = await opts.api.initialize(opts.documentId, snapshot);
  return ok ? 'initialized' : 'skipped';
}

/**
 * After the one-shot sync-service snapshot, keep a Loro doc and push/apply
 * incremental updates over the live WS source.
 *
 * The initial snapshot must land in the local WAL (`peekCanvasLoro`) and
 * paint the board (`onRemoteBoard`) so a second client does not hydrate
 * empty/stale DSS JSON and push deletes. Parse/import failure returns false
 * so the UI can show `canvas.error.staleLive` instead of spinning.
 */
export async function connectCanvasLiveSync(opts: {
  documentId: string;
  source: CanvasLiveSource;
  doInitialSync: () => Promise<{
    snapshot: Uint8Array;
    awareness?: Uint8Array;
  } | null>;
  onRemoteBoard?: (board: CanvasLoroJson) => void;
  onPresence?: (peers: CanvasPeerPresence[]) => void;
}): Promise<boolean> {
  disconnectCanvasLiveSync(opts.documentId);
  let initial: {
    snapshot: Uint8Array;
    awareness?: Uint8Array;
  } | null;
  try {
    initial = await opts.doInitialSync();
  } catch {
    opts.source.cleanup();
    return false;
  }
  if (!initial || initial.snapshot.length === 0) {
    opts.source.cleanup();
    return false;
  }
  const doc = new Loro();
  try {
    importInto(doc, initial.snapshot);
  } catch {
    opts.source.cleanup();
    return false;
  }
  const persisted = importCanvasLoroSnapshot(
    opts.documentId,
    initial.snapshot
  );
  if (persisted) importInto(doc, persisted);

  const presence = createCanvasPresenceStore();
  if (initial.awareness) presence.apply(initial.awareness);
  const publishList = () => {
    const peers = presence.list(doc.peerIdStr);
    opts.onPresence?.(peers);
    emitPresence(opts.documentId, peers);
  };
  const unlisten = opts.source.listen((event) => {
    if (event.type === 'awareness' && event.awareness) {
      presence.apply(event.awareness);
      publishList();
      return;
    }
    if (event.type === 'update' && event.update) {
      importInto(doc, event.update);
    } else if (
      (event.type === 'reconnect' || event.type === 'incremental_snapshot') &&
      event.snapshot
    ) {
      importInto(doc, event.snapshot);
      if (event.awareness) {
        presence.apply(event.awareness);
        publishList();
      }
    } else {
      return;
    }
    opts.onRemoteBoard?.(boardFromDoc(doc));
  });
  sessions.set(opts.documentId, { source: opts.source, doc, unlisten, presence });
  // Live snapshot is last-write: paint before later DSS/WAL JSON can stick.
  opts.onRemoteBoard?.(boardFromDoc(doc));
  publishList();
  return true;
}

export function disconnectCanvasLiveSync(documentId: string): void {
  const session = sessions.get(documentId);
  if (!session) return;
  session.presence.clear(session.doc.peerIdStr);
  const encoded = session.presence.encode(session.doc.peerIdStr);
  session.source.pushAwareness?.(encoded);
  session.unlisten();
  session.source.cleanup();
  sessions.delete(documentId);
  emitPresence(documentId, []);
}

export function hasCanvasLiveSync(documentId: string): boolean {
  return sessions.has(documentId);
}

/** Live session snapshot so the first WAL persist can diff instead of applyBoard. */
export function peekCanvasLiveSnapshot(documentId: string): Uint8Array | null {
  const session = sessions.get(documentId);
  if (!session) return null;
  const bytes = session.doc.export({ mode: 'snapshot' });
  return bytes.length > 0 ? bytes : null;
}

/** Push a Loro update on the live WS after initial sync. */
export async function pushCanvasLiveUpdate(
  documentId: string,
  update: Uint8Array
): Promise<boolean> {
  const session = sessions.get(documentId);
  if (!session || update.length === 0) return false;
  importInto(session.doc, update);
  return session.source.pushUpdate([update]);
}

/** Publish local cursor/identity on the live WS awareness channel. */
export function publishCanvasPresence(
  documentId: string,
  state: CanvasPresenceState
): boolean {
  const session = sessions.get(documentId);
  if (!session?.source.pushAwareness) return false;
  const peerId = session.doc.peerIdStr;
  session.presence.set(peerId, state);
  session.source.pushAwareness(session.presence.encode(peerId));
  notifyPresence(session, documentId);
  return true;
}

/** Remote peers currently in the live canvas session. */
export function listCanvasPresence(documentId: string): CanvasPeerPresence[] {
  const session = sessions.get(documentId);
  if (!session) return [];
  return session.presence.list(session.doc.peerIdStr);
}

/** Subscribe to remote canvas presence changes. */
export function subscribeCanvasPresence(
  documentId: string,
  listener: (peers: CanvasPeerPresence[]) => void
): () => void {
  let set = presenceListeners.get(documentId);
  if (!set) {
    set = new Set();
    presenceListeners.set(documentId, set);
  }
  set.add(listener);
  listener(listCanvasPresence(documentId));
  return () => {
    set.delete(listener);
    if (set.size === 0) presenceListeners.delete(documentId);
  };
}

/** Test helper. */
export function resetCanvasLiveSync(): void {
  for (const id of [...sessions.keys()]) {
    disconnectCanvasLiveSync(id);
  }
  presenceListeners.clear();
}

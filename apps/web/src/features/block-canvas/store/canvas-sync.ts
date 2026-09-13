import type { LoroDoc } from 'loro-crdt';
import { LoroDoc as Loro } from 'loro-crdt';
import {
  boardFromDoc,
  type CanvasLoroJson,
} from './canvas-loro';

export type CanvasLiveRemoteEvent = {
  type: string;
  update?: Uint8Array;
  snapshot?: Uint8Array;
};

/** Minimal live-sync surface used after one-shot `initialize_from_snapshot`. */
export type CanvasLiveSource = {
  documentId: string;
  listen: (listener: (event: CanvasLiveRemoteEvent) => void) => () => void;
  pushUpdate: (updates: Uint8Array[]) => Promise<boolean>;
  cleanup: () => void;
};

type Session = {
  source: CanvasLiveSource;
  doc: LoroDoc;
  unlisten: () => void;
};

const sessions = new Map<string, Session>();

function importInto(doc: LoroDoc, bytes: Uint8Array): void {
  if (bytes.length === 0) return;
  doc.import(bytes);
}

/**
 * After the one-shot sync-service snapshot, keep a Loro doc and push/apply
 * incremental updates over the live WS source.
 */
export async function connectCanvasLiveSync(opts: {
  documentId: string;
  source: CanvasLiveSource;
  doInitialSync: () => Promise<{ snapshot: Uint8Array } | null>;
  onRemoteBoard?: (board: CanvasLoroJson) => void;
}): Promise<boolean> {
  disconnectCanvasLiveSync(opts.documentId);
  const initial = await opts.doInitialSync();
  if (!initial) {
    opts.source.cleanup();
    return false;
  }
  const doc = new Loro();
  importInto(doc, initial.snapshot);
  const unlisten = opts.source.listen((event) => {
    if (event.type === 'update' && event.update) {
      importInto(doc, event.update);
    } else if (
      (event.type === 'reconnect' || event.type === 'incremental_snapshot') &&
      event.snapshot
    ) {
      importInto(doc, event.snapshot);
    } else {
      return;
    }
    opts.onRemoteBoard?.(boardFromDoc(doc));
  });
  sessions.set(opts.documentId, { source: opts.source, doc, unlisten });
  return true;
}

export function disconnectCanvasLiveSync(documentId: string): void {
  const session = sessions.get(documentId);
  if (!session) return;
  session.unlisten();
  session.source.cleanup();
  sessions.delete(documentId);
}

export function hasCanvasLiveSync(documentId: string): boolean {
  return sessions.has(documentId);
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

/** Test helper. */
export function resetCanvasLiveSync(): void {
  for (const id of [...sessions.keys()]) {
    disconnectCanvasLiveSync(id);
  }
}

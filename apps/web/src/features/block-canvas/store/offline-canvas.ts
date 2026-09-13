const STORAGE_KEY = 'conation:offline-canvas';
const MAX_BOARDS = 40;

/** Canvas JSON kept when DSS simpleSave fails (offline / transport). */
export type OfflineCanvasJson = {
  nodes?: unknown[];
  edges?: unknown[];
  groups?: unknown[];
};

type OfflineCanvasRecord = {
  documentId: string;
  json: OfflineCanvasJson;
  savedAt: number;
};

function readStore(): Record<string, OfflineCanvasRecord> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, OfflineCanvasRecord>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, OfflineCanvasRecord>): boolean {
  if (typeof localStorage === 'undefined') return false;
  const entries = Object.values(store).sort((a, b) => b.savedAt - a.savedAt);
  const next: Record<string, OfflineCanvasRecord> = {};
  for (const row of entries.slice(0, MAX_BOARDS)) {
    next[row.documentId] = row;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** Snapshot a board so collab edits survive a failed/offline DSS put. */
export function recordOfflineCanvas(
  documentId: string,
  json: OfflineCanvasJson
): boolean {
  if (!documentId) return false;
  const store = readStore();
  store[documentId] = {
    documentId,
    json,
    savedAt: Date.now(),
  };
  return writeStore(store);
}

/** Local board that has not yet reached object storage, if any. */
export function peekOfflineCanvas(
  documentId: string
): OfflineCanvasJson | null {
  const row = readStore()[documentId];
  return row?.json ?? null;
}

export function clearOfflineCanvas(documentId: string): void {
  const store = readStore();
  if (!(documentId in store)) return;
  delete store[documentId];
  writeStore(store);
}

export function listOfflineCanvasIds(): string[] {
  return Object.keys(readStore());
}

/** Test helper. */
export function clearAllOfflineCanvases(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

let flushListening = false;

/** Replay queued boards when the browser comes back online. */
export function ensureOfflineCanvasFlush(
  flush: (documentId: string, json: OfflineCanvasJson) => Promise<boolean>
): void {
  if (typeof window === 'undefined' || flushListening) return;
  flushListening = true;
  window.addEventListener('online', () => {
    void (async () => {
      for (const documentId of listOfflineCanvasIds()) {
        const json = peekOfflineCanvas(documentId);
        if (!json) continue;
        const ok = await flush(documentId, json);
        if (ok) clearOfflineCanvas(documentId);
      }
    })();
  });
}

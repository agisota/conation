const STORAGE_KEY = 'conation:offline-create';
const MAX_RECORDS = 50;

type OfflineCreateBase = {
  id: string;
  queuedAt: number;
};

export type OfflineCreateRecord = OfflineCreateBase &
  (
    | {
        kind: 'task';
        title?: string;
        content?: string;
        projectId?: string;
        propertyValues?: unknown;
        source?: string;
      }
    | {
        kind: 'canvas';
        json: string;
        title?: string;
        projectId?: string;
        source?: string;
      }
    | {
        kind: 'markdown';
        title?: string;
        content?: string;
        projectId?: string;
        source?: string;
      }
  );

function readStore(): OfflineCreateRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is OfflineCreateRecord =>
        !!row &&
        typeof row === 'object' &&
        typeof (row as OfflineCreateRecord).id === 'string' &&
        typeof (row as OfflineCreateRecord).kind === 'string'
    );
  } catch {
    return [];
  }
}

function writeStore(rows: OfflineCreateRecord[]): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(rows.slice(0, MAX_RECORDS))
    );
    return true;
  } catch {
    return false;
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Queue a docs/tasks/Canvas create that the storage API could not accept offline. */
export function queueOfflineCreate(
  record: Omit<OfflineCreateRecord, 'id' | 'queuedAt'> & {
    id?: string;
    queuedAt?: number;
  }
): string {
  const next: OfflineCreateRecord = {
    ...record,
    id: record.id ?? newId(),
    queuedAt: record.queuedAt ?? Date.now(),
  } as OfflineCreateRecord;
  const rows = readStore().filter((row) => row.id !== next.id);
  rows.unshift(next);
  writeStore(rows);
  return next.id;
}

export function listOfflineCreates(): OfflineCreateRecord[] {
  return readStore();
}

/** Take every queued create so a flush can replay them. */
export function dequeueOfflineCreates(): OfflineCreateRecord[] {
  const rows = readStore();
  writeStore([]);
  return rows;
}

export function clearOfflineCreates(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (Array.isArray(error)) {
    return error
      .map((item) => {
        if (item && typeof item === 'object' && 'message' in item) {
          return String((item as { message: unknown }).message);
        }
        return String(item);
      })
      .join(' ');
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error ?? '');
}

/** Transport failures — not paywall / auth — can be queued for replay. */
export function isOfflineCreateFailure(error: unknown): boolean {
  const text = errorText(error);
  return /failed to fetch|networkerror|network request failed|offline|econnrefused|etimedout|load failed|network error/i.test(
    text
  );
}

let flushListening = false;

export function ensureOfflineCreateFlush(flush: () => Promise<unknown>): void {
  if (typeof window === 'undefined' || flushListening) return;
  flushListening = true;
  window.addEventListener('online', () => {
    void flush();
  });
}

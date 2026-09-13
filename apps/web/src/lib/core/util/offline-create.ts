const STORAGE_KEY = 'conation:offline-create';
const LOCAL_FIRST_STORAGE_KEY = 'conation:local-first-ids';
const MAX_RECORDS = 50;

/** Soup / preview ids for creates that have not been accepted by the server yet. */
export const LOCAL_FIRST_PREFIX = 'local:';

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

/** Client-generated soup id used until the create flushes to a server id. */
export function allocateLocalFirstId(): string {
  return `${LOCAL_FIRST_PREFIX}${newId()}`;
}

export function isLocalFirstId(id: string): boolean {
  return id.startsWith(LOCAL_FIRST_PREFIX);
}

export function toLocalFirstId(id: string): string {
  return isLocalFirstId(id) ? id : `${LOCAL_FIRST_PREFIX}${id}`;
}

export type LocalFirstBinding = {
  localId: string;
  kind: OfflineCreateRecord['kind'];
  title?: string;
  queuedAt: number;
  serverId?: string;
};

function readBindings(): LocalFirstBinding[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_FIRST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is LocalFirstBinding =>
        !!row &&
        typeof row === 'object' &&
        typeof (row as LocalFirstBinding).localId === 'string'
    );
  } catch {
    return [];
  }
}

function writeBindings(rows: LocalFirstBinding[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      LOCAL_FIRST_STORAGE_KEY,
      JSON.stringify(rows.slice(0, MAX_RECORDS))
    );
  } catch {
    // quota / private mode — the create queue still holds the payload
  }
}

/** Remember a queued create so soup can keep the local id until replay binds a server id. */
export function rememberLocalFirstBinding(
  binding: LocalFirstBinding
): LocalFirstBinding {
  const localId = toLocalFirstId(binding.localId);
  const existing = readBindings().find((row) => row.localId === localId);
  const next: LocalFirstBinding = {
    kind: binding.kind ?? existing?.kind ?? 'markdown',
    title: binding.title ?? existing?.title,
    queuedAt: binding.queuedAt ?? existing?.queuedAt ?? Date.now(),
    serverId: binding.serverId ?? existing?.serverId,
    localId,
  };
  writeBindings([
    next,
    ...readBindings().filter((row) => row.localId !== localId),
  ]);
  return next;
}

/** Map a local-first soup id to the server id returned by a successful flush. */
export function bindLocalFirstId(
  localId: string,
  serverId: string
): LocalFirstBinding {
  const existing = readBindings().find(
    (row) => row.localId === toLocalFirstId(localId)
  );
  return rememberLocalFirstBinding({
    localId,
    kind: existing?.kind ?? 'markdown',
    title: existing?.title,
    queuedAt: existing?.queuedAt ?? Date.now(),
    serverId,
  });
}

export function listLocalFirstBindings(): LocalFirstBinding[] {
  return readBindings();
}

/** Server soup id when known, otherwise the local-first id still in soup. */
export function resolveSoupId(id: string): string {
  if (!isLocalFirstId(id)) return id;
  return readBindings().find((row) => row.localId === id)?.serverId ?? id;
}

export function clearLocalFirstBindings(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(LOCAL_FIRST_STORAGE_KEY);
}

/** Queue a docs/tasks/Canvas create that the storage API could not accept offline. */
export function queueOfflineCreate(
  record: Omit<OfflineCreateRecord, 'id' | 'queuedAt'> & {
    id?: string;
    queuedAt?: number;
  }
): string {
  const id =
    record.id && record.id.length > 0
      ? toLocalFirstId(record.id)
      : allocateLocalFirstId();
  const next: OfflineCreateRecord = {
    ...record,
    id,
    queuedAt: record.queuedAt ?? Date.now(),
  } as OfflineCreateRecord;
  const rows = readStore().filter((row) => row.id !== next.id);
  rows.unshift(next);
  writeStore(rows);
  rememberLocalFirstBinding({
    localId: next.id,
    kind: next.kind,
    title: 'title' in next ? next.title : undefined,
    queuedAt: next.queuedAt,
  });
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

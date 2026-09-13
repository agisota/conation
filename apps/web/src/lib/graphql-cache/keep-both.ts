const KEEP_BOTH_STORAGE_KEY = 'conation:keep-both';
const KEEP_BOTH_MAX_RECORDS = 50;

/** Local + remote snapshots kept when an optimistic write cannot merge. */
export type KeepBothRecord = {
  transactionId: string;
  recordedAt: number;
  query: string;
  operationName?: string;
  variables: Record<string, unknown>;
  /** Optimistic / queued local payload. */
  local: unknown;
  /** Server payload or error body that refused the merge. */
  remote: unknown;
  error: string;
};

type GraphQlErrorLike = {
  message?: string;
  extensions?: Record<string, unknown>;
};

type ConflictErrorLike = {
  message?: string;
  response?: { status?: number };
  networkError?: { status?: number; statusCode?: number } | Error | null;
  graphQLErrors?: GraphQlErrorLike[];
};

function conflictStatus(error: ConflictErrorLike): number | undefined {
  const network = error.networkError;
  const networkStatus =
    network && typeof network === 'object' && 'status' in network
      ? network.status
      : undefined;
  const networkStatusCode =
    network && typeof network === 'object' && 'statusCode' in network
      ? network.statusCode
      : undefined;
  return error.response?.status ?? networkStatus ?? networkStatusCode;
}

function conflictCode(value: unknown): string {
  return typeof value === 'string' ? value.toUpperCase() : '';
}

/**
 * True when a queued mutation failed because the server copy cannot merge
 * with the local optimistic write (HTTP 409/412 or GraphQL CONFLICT).
 */
export function isUnmergeableConflict(error: unknown): boolean {
  if (error == null) return false;
  const like = error as ConflictErrorLike;
  const status = conflictStatus(like);
  if (status === 409 || status === 412) return true;
  for (const gql of like.graphQLErrors ?? []) {
    const code = conflictCode(gql.extensions?.code);
    if (
      code === 'CONFLICT' ||
      code === 'VERSION_MISMATCH' ||
      code === 'UNMERGEABLE'
    ) {
      return true;
    }
    if (/(conflict|version mismatch|unmergeable)/i.test(gql.message ?? '')) {
      return true;
    }
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof like.message === 'string'
        ? like.message
        : '';
  return /\b(409|412)\b/.test(message) && /conflict|precondition/i.test(message);
}

function readKeepBothStore(): KeepBothRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEEP_BOTH_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is KeepBothRecord =>
        !!row &&
        typeof row === 'object' &&
        typeof (row as KeepBothRecord).transactionId === 'string'
    );
  } catch {
    return [];
  }
}

/** Persist both sides of an unmergeable conflict before rolling back optimism. */
export function recordKeepBoth(
  record: Omit<KeepBothRecord, 'recordedAt'> & { recordedAt?: number }
): boolean {
  if (typeof localStorage === 'undefined') return false;
  const next: KeepBothRecord = {
    ...record,
    recordedAt: record.recordedAt ?? Date.now(),
  };
  const rows = readKeepBothStore().filter(
    (row) => row.transactionId !== next.transactionId
  );
  rows.unshift(next);
  try {
    localStorage.setItem(
      KEEP_BOTH_STORAGE_KEY,
      JSON.stringify(rows.slice(0, KEEP_BOTH_MAX_RECORDS))
    );
    return true;
  } catch {
    return false;
  }
}

/** Records kept so the user can restore either side after a conflict. */
export function listKeepBoth(): KeepBothRecord[] {
  return readKeepBothStore();
}

/** Test helper: wipe the keep-both store. */
export function clearKeepBoth(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(KEEP_BOTH_STORAGE_KEY);
}

const SOUP_ID_KEYS = new Set([
  'id',
  'entityId',
  'documentId',
  'itemId',
  'document_id',
  'entity_id',
]);

function collectSoupIds(value: unknown, into: Set<string>, depth = 0): void {
  if (depth > 4 || value == null) return;
  if (typeof value === 'string') {
    if (value.startsWith('local:') || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) {
      into.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectSoupIds(item, into, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SOUP_ID_KEYS.has(key) && typeof nested === 'string' && nested.length > 0) {
        into.add(nested);
      } else {
        collectSoupIds(nested, into, depth + 1);
      }
    }
  }
}

/** Soup entity ids carried on a keep-both record (variables + chosen snapshot). */
export function soupIdsFromKeepBoth(
  record: KeepBothRecord,
  side?: 'local' | 'remote'
): string[] {
  const ids = new Set<string>();
  collectSoupIds(record.variables, ids);
  if (side === 'local') collectSoupIds(record.local, ids);
  else if (side === 'remote') collectSoupIds(record.remote, ids);
  else {
    collectSoupIds(record.local, ids);
    collectSoupIds(record.remote, ids);
  }
  return [...ids];
}

export function snapshotTitle(snapshot: unknown): string | undefined {
  if (!snapshot || typeof snapshot !== 'object') return undefined;
  const record = snapshot as Record<string, unknown>;
  for (const key of ['title', 'name', 'documentName', 'taskName']) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  const input = record.input;
  if (input && typeof input === 'object') {
    return snapshotTitle(input);
  }
  return undefined;
}

export type KeepBothRestore = {
  transactionId: string;
  side: 'local' | 'remote';
  soupIds: string[];
  snapshot: unknown;
  title?: string;
};

/** Pick a stored side so the restore UI can open soup ids and preview. */
export function restoreKeepBoth(
  transactionId: string,
  side: 'local' | 'remote'
): KeepBothRestore | undefined {
  const record = readKeepBothStore().find((row) => row.transactionId === transactionId);
  if (!record) return undefined;
  const snapshot = side === 'local' ? record.local : record.remote;
  return {
    transactionId,
    side,
    soupIds: soupIdsFromKeepBoth(record, side),
    snapshot,
    title: snapshotTitle(snapshot) ?? snapshotTitle(record.variables),
  };
}

function writeKeepBothStore(rows: KeepBothRecord[]): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(
      KEEP_BOTH_STORAGE_KEY,
      JSON.stringify(rows.slice(0, KEEP_BOTH_MAX_RECORDS))
    );
    return true;
  } catch {
    return false;
  }
}

/** Drop a resolved keep-both snapshot after the user restores or dismisses it. */
export function dismissKeepBoth(transactionId: string): boolean {
  const rows = readKeepBothStore();
  const next = rows.filter((row) => row.transactionId !== transactionId);
  if (next.length === rows.length) return false;
  return writeKeepBothStore(next);
}


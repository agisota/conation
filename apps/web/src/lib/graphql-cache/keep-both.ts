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

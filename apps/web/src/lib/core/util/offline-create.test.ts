/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  allocateLocalFirstId,
  bindLocalFirstId,
  clearLocalFirstBindings,
  clearOfflineCreates,
  dequeueOfflineCreates,
  isLocalFirstId,
  isOfflineCreateFailure,
  listLocalFirstBindings,
  listOfflineCreates,
  queueOfflineCreate,
  resolveSoupId,
} from './offline-create';

afterEach(() => {
  clearOfflineCreates();
  clearLocalFirstBindings();
});

describe('isOfflineCreateFailure', () => {
  it('queues transport errors and ignores paywall/auth copy', () => {
    expect(isOfflineCreateFailure(new TypeError('Failed to fetch'))).toBe(
      true
    );
    expect(
      isOfflineCreateFailure([{ code: 'NETWORK', message: 'offline' }])
    ).toBe(true);
    expect(
      isOfflineCreateFailure([{ code: 'UNAUTHORIZED', message: '403' }])
    ).toBe(false);
  });
});

describe('queueOfflineCreate', () => {
  it('stores task, markdown, and canvas payloads for later replay', () => {
    queueOfflineCreate({
      kind: 'task',
      title: 'Queued task',
      id: 't1',
      queuedAt: 1,
    });
    queueOfflineCreate({
      kind: 'markdown',
      title: 'Queued doc',
      content: '# hi',
      id: 'm1',
      queuedAt: 2,
    });
    queueOfflineCreate({
      kind: 'canvas',
      json: '{"nodes":[],"edges":[]}',
      title: 'Board',
      id: 'c1',
      queuedAt: 3,
    });
    expect(listOfflineCreates().map((row) => row.kind)).toEqual([
      'canvas',
      'markdown',
      'task',
    ]);
    expect(listOfflineCreates().every((row) => isLocalFirstId(row.id))).toBe(
      true
    );
    const taken = dequeueOfflineCreates();
    expect(taken).toHaveLength(3);
    expect(listOfflineCreates()).toEqual([]);
  });
});

describe('local-first soup ids', () => {
  it('allocates local: ids and binds them to server soup ids', () => {
    const localId = allocateLocalFirstId();
    expect(isLocalFirstId(localId)).toBe(true);
    const queued = queueOfflineCreate({
      kind: 'markdown',
      title: 'Draft',
      id: localId,
      queuedAt: 1,
    });
    expect(queued).toBe(localId);
    expect(resolveSoupId(localId)).toBe(localId);
    bindLocalFirstId(localId, 'server-doc-1');
    expect(resolveSoupId(localId)).toBe('server-doc-1');
    expect(
      listLocalFirstBindings().find((row) => row.localId === localId)?.serverId
    ).toBe('server-doc-1');
  });
});

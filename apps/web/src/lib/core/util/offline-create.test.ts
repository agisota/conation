/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  clearOfflineCreates,
  dequeueOfflineCreates,
  isOfflineCreateFailure,
  listOfflineCreates,
  queueOfflineCreate,
} from './offline-create';

afterEach(() => {
  clearOfflineCreates();
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
    const taken = dequeueOfflineCreates();
    expect(taken).toHaveLength(3);
    expect(listOfflineCreates()).toEqual([]);
  });
});

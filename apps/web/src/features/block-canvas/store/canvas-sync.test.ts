/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  clearAllCanvasLoro,
  encodeCanvasLoroUpdate,
  peekCanvasLoro,
  recordCanvasLoro,
} from './canvas-loro';
import { createCanvasPresenceStore } from './canvas-presence';
import {
  connectCanvasLiveSync,
  hasCanvasLiveSync,
  listCanvasPresence,
  peekCanvasLiveSnapshot,
  publishCanvasPresence,
  pushCanvasLiveUpdate,
  resetCanvasLiveSync,
  seedMissingCanvasSnapshot,
  type CanvasLiveRemoteEvent,
  type CanvasLiveSource,
} from './canvas-sync';

afterEach(() => {
  clearAllCanvasLoro();
  resetCanvasLiveSync();
});

function fakeSource(documentId: string): {
  source: CanvasLiveSource;
  pushed: Uint8Array[][];
  awareness: Uint8Array[];
  emit: (event: CanvasLiveRemoteEvent) => void;
} {
  const listeners = new Set<(event: CanvasLiveRemoteEvent) => void>();
  const pushed: Uint8Array[][] = [];
  const awareness: Uint8Array[] = [];
  return {
    pushed,
    awareness,
    emit: (event) => {
      for (const listener of listeners) listener(event);
    },
    source: {
      documentId,
      listen: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      pushUpdate: async (updates) => {
        pushed.push(updates);
        return true;
      },
      pushAwareness: (bytes) => {
        awareness.push(bytes);
      },
      cleanup: () => {
        listeners.clear();
      },
    },
  };
}

describe('canvas Loro tombstones', () => {
  it('drops a node removed in a later local save', () => {
    expect(
      recordCanvasLoro('doc-1', {
        nodes: [{ id: 'a' }, { id: 'b' }],
        edges: [],
      })
    ).toBeTruthy();
    expect(
      recordCanvasLoro('doc-1', { nodes: [{ id: 'a' }], edges: [] })
    ).toBeTruthy();
    const ids = (peekCanvasLoro('doc-1')?.nodes ?? []).map(
      (n) => (n as { id: string }).id
    );
    expect(ids).toEqual(['a']);
  });

  it('keeps a later add when the previous node is still present', () => {
    recordCanvasLoro('doc-1', { nodes: [{ id: 'a' }], edges: [] });
    recordCanvasLoro('doc-1', {
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [],
    });
    const ids = (peekCanvasLoro('doc-1')?.nodes ?? []).map(
      (n) => (n as { id: string }).id
    );
    expect(ids).toEqual(expect.arrayContaining(['a', 'b']));
  });
});

describe('canvas live WS apply-update', () => {
  it('does not push before the session is connected', async () => {
    const update = encodeCanvasLoroUpdate({ nodes: [{ id: 'a' }], edges: [] }, 1n);
    expect(await pushCanvasLiveUpdate('doc-1', update)).toBe(false);
  });

  it('pushes incremental updates after initial sync', async () => {
    const snapshot = encodeCanvasLoroUpdate(
      { nodes: [{ id: 'a' }], edges: [] },
      1n
    );
    const fake = fakeSource('doc-1');
    const ok = await connectCanvasLiveSync({
      documentId: 'doc-1',
      source: fake.source,
      doInitialSync: async () => ({ snapshot }),
    });
    expect(ok).toBe(true);
    expect(hasCanvasLiveSync('doc-1')).toBe(true);

    const live = peekCanvasLiveSnapshot('doc-1');
    const update = recordCanvasLoro(
      'doc-1',
      {
        nodes: [{ id: 'a' }, { id: 'b' }],
        edges: [],
      },
      { snapshot: live ?? undefined }
    );
    expect(update).toBeTruthy();
    expect(await pushCanvasLiveUpdate('doc-1', update!)).toBe(true);
    expect(fake.pushed).toHaveLength(1);
    expect(fake.pushed[0][0]).toEqual(update);
  });

  it('applies a remote update onto the live board', async () => {
    const snapshot = encodeCanvasLoroUpdate(
      { nodes: [{ id: 'a' }], edges: [] },
      1n
    );
    const remote = encodeCanvasLoroUpdate(
      { nodes: [{ id: 'b' }], edges: [] },
      2n
    );
    const fake = fakeSource('doc-1');
    const boards: { id?: string }[][] = [];
    await connectCanvasLiveSync({
      documentId: 'doc-1',
      source: fake.source,
      doInitialSync: async () => ({ snapshot }),
      onRemoteBoard: (board) => {
        boards.push((board.nodes ?? []) as { id?: string }[]);
      },
    });
    expect((boards[0] ?? []).map((n) => n.id)).toEqual(
      expect.arrayContaining(['a'])
    );
    fake.emit({ type: 'update', update: remote });
    const ids = (boards.at(-1) ?? []).map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('skips live sync when initial snapshot is missing', async () => {
    const fake = fakeSource('doc-1');
    const ok = await connectCanvasLiveSync({
      documentId: 'doc-1',
      source: fake.source,
      doInitialSync: async () => null,
    });
    expect(ok).toBe(false);
    expect(hasCanvasLiveSync('doc-1')).toBe(false);
  });

  it('skips live sync when initial snapshot import fails', async () => {
    const fake = fakeSource('doc-1');
    const ok = await connectCanvasLiveSync({
      documentId: 'doc-1',
      source: fake.source,
      doInitialSync: async () => {
        throw new Error('sync down');
      },
    });
    expect(ok).toBe(false);
    expect(hasCanvasLiveSync('doc-1')).toBe(false);
  });

  it('initializes boards that never had a snapshot', async () => {
    const initialized: Uint8Array[] = [];
    const result = await seedMissingCanvasSnapshot({
      documentId: 'doc-missing',
      board: { nodes: [{ id: 'a' }], edges: [] },
      api: {
        exists: async () => false,
        initialize: async (_id, snapshot) => {
          initialized.push(snapshot);
          return true;
        },
      },
    });
    expect(result).toBe('initialized');
    expect(initialized).toHaveLength(1);
    expect(initialized[0].byteLength).toBeGreaterThan(0);
  });

  it('first WAL persist after live sync diffs against the live snapshot', async () => {
    const snapshot = encodeCanvasLoroUpdate(
      { nodes: [{ id: 'a' }, { id: 'b', kind: 'old' }], edges: [] },
      1n
    );
    const fake = fakeSource('doc-1');
    await connectCanvasLiveSync({
      documentId: 'doc-1',
      source: fake.source,
      doInitialSync: async () => ({ snapshot }),
    });
    const live = peekCanvasLiveSnapshot('doc-1');
    expect(live?.byteLength).toBeGreaterThan(0);
    expect(
      recordCanvasLoro(
        'doc-1',
        {
          nodes: [
            { id: 'a' },
            { id: 'b', kind: 'new' },
          ],
          edges: [],
        },
        { snapshot: live! }
      )
    ).toBeTruthy();
    const ids = (peekCanvasLoro('doc-1')?.nodes ?? []).map(
      (n) => (n as { id: string }).id
    );
    expect(ids).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('applies the initial remote snapshot into an empty local WAL', async () => {
    const snapshot = encodeCanvasLoroUpdate(
      { nodes: [{ id: 'remote-a' }, { id: 'remote-b' }], edges: [] },
      1n
    );
    expect(peekCanvasLoro('doc-empty-wal')).toBeNull();
    const fake = fakeSource('doc-empty-wal');
    const ok = await connectCanvasLiveSync({
      documentId: 'doc-empty-wal',
      source: fake.source,
      doInitialSync: async () => ({ snapshot }),
    });
    expect(ok).toBe(true);
    const ids = (peekCanvasLoro('doc-empty-wal')?.nodes ?? []).map(
      (n) => (n as { id: string }).id
    );
    expect(ids).toEqual(expect.arrayContaining(['remote-a', 'remote-b']));
  });


  it('does not re-initialize a canvas that already has a snapshot', async () => {
    const result = await seedMissingCanvasSnapshot({
      documentId: 'doc-ready',
      board: { nodes: [{ id: 'a' }], edges: [] },
      api: {
        exists: async () => true,
        initialize: async () => {
          throw new Error('should not initialize');
        },
      },
    });
    expect(result).toBe('exists');
  });
});

describe('canvas live WS awareness', () => {
  const snapshot = encodeCanvasLoroUpdate(
    { nodes: [{ id: 'a' }], edges: [] },
    1n
  );

  it('does not publish presence before the session is connected', () => {
    expect(
      publishCanvasPresence('doc-1', {
        userId: 'me',
        name: 'Me',
        color: 'blue',
        x: 1,
        y: 2,
      })
    ).toBe(false);
  });

  it('pushes local presence over the existing WS after initial sync', async () => {
    const fake = fakeSource('doc-1');
    await connectCanvasLiveSync({
      documentId: 'doc-1',
      source: fake.source,
      doInitialSync: async () => ({ snapshot }),
    });
    expect(
      publishCanvasPresence('doc-1', {
        userId: 'me',
        name: 'Me',
        color: 'blue',
        x: 10,
        y: 20,
      })
    ).toBe(true);
    expect(fake.awareness).toHaveLength(1);
    expect(fake.pushed).toHaveLength(0);
    expect(listCanvasPresence('doc-1')).toEqual([]);
  });

  it('loads peers from the initial awareness snapshot', async () => {
    const remote = createCanvasPresenceStore();
    remote.set('peer-b', {
      userId: 'them',
      name: 'Them',
      color: 'green',
      x: 3,
      y: 4,
    });
    const fake = fakeSource('doc-1');
    await connectCanvasLiveSync({
      documentId: 'doc-1',
      source: fake.source,
      doInitialSync: async () => ({
        snapshot,
        awareness: remote.encode('peer-b'),
      }),
    });
    expect(listCanvasPresence('doc-1').map((p) => p.userId)).toEqual(['them']);
  });

  it('applies a remote awareness event without touching the board', async () => {
    const fake = fakeSource('doc-1');
    const boards: unknown[] = [];
    await connectCanvasLiveSync({
      documentId: 'doc-1',
      source: fake.source,
      doInitialSync: async () => ({ snapshot }),
      onRemoteBoard: (board) => boards.push(board),
    });
    const painted = boards.length;
    expect(painted).toBeGreaterThan(0);
    const remote = createCanvasPresenceStore();
    remote.set('peer-b', {
      userId: 'them',
      name: 'Them',
      color: 'green',
      x: 8,
      y: 9,
    });
    fake.emit({ type: 'awareness', awareness: remote.encode('peer-b') });
    expect(boards).toHaveLength(painted);
    expect(listCanvasPresence('doc-1')).toEqual([
      {
        peerId: 'peer-b',
        userId: 'them',
        name: 'Them',
        color: 'green',
        x: 8,
        y: 9,
      },
    ]);
  });
});

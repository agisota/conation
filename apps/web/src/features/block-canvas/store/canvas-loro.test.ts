/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  applyCanvasOps,
  applyCanvasOpsToDoc,
  boardFromDoc,
  clearAllCanvasLoro,
  encodeCanvasLoroDiff,
  mergeCanvasBoards,
  mergeCanvasLoroUpdates,
  opsFromBoardDiff,
  peekCanvasLoro,
  recordCanvasLoro,
  snapshotFromJson,
} from './canvas-loro';
import { LoroDoc } from 'loro-crdt';

afterEach(() => {
  clearAllCanvasLoro();
});

describe('canvas Loro persist', () => {
  it('keeps nodes added by two peers', () => {
    const merged = mergeCanvasBoards(
      { nodes: [{ id: 'a', kind: 'rect' }], edges: [] },
      { nodes: [{ id: 'b', kind: 'ellipse' }], edges: [] }
    );
    const ids = (merged.nodes ?? []).map((n) => (n as { id: string }).id);
    expect(ids).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('encodes a snapshot that round-trips board ids', () => {
    const snapshot = snapshotFromJson({
      nodes: [{ id: 'n1' }],
      edges: [],
    });
    expect(snapshot.byteLength).toBeGreaterThan(0);
    const doc = new LoroDoc();
    doc.import(snapshot);
    const ids = (boardFromDoc(doc).nodes ?? []).map(
      (n) => (n as { id: string }).id
    );
    expect(ids).toEqual(['n1']);
  });

  it('replays persisted updates for a document', () => {
    expect(
      recordCanvasLoro('doc-1', { nodes: [{ id: 'a' }], edges: [] })
    ).toBeTruthy();
    expect(
      recordCanvasLoro('doc-1', {
        nodes: [{ id: 'a' }, { id: 'b' }],
        edges: [],
      })
    ).toBeTruthy();
    const peeked = peekCanvasLoro('doc-1');
    const ids = (peeked?.nodes ?? []).map((n) => (n as { id: string }).id);
    expect(ids).toEqual(expect.arrayContaining(['a', 'b']));
  });
});


describe('canvas node-level ops', () => {
  it('upserts, moves, patches, and deletes without replacing the board', () => {
    const next = applyCanvasOps(
      {
        nodes: [{ id: 'a', kind: 'rect', x: 0, y: 0 }],
        edges: [],
      },
      [
        { op: 'upsertNode', node: { id: 'b', kind: 'ellipse', x: 1, y: 2 } },
        { op: 'moveNode', id: 'a', x: 10, y: 20 },
        { op: 'updateNode', id: 'a', patch: { kind: 'diamond' } },
        { op: 'upsertEdge', edge: { id: 'e1', from: 'a', to: 'b' } },
      ]
    );
    const nodes = (next.nodes ?? []) as Array<Record<string, unknown>>;
    expect(nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(nodes[0]).toMatchObject({ id: 'a', x: 10, y: 20, kind: 'diamond' });
    expect(next.edges).toEqual([{ id: 'e1', from: 'a', to: 'b' }]);

    const deleted = applyCanvasOps(next, [
      { op: 'deleteNode', id: 'b' },
      { op: 'deleteEdge', id: 'e1' },
    ]);
    expect((deleted.nodes ?? []).map((n) => (n as { id: string }).id)).toEqual([
      'a',
    ]);
    expect(deleted.edges).toEqual([]);
  });
});


describe('canvas editor incremental save', () => {
  it('diffs only dirty nodes and edges', () => {
    const ops = opsFromBoardDiff(
      {
        nodes: [
          { id: 'a', kind: 'keep' },
          { id: 'b', kind: 'old' },
        ],
        edges: [{ id: 'e1', from: 'a', to: 'b' }],
      },
      {
        nodes: [
          { id: 'a', kind: 'keep' },
          { id: 'b', kind: 'new' },
        ],
        edges: [],
      }
    );
    expect(ops).toEqual([
      { op: 'upsertNode', node: { id: 'b', kind: 'new' } },
      { op: 'deleteEdge', id: 'e1' },
    ]);
  });

  it('does not rewrite an untouched node when the editor save lands last', () => {
    const base = {
      nodes: [
        { id: 'a', kind: 'keep' },
        { id: 'b', kind: 'old' },
      ],
      edges: [] as unknown[],
    };
    const snap = snapshotFromJson(base);
    const editor = encodeCanvasLoroDiff(
      [snap],
      {
        nodes: [
          { id: 'a', kind: 'keep' },
          { id: 'b', kind: 'new' },
        ],
        edges: [],
      },
      1n
    );
    const peerDoc = new LoroDoc();
    peerDoc.setPeerId(2n);
    peerDoc.import(snap);
    const from = peerDoc.version();
    applyCanvasOpsToDoc(peerDoc, [
      { op: 'updateNode', id: 'a', patch: { kind: 'remote' } },
    ]);
    peerDoc.commit();
    const peer = peerDoc.export({ mode: 'update', from });
    const merged = mergeCanvasLoroUpdates([snap, peer, editor]);
    const nodes = (merged.nodes ?? []) as Array<Record<string, unknown>>;
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    expect(byId.a).toMatchObject({ id: 'a', kind: 'remote' });
    expect(byId.b).toMatchObject({ id: 'b', kind: 'new' });
  });

  it('records a later editor save as ops onto the WAL', () => {
    recordCanvasLoro('doc-1', {
      nodes: [
        { id: 'a', kind: 'keep' },
        { id: 'b', kind: 'old' },
      ],
      edges: [],
    });
    expect(
      recordCanvasLoro('doc-1', {
        nodes: [
          { id: 'a', kind: 'keep' },
          { id: 'b', kind: 'new' },
        ],
        edges: [],
      })
    ).toBeTruthy();
    const peeked = peekCanvasLoro('doc-1');
    const nodes = (peeked?.nodes ?? []) as Array<Record<string, unknown>>;
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    expect(byId.a).toMatchObject({ id: 'a', kind: 'keep' });
    expect(byId.b).toMatchObject({ id: 'b', kind: 'new' });
  });
});

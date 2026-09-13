/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  applyCanvasOps,
  boardFromDoc,
  clearAllCanvasLoro,
  mergeCanvasBoards,
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

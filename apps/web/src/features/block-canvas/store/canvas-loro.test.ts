/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
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

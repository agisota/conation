/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  clearAllCanvasLoro,
  mergeCanvasBoards,
  peekCanvasLoro,
  recordCanvasLoro,
} from './canvas-loro';

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

  it('replays persisted updates for a document', () => {
    expect(
      recordCanvasLoro('doc-1', { nodes: [{ id: 'a' }], edges: [] })
    ).toBe(true);
    expect(
      recordCanvasLoro('doc-1', { nodes: [{ id: 'b' }], edges: [] })
    ).toBe(true);
    const peeked = peekCanvasLoro('doc-1');
    const ids = (peeked?.nodes ?? []).map((n) => (n as { id: string }).id);
    expect(ids).toEqual(expect.arrayContaining(['a', 'b']));
  });
});

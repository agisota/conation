/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  clearAllOfflineCanvases,
  clearOfflineCanvas,
  listOfflineCanvasIds,
  peekOfflineCanvas,
  recordOfflineCanvas,
} from './offline-canvas';

afterEach(() => {
  clearAllOfflineCanvases();
});

describe('offline canvas snapshots', () => {
  it('keeps board JSON when DSS save cannot reach the server', () => {
    const json = { nodes: [{ id: 'n1' }], edges: [] };
    expect(recordOfflineCanvas('doc-1', json)).toBe(true);
    expect(peekOfflineCanvas('doc-1')).toEqual(json);
    expect(listOfflineCanvasIds()).toEqual(['doc-1']);
  });

  it('clears a board after a successful flush', () => {
    recordOfflineCanvas('doc-1', { nodes: [], edges: [] });
    clearOfflineCanvas('doc-1');
    expect(peekOfflineCanvas('doc-1')).toBeNull();
    expect(listOfflineCanvasIds()).toEqual([]);
  });
});

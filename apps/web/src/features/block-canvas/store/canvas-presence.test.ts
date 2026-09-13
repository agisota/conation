/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import {
  canvasPointToOverlayStyle,
  canvasPresenceHex,
  createCanvasPresenceStore,
} from './canvas-presence';

describe('canvas presence store', () => {
  it('round-trips a peer over encoded awareness bytes', () => {
    const a = createCanvasPresenceStore();
    const b = createCanvasPresenceStore();
    a.set('peer-a', {
      userId: 'user-1',
      name: 'Ada',
      color: 'red',
      x: 12,
      y: 34,
    });
    b.apply(a.encode('peer-a'));
    expect(b.list()).toEqual([
      {
        peerId: 'peer-a',
        userId: 'user-1',
        name: 'Ada',
        color: 'red',
        x: 12,
        y: 34,
      },
    ]);
  });

  it('lists every remote peer and can exclude the local one', () => {
    const store = createCanvasPresenceStore();
    store.set('local', {
      userId: 'me',
      name: 'Me',
      color: 'blue',
      x: 0,
      y: 0,
    });
    store.set('remote', {
      userId: 'them',
      name: 'Them',
      color: 'green',
      x: 8,
      y: 9,
    });
    expect(store.list('local').map((p) => p.peerId)).toEqual(['remote']);
    expect(store.list().map((p) => p.peerId).sort()).toEqual([
      'local',
      'remote',
    ]);
  });

  it('drops a peer after a tombstone awareness update', () => {
    const a = createCanvasPresenceStore();
    const b = createCanvasPresenceStore();
    a.set('peer-a', {
      userId: 'user-1',
      name: 'Ada',
      color: 'red',
      x: 1,
      y: 1,
    });
    b.apply(a.encode('peer-a'));
    expect(b.list()).toHaveLength(1);
    a.clear('peer-a');
    b.apply(a.encode('peer-a'));
    expect(b.list()).toEqual([]);
  });
});

describe('canvas presence overlay math', () => {
  it('places the origin at the viewport center', () => {
    expect(
      canvasPointToOverlayStyle(0, 0, {
        x: 0,
        y: 0,
        scale: 1,
        width: 100,
        height: 80,
      })
    ).toEqual({ left: '50px', top: '40px' });
  });

  it('maps a hashed palette name to a hex color', () => {
    expect(canvasPresenceHex('purple')).toMatch(/^#/);
    expect(canvasPresenceHex('not-a-color')).toBe(canvasPresenceHex('blue'));
  });
});

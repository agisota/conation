import { createRoot } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTabLeaderSignal } from '../tab-leader';

describe('createTabLeaderSignal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('treats this tab as leader when Web Locks are unavailable', () => {
    vi.stubGlobal('navigator', { locks: undefined });
    const isLeader = createRoot(() => createTabLeaderSignal('notification-provider'));
    expect(isLeader()).toBe(true);
  });
});

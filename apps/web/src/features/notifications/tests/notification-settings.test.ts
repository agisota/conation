import { createRoot, createSignal } from 'solid-js';
import { afterEach, describe, expect, it } from 'vitest';
import { createPersistedDismissed } from '../notification-settings';

describe('createPersistedDismissed', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('starts undismissed when nothing is stored', () => {
    createRoot((dispose) => {
      const [userId] = createSignal('user-1');
      const [isDismissed] = createPersistedDismissed(userId);
      expect(isDismissed()).toBe(false);
      dispose();
    });
  });

  it('hides for the rest of the session after dismiss', () => {
    createRoot((dispose) => {
      const [userId] = createSignal('user-1');
      const [isDismissed, dismiss] = createPersistedDismissed(userId);
      dismiss();
      expect(isDismissed()).toBe(true);
      dispose();
    });
  });

  it('persists dismiss per user so a reload does not re-show', () => {
    createRoot((dispose) => {
      const [userId] = createSignal('user-1');
      const [, dismiss] = createPersistedDismissed(userId);
      dismiss();
      dispose();
    });

    createRoot((dispose) => {
      const [userId] = createSignal('user-1');
      const [isDismissed] = createPersistedDismissed(userId);
      expect(isDismissed()).toBe(true);
      dispose();
    });
  });

  it('does not leak dismiss across users', () => {
    createRoot((dispose) => {
      const [userId] = createSignal('user-1');
      const [, dismiss] = createPersistedDismissed(userId);
      dismiss();
      dispose();
    });

    createRoot((dispose) => {
      const [userId] = createSignal('user-2');
      const [isDismissed] = createPersistedDismissed(userId);
      expect(isDismissed()).toBe(false);
      dispose();
    });
  });

  it('still hides in-session when the user id is not yet known', () => {
    createRoot((dispose) => {
      const [userId] = createSignal<string | undefined>(undefined);
      const [isDismissed, dismiss] = createPersistedDismissed(userId);
      dismiss();
      expect(isDismissed()).toBe(true);
      dispose();
    });
  });
});

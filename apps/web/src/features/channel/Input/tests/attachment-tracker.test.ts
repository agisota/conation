/**
 * @vitest-environment jsdom
 */

import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { createInputAttachmentTracker } from '../attachment-tracker';

function createStorageRealm(backing: Map<string, string>): Storage {
  return {
    get length() {
      return backing.size;
    },
    clear() {
      backing.clear();
    },
    getItem(key) {
      return backing.get(key) ?? null;
    },
    key(index) {
      return [...backing.keys()][index] ?? null;
    },
    removeItem(key) {
      backing.delete(key);
    },
    setItem(key, value) {
      backing.set(key, String(value));
    },
  };
}

describe('input attachment tracker', () => {
  it('deduplicates by id and tracks pending state', () => {
    createRoot((dispose) => {
      const tracker = createInputAttachmentTracker();

      tracker.addAttachment({ id: 'a1', kind: 'image', name: 'a.png' });
      tracker.addAttachment({ id: 'a1', kind: 'image', name: 'a.png' });
      expect(tracker.attachments()).toHaveLength(1);

      tracker.setAttachmentPending('a1', true);
      expect(tracker.hasPending()).toBe(true);

      tracker.setAttachmentPending('a1', false);
      expect(tracker.hasPending()).toBe(false);

      dispose();
    });
  });

  it('supports explicit add/remove operations', () => {
    createRoot((dispose) => {
      const tracker = createInputAttachmentTracker();

      tracker.addAttachment({ id: 'a1', kind: 'document', name: 'spec.md' });
      expect(tracker.attachments()).toHaveLength(1);

      tracker.removeAttachment('a1');

      expect(tracker.attachments()).toHaveLength(0);
      dispose();
    });
  });

  it('merges attachment writes from independent trackers sharing persisted state', () => {
    const backing = new Map<string, string>();
    const firstTracker = createInputAttachmentTracker({
      persistenceKey: 'shared-draft',
      persistenceStorage: createStorageRealm(backing),
    });
    const secondTracker = createInputAttachmentTracker({
      persistenceKey: 'shared-draft',
      persistenceStorage: createStorageRealm(backing),
    });

    firstTracker.addAttachment({
      id: 'first',
      kind: 'document',
      name: 'first.txt',
    });
    secondTracker.addAttachment({
      id: 'second',
      kind: 'document',
      name: 'second.txt',
    });

    const restoredTracker = createInputAttachmentTracker({
      persistenceKey: 'shared-draft',
      persistenceStorage: createStorageRealm(backing),
    });
    expect(restoredTracker.attachments().map(({ id }) => id)).toEqual([
      'first',
      'second',
    ]);
    expect(firstTracker.attachments().map(({ id }) => id)).toEqual([
      'first',
      'second',
    ]);
  });
});

/**
 * @vitest-environment jsdom
 */

import { createInputAttachmentTracker } from '@channel/Input/attachment-tracker';
import { createRoot } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPersistedComposerDraft,
  createSafeLocalStorage,
  newConversationAttachmentsKey,
  newConversationDraftKey,
} from './composer-draft';

describe('new conversation persistence', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('rehydrates drafts across owners only under each owner’s own key', () => {
    createRoot((dispose) => {
      createPersistedComposerDraft(newConversationDraftKey('alice')).setDraft(
        'Alice draft'
      );
      createPersistedComposerDraft(newConversationDraftKey('bob')).setDraft(
        'Bob draft'
      );
      dispose();
    });

    createRoot((dispose) => {
      expect(
        createPersistedComposerDraft(newConversationDraftKey('alice')).draft()
      ).toBe('Alice draft');
      expect(
        createPersistedComposerDraft(newConversationDraftKey('bob')).draft()
      ).toBe('Bob draft');
      dispose();
    });
    expect(newConversationDraftKey('alice')).not.toBe(
      newConversationDraftKey('bob')
    );
    expect(newConversationAttachmentsKey('alice')).not.toBe(
      newConversationAttachmentsKey('bob')
    );
  });
  it('removes the saved draft when cleared', () => {
    createRoot((dispose) => {
      const draft = createPersistedComposerDraft(
        newConversationDraftKey('alice')
      );
      draft.setDraft('Saved draft');
      draft.setDraft('');
      dispose();
    });

    createRoot((dispose) => {
      expect(
        createPersistedComposerDraft(newConversationDraftKey('alice')).draft()
      ).toBe('');
      dispose();
    });
  });

  it('keeps editing available when localStorage reads and writes throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    createRoot((dispose) => {
      const draft = createPersistedComposerDraft(
        newConversationDraftKey('alice')
      );
      expect(draft.draft()).toBe('');
      expect(() => draft.setDraft('Still editable')).not.toThrow();
      expect(draft.draft()).toBe('Still editable');

      const storage = createSafeLocalStorage([
        newConversationAttachmentsKey('alice'),
      ]);
      const tracker = createInputAttachmentTracker({
        persistenceKey: newConversationAttachmentsKey('alice'),
        persistenceStorage: storage,
      });
      expect(() =>
        tracker.addAttachment({
          id: 'file-1',
          kind: 'document',
          name: 'notes.txt',
        })
      ).not.toThrow();
      expect(tracker.attachments()).toEqual([
        { id: 'file-1', kind: 'document', name: 'notes.txt' },
      ]);
      dispose();
    });
  });

  it('uses an in-memory draft when no authenticated owner is available', () => {
    createRoot((dispose) => {
      const draft = createPersistedComposerDraft();
      draft.setDraft('Private to this mount');
      expect(draft.draft()).toBe('Private to this mount');
      dispose();
    });
    expect(localStorage.length).toBe(0);
  });

  it('clears only keys owned by its scoped adapter', () => {
    const draftKey = newConversationDraftKey('alice');
    localStorage.setItem(draftKey, 'draft');
    localStorage.setItem('unrelated-state', 'keep');
    const storage = createSafeLocalStorage([draftKey]);

    expect(storage.length).toBe(1);
    expect(storage.key(0)).toBe(draftKey);
    storage.clear();
    expect(localStorage.getItem(draftKey)).toBeNull();
    expect(localStorage.getItem('unrelated-state')).toBe('keep');
  });

  it('treats scoped storage cleanup failures as non-fatal', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    const storage = createSafeLocalStorage([newConversationDraftKey('alice')]);
    expect(() => storage.clear()).not.toThrow();
  });
});

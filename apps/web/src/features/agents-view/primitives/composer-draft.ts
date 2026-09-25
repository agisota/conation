import { createPersistenceKey } from '@queries/persistence';
import { makePersisted } from '@solid-primitives/storage';
import { createSignal } from 'solid-js';

/** Same localStorage projection channel composers use for unsent drafts. */
export function newConversationDraftKey(userId: string): string {
  return createPersistenceKey(
    `input-value-agents-new-conversation-user:${encodeURIComponent(userId)}`,
    0
  );
}

export function newConversationAttachmentsKey(userId: string): string {
  return createPersistenceKey(
    `attachment-tracker-agents-new-conversation-user:${encodeURIComponent(userId)}`,
    0
  );
}

/** Create a failure-safe Storage adapter limited to the supplied owned keys. */
export function createSafeLocalStorage(keys: readonly string[]): Storage {
  const scopedKeys = [...keys];
  const ownedKeys = new Set(scopedKeys);
  const getItem = (key: string) => {
    if (!ownedKeys.has(key)) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const removeItem = (key: string) => {
    if (!ownedKeys.has(key)) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Persistence is optional; keep editing available when storage is blocked.
    }
  };

  return {
    get length() {
      return scopedKeys.reduce(
        (count, key) => count + Number(getItem(key) !== null),
        0
      );
    },
    clear() {
      for (const key of scopedKeys) removeItem(key);
    },
    getItem,
    key(index) {
      if (index < 0) return null;
      const presentKeys = scopedKeys.filter((key) => getItem(key) !== null);
      return presentKeys[index] ?? null;
    },
    removeItem,
    setItem(key, value) {
      if (!ownedKeys.has(key)) return;
      try {
        localStorage.setItem(key, value);
      } catch {
        // Persistence is optional; keep editing available when storage is blocked.
      }
    },
  };
}

/** Keep a composer draft after the New conversation page remounts. */
export function createPersistedComposerDraft(name?: string, storage?: Storage) {
  const raw = createSignal<string | undefined>(undefined);
  const [persisted, setPersisted] = name
    ? makePersisted(raw, {
        name,
        storage: storage ?? createSafeLocalStorage([name]),
      })
    : raw;
  return {
    draft: () => persisted() ?? '',
    setDraft: (value: string) => setPersisted(value || undefined),
  };
}

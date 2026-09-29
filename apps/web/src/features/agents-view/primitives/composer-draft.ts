import { createPersistenceKey } from '@queries/persistence';
import { makePersisted } from '@solid-primitives/storage';
import { createSignal } from 'solid-js';

/** Same localStorage projection channel composers use for unsent drafts. */
export const NEW_CONVERSATION_DRAFT_KEY = createPersistenceKey(
  'input-value-agents-new-conversation',
  0
);

/** Home owns its draft separately from the Agents page's New conversation. */
export const HOME_CONVERSATION_DRAFT_KEY = createPersistenceKey(
  'input-value-home-agent-conversation',
  0
);

export const NEW_CONVERSATION_ATTACHMENTS_KEY = createPersistenceKey(
  'attachment-tracker-agents-new-conversation',
  0
);

/** Derive a composer storage key scoped to the current account. */
export function createAccountScopedComposerKey(
  name: string,
  userId: string | undefined
): string | undefined {
  return userId ? `${name}-user-${encodeURIComponent(userId)}` : undefined;
}

export function createPersistedComposerDraft(
  name = NEW_CONVERSATION_DRAFT_KEY,
  userId?: string | null
) {
  const raw = createSignal<string | undefined>(undefined);
  const persistenceKey =
    userId === undefined
      ? name
      : createAccountScopedComposerKey(name, userId ?? undefined);
  const [persisted, setPersisted] = persistenceKey
    ? makePersisted(raw, { name: persistenceKey })
    : raw;
  return {
    draft: () => persisted() ?? '',
    setDraft: (value: string) => setPersisted(value || undefined),
  };
}

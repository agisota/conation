import { makePersisted } from '@solid-primitives/storage';
import { createSignal } from 'solid-js';

/**
 * Global "show link previews" preference (Settings → Appearance → Interface).
 * Persisted to localStorage so the preference survives reloads.
 */
export const [showLinkPreviews, setShowLinkPreviews] = makePersisted(
  createSignal<boolean>(true),
  { name: 'channel.showLinkPreviews' }
);

/** Cap so a long-lived client can't grow the hidden list unboundedly. */
const MAX_HIDDEN_ENTRIES = 500;

/**
 * Newest-last message ids whose previews were hidden on this client. Acts as
 * the optimistic layer for the sender's server-side "remove preview".
 */
const [hiddenPreviews, setHiddenPreviews] = makePersisted(
  createSignal<string[]>([]),
  { name: 'channel.hiddenLinkPreviews' }
);

/** Whether this message's previews were hidden on this client (reactive). */
export function isLinkPreviewHidden(messageId: string): boolean {
  return hiddenPreviews().includes(messageId);
}

/** Hides a message's link previews locally, ahead of server confirmation. */
export function hideLinkPreview(messageId: string): void {
  setHiddenPreviews((prev) =>
    [...prev.filter((entry) => entry !== messageId), messageId].slice(
      -MAX_HIDDEN_ENTRIES
    )
  );
}

/** Undo a local hide (rollback when the server-side removal fails). */
export function unhideLinkPreview(messageId: string): void {
  setHiddenPreviews((prev) => prev.filter((entry) => entry !== messageId));
}

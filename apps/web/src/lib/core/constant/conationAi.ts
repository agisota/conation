/**
 * Identity for the first-party Conation AI system bot. Mirrors
 * `bot_id::CONATION_AI_BOT_ID` on the backend. Conation is a global system
 * bot available in every channel; mentioning it triggers an AI reply in a
 * thread.
 */
export const CONATION_AI_BOT_ID = '00000000-0000-0000-0000-00000000a1a1';

/**
 * Canonical principal id for Conation, matching the `bot|<uuid>` form used for
 * bot senders and participants everywhere else.
 */
export const CONATION_AI_PRINCIPAL_ID = `bot|${CONATION_AI_BOT_ID}`;

/** Display name for the Conation AI system bot. */
export const CONATION_AI_NAME = 'Conation';

/** Canonical handle used to find Conation in the mention typeahead. */
export const CONATION_AI_HANDLE = 'conation';

/**
 * Whether an id refers to the Conation AI bot. Accepts both the bare UUID and
 * the `bot|<uuid>` participant/sender representation used by API surfaces.
 */
export function isConationAiId(id: string | undefined): boolean {
  if (!id) return false;
  const bare = id.startsWith('bot|') ? id.slice('bot|'.length) : id;
  return bare === CONATION_AI_BOT_ID;
}

/** Whether an id is a namespaced bot principal or the Conation AI bot UUID. */
export function isBotPrincipalId(id: string | undefined): boolean {
  return id?.startsWith('bot|') === true || isConationAiId(id);
}

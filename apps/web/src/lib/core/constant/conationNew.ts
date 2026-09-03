/**
 * Identity for the next-generation Conation system bot. Mirrors
 * `bot_id::CONATION_NEW_BOT_ID` on the backend. Deliberately distinct from the
 * classic assistant: the classic assistant answers in chat, while Conation
 * (new) opens an agent session on the in-process runtime.
 */
export const CONATION_NEW_BOT_ID = '00000000-0000-0000-0000-00000000a2a2';

/** Canonical principal id for Conation (new). */
export const CONATION_NEW_PRINCIPAL_ID = `bot|${CONATION_NEW_BOT_ID}`;

/** Display name for the next-generation Conation bot. */
export const CONATION_NEW_NAME = 'Conation (new)';

/** Handle used to find Conation (new) in the mention typeahead. */
export const CONATION_NEW_HANDLE = 'conation-new';

/** Whether an id refers to Conation (new). */
export function isConationNewId(id: string | undefined): boolean {
  if (!id) return false;
  const bare = id.startsWith('bot|') ? id.slice('bot|'.length) : id;
  return bare === CONATION_NEW_BOT_ID;
}

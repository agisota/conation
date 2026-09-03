/**
 * Identity for the first-party Conation Coder system bot. Mirrors
 * `bot_id::CONATION_CODER_BOT_ID` on the backend. It is distinct from the
 * general Conation assistant because it opens a sandboxed coding-agent
 * session.
 */
export const CONATION_CODER_BOT_ID = '00000000-0000-0000-0000-00000000a9e7';

/** Canonical principal id for Conation Coder. */
export const CONATION_CODER_PRINCIPAL_ID = `bot|${CONATION_CODER_BOT_ID}`;

/** Display name for Conation Coder. */
export const CONATION_CODER_NAME = 'Conation Coder';

/** Handle used to find Conation Coder in the mention typeahead. */
export const CONATION_CODER_HANDLE = 'coder';

/** Whether an id refers to Conation Coder. */
export function isConationCoderId(id: string | undefined): boolean {
  if (!id) return false;
  const bare = id.startsWith('bot|') ? id.slice('bot|'.length) : id;
  return bare === CONATION_CODER_BOT_ID;
}

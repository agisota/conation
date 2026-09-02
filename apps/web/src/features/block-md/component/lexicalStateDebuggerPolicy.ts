/**
 * Build-time policy for the editor-state debugger.
 *
 * The debugger exposes complete editor JSON and can import it into the live
 * editor, so it is a diagnostic tool rather than a user entitlement. It stays
 * available during local/development work, while a production operator must
 * deliberately opt in through `VITE_ENABLE_LEXICAL_STATE_DEBUGGER=true`.
 */
export function isLexicalStateDebuggerEnabled(input: {
  localOnly: boolean;
  development: boolean;
  operatorOverride: boolean | undefined;
}): boolean {
  return input.operatorOverride ?? (input.localOnly || input.development);
}

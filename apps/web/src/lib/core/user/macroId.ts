/**
 * Branded type for MacroId strings.
 * Format: `conation|email@domain.com`
 */
declare const MacroIdBrand: unique symbol;
export type MacroId = string & { readonly [MacroIdBrand]: never };

const CONATION_ID_PREFIX = 'conation|';

/**
 * Type guard to check if a string is a valid MacroId.
 */
function isMacroId(str: string): str is MacroId {
  return (
    str.startsWith(CONATION_ID_PREFIX) &&
    str.slice(CONATION_ID_PREFIX.length).includes('@')
  );
}

/**
 * Attempts to parse a string as a MacroId.
 * Returns the MacroId if valid, undefined otherwise.
 */
export function tryMacroId(str: string): MacroId | undefined {
  return isMacroId(str) ? str : undefined;
}

/**
 * Extracts the email from a MacroId.
 */
export function macroIdToEmail(id: MacroId): string {
  return id.slice(CONATION_ID_PREFIX.length);
}

/**
 * Creates a MacroId from an email address.
 * Returns undefined if the email is invalid.
 */
export function emailToMacroId(email: string): MacroId | undefined {
  if (!email.includes('@')) {
    return undefined;
  }
  return `${CONATION_ID_PREFIX}${email}` as MacroId;
}

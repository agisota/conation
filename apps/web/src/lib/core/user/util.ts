import { getDisplayName } from './displayName';
import { emailToMacroId, macroIdToEmail, tryMacroId } from './macroId';
import type { IUser } from './types';

// TODO: consolidate idToEmail, see idToEmail in email.ts
/**
 * Converts a user id to an email address.
 * @deprecated Use `macroIdToEmail` with a validated `MacroId` instead.
 */
export function idToEmail(id: string): string {
  const userId = tryMacroId(id);
  return userId ? macroIdToEmail(userId) : id;
}

/**
 * Converts an email address to a user id.
 * @deprecated Use `emailToMacroId` instead for type-safe MacroId creation.
 */
export function emailToId(email: string): string {
  return emailToMacroId(email) ?? email;
}

export function idToDisplayName(id: string): string {
  return getDisplayName(tryMacroId(id), {
    emailFallback: 'local-part',
  });
}

export function channelParticipantInfo(participant: {
  user_id: string;
}): IUser {
  const id = participant.user_id;
  return {
    id,
    email: idToEmail(id),
    name: idToDisplayName(id),
  };
}

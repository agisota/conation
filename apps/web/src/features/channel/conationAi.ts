import {
  CONATION_AI_NAME,
  CONATION_AI_PRINCIPAL_ID,
} from '@core/constant/conationAi';
import {
  CONATION_CODER_NAME,
  CONATION_CODER_PRINCIPAL_ID,
} from '@core/constant/conationCoder';
import {
  CONATION_NEW_NAME,
  CONATION_NEW_PRINCIPAL_ID,
} from '@core/constant/conationNew';
import {
  CURSOR_BOT_NAME,
  CURSOR_BOT_PRINCIPAL_ID,
} from '@core/constant/cursorAgent';
import type { IUser } from '@core/user/types';

export {
  CONATION_AI_BOT_ID,
  CONATION_AI_HANDLE,
  CONATION_AI_NAME,
  CONATION_AI_PRINCIPAL_ID,
  isConationAiId,
} from '@core/constant/conationAi';
export { isConationCoderId } from '@core/constant/conationCoder';
export { isConationNewId } from '@core/constant/conationNew';

/** A synthetic mention user for the classic Conation assistant. */
export function conationAiMentionUser(): IUser {
  return {
    id: CONATION_AI_PRINCIPAL_ID,
    name: CONATION_AI_NAME,
    email: CONATION_AI_NAME,
  };
}

/** A synthetic mention user for Conation Coder. */
export function conationCoderMentionUser(): IUser {
  return {
    id: CONATION_CODER_PRINCIPAL_ID,
    name: CONATION_CODER_NAME,
    email: CONATION_CODER_NAME,
  };
}

/** A synthetic mention user for the in-process Conation agent. */
export function conationNewMentionUser(): IUser {
  return {
    id: CONATION_NEW_PRINCIPAL_ID,
    name: CONATION_NEW_NAME,
    email: CONATION_NEW_NAME,
  };
}

/** A synthetic mention user for the Cursor cloud-agent integration. */
export function cursorMentionUser(): IUser {
  return {
    id: CURSOR_BOT_PRINCIPAL_ID,
    name: CURSOR_BOT_NAME,
    email: CURSOR_BOT_NAME,
  };
}

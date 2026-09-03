import { describe, expect, it } from 'vitest';
import {
  CONATION_AI_BOT_ID,
  CONATION_AI_HANDLE,
  CONATION_AI_NAME,
  CONATION_AI_PRINCIPAL_ID,
  isConationAiId,
} from './conationAi';
import {
  CONATION_CODER_BOT_ID,
  CONATION_CODER_HANDLE,
  CONATION_CODER_NAME,
} from './conationCoder';
import {
  CONATION_NEW_BOT_ID,
  CONATION_NEW_HANDLE,
  CONATION_NEW_NAME,
} from './conationNew';

describe('first-party Conation bot identities', () => {
  it('uses Conation display names while retaining stable identifiers', () => {
    expect(CONATION_AI_NAME).toBe('Conation');
    expect(CONATION_CODER_NAME).toBe('Conation Coder');
    expect(CONATION_NEW_NAME).toBe('Conation (new)');

    expect(CONATION_AI_BOT_ID).toBe('00000000-0000-0000-0000-00000000a1a1');
    expect(CONATION_CODER_BOT_ID).toBe('00000000-0000-0000-0000-00000000a9e7');
    expect(CONATION_NEW_BOT_ID).toBe('00000000-0000-0000-0000-00000000a2a2');
    expect(CONATION_AI_HANDLE).toBe('conation');
    expect(CONATION_CODER_HANDLE).toBe('coder');
    expect(CONATION_NEW_HANDLE).toBe('conation-new');
  });

  it('recognizes bare and canonical bot ids returned by API surfaces', () => {
    expect(isConationAiId(CONATION_AI_BOT_ID)).toBe(true);
    expect(isConationAiId(CONATION_AI_PRINCIPAL_ID)).toBe(true);
  });
});

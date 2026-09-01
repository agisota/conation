import { describe, expect, it } from 'vitest';
import {
  isMacroAgentId,
  MACRO_AGENT_BOT_ID,
  MACRO_AGENT_HANDLE,
  MACRO_AGENT_NAME,
  MACRO_AGENT_PRINCIPAL_ID,
} from './macroAgent';
import {
  MACRO_CODER_BOT_ID,
  MACRO_CODER_HANDLE,
  MACRO_CODER_NAME,
} from './macroCoder';
import { MACRO_NEW_BOT_ID, MACRO_NEW_HANDLE, MACRO_NEW_NAME } from './macroNew';

describe('first-party bot compatibility', () => {
  it('uses Conation display names while retaining stable identifiers', () => {
    expect(MACRO_AGENT_NAME).toBe('Conation');
    expect(MACRO_CODER_NAME).toBe('Conation Coder');
    expect(MACRO_NEW_NAME).toBe('Conation (new)');

    expect(MACRO_AGENT_BOT_ID).toBe('00000000-0000-0000-0000-00000000a1a1');
    expect(MACRO_CODER_BOT_ID).toBe('00000000-0000-0000-0000-00000000a9e7');
    expect(MACRO_NEW_BOT_ID).toBe('00000000-0000-0000-0000-00000000a2a2');
    expect(MACRO_AGENT_HANDLE).toBe('macro');
    expect(MACRO_CODER_HANDLE).toBe('coder');
    expect(MACRO_NEW_HANDLE).toBe('macro-new');
  });

  it('continues to recognize historical bare and canonical bot ids', () => {
    expect(isMacroAgentId(MACRO_AGENT_BOT_ID)).toBe(true);
    expect(isMacroAgentId(MACRO_AGENT_PRINCIPAL_ID)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { emailToMacroId, macroIdToEmail, tryMacroId } from './macroId';

describe('Conation user ID contract', () => {
  it('round-trips the canonical conation namespace', () => {
    const id = emailToMacroId('pythia@conation.dev');

    expect(id).toBe('conation|pythia@conation.dev');
    expect(id && macroIdToEmail(id)).toBe('pythia@conation.dev');
  });

  it('does not accept the retired macro namespace', () => {
    expect(tryMacroId('macro|pythia@conation.dev')).toBeUndefined();
    expect(tryMacroId('conation|pythia@conation.dev')).toBe(
      'conation|pythia@conation.dev'
    );
  });
});

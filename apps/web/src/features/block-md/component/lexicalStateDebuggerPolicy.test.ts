import { describe, expect, it } from 'vitest';
import { isLexicalStateDebuggerEnabled } from './lexicalStateDebuggerPolicy';

describe('Lexical state debugger policy', () => {
  it('is disabled by default in a standalone production build', () => {
    expect(
      isLexicalStateDebuggerEnabled({
        localOnly: false,
        development: false,
        operatorOverride: undefined,
      })
    ).toBe(false);
  });

  it('is available while developing locally', () => {
    expect(
      isLexicalStateDebuggerEnabled({
        localOnly: true,
        development: false,
        operatorOverride: undefined,
      })
    ).toBe(true);
    expect(
      isLexicalStateDebuggerEnabled({
        localOnly: false,
        development: true,
        operatorOverride: undefined,
      })
    ).toBe(true);
  });

  it('requires an explicit operator flag to enable it in production', () => {
    expect(
      isLexicalStateDebuggerEnabled({
        localOnly: false,
        development: false,
        operatorOverride: true,
      })
    ).toBe(true);
  });

  it('honors an explicit operator disable even during development', () => {
    expect(
      isLexicalStateDebuggerEnabled({
        localOnly: true,
        development: true,
        operatorOverride: false,
      })
    ).toBe(false);
  });
});

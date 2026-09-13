import { describe, expect, it } from 'vitest';
import { leadingZeroBits, sha256Bytes, solveCounter } from './signup-antibot';

describe('signup antibot PoW', () => {
  it('counts leading zero bits and finds a difficulty-8 counter', () => {
    const nonce = 'abc';
    const counter = solveCounter(nonce, 8);
    const digest = sha256Bytes(`${nonce}:${counter}`);
    expect(leadingZeroBits(digest)).toBeGreaterThanOrEqual(8);
    expect(digest[0]).toBe(0);
  });
});

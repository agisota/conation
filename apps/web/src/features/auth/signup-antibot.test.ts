import { describe, expect, it } from 'vitest';
import {
  checkMailboxAvailable,
  leadingZeroBits,
  mailboxAvailabilityUrl,
  mailboxCreateLocalPart,
  peekSignupMailboxLocal,
  rememberSignupMailboxLocal,
  sha256Bytes,
  SIGNUP_MAILBOX_LOCAL_KEY,
  solveCounter,
} from './signup-antibot';

describe('signup antibot PoW', () => {
  it('counts leading zero bits and finds a difficulty-8 counter', () => {
    const nonce = 'abc';
    const counter = solveCounter(nonce, 8);
    const digest = sha256Bytes(`${nonce}:${counter}`);
    expect(leadingZeroBits(digest)).toBeGreaterThanOrEqual(8);
    expect(digest[0]).toBe(0);
  });
});

describe('signup mailbox local session', () => {
  it('remembers and peeks a trimmed local', () => {
    sessionStorage.removeItem(SIGNUP_MAILBOX_LOCAL_KEY);
    rememberSignupMailboxLocal('  alice  ');
    expect(peekSignupMailboxLocal()).toBe('alice');
    rememberSignupMailboxLocal('');
    expect(peekSignupMailboxLocal()).toBeUndefined();
  });

  it('does not invent a local for later create clicks', () => {
    sessionStorage.removeItem(SIGNUP_MAILBOX_LOCAL_KEY);
    expect(mailboxCreateLocalPart()).toBeUndefined();
    rememberSignupMailboxLocal('bob');
    expect(mailboxCreateLocalPart()).toBe('bob');
  });
});

describe('mailbox availability URL', () => {
  it('queries GET /email/mailbox/available?local=', () => {
    const url = mailboxAvailabilityUrl('Alice.Work');
    expect(url).toContain('/email/mailbox/available');
    expect(url).toContain('local=Alice.Work');
  });

  it('returns taken vs available from the JSON body', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          local: 'alice',
          mailbox: 'alice@conation.dev',
          available: false,
          suggestion: 'alice2',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as typeof fetch;
    await expect(checkMailboxAvailable('alice', fetchImpl)).resolves.toEqual({
      local: 'alice',
      mailbox: 'alice@conation.dev',
      available: false,
      suggestion: 'alice2',
    });
  });

  it('maps 400 to invalid', async () => {
    const fetchImpl = (async () => new Response('bad', { status: 400 })) as typeof fetch;
    await expect(checkMailboxAvailable('nope', fetchImpl)).rejects.toThrow(
      'invalid'
    );
  });
});

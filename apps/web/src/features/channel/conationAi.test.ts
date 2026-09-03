import { CONATION_CODER_PRINCIPAL_ID } from '@core/constant/conationCoder';
import { CONATION_NEW_PRINCIPAL_ID } from '@core/constant/conationNew';
import { describe, expect, it } from 'vitest';
import {
  applyConationAgentMentionPolicy,
  conationNewMentionUser,
} from './conationAi';

describe('applyConationAgentMentionPolicy', () => {
  it('offers Conation Coder without exposing the production-unavailable in-process agent', () => {
    const users = applyConationAgentMentionPolicy(
      [
        { id: 'user|a-user', name: 'A user', email: 'a@example.test' },
        conationNewMentionUser(),
      ],
      true
    );

    expect(users.map((user) => user.id)).toEqual([
      CONATION_CODER_PRINCIPAL_ID,
      'user|a-user',
    ]);
    expect(users.some((user) => user.id === CONATION_NEW_PRINCIPAL_ID)).toBe(
      false
    );
  });

  it('does not synthesize Conation Coder when coding agents are disabled', () => {
    const users = applyConationAgentMentionPolicy([], false);

    expect(users).toEqual([]);
  });
});

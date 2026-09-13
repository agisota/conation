/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';
import { TeamRole } from '@service-auth/generated/schemas/teamRole';
import {
  EMPTY_WORK_PROFILE_EXTRAS,
  loadWorkProfileExtras,
  resolveWorkProfileFromTeam,
  saveWorkProfileExtras,
} from './work-profile';

afterEach(() => {
  localStorage.clear();
});

describe('work profile extras', () => {
  it('round-trips extras per user and defaults missing rows', () => {
    expect(loadWorkProfileExtras('user-1')).toEqual(EMPTY_WORK_PROFILE_EXTRAS);
    expect(
      saveWorkProfileExtras('user-1', {
        ...EMPTY_WORK_PROFILE_EXTRAS,
        skills: 'rust, product',
        status: 'busy',
        emailVisible: false,
      })
    ).toBe(true);
    expect(loadWorkProfileExtras('user-1').skills).toBe('rust, product');
    expect(loadWorkProfileExtras('user-1').status).toBe('busy');
    expect(loadWorkProfileExtras('user-2')).toEqual(EMPTY_WORK_PROFILE_EXTRAS);
  });
});

describe('resolveWorkProfileFromTeam', () => {
  it('reads team name and membership role from the auth payload', () => {
    expect(resolveWorkProfileFromTeam('user-1', null)).toEqual({
      teamName: null,
      role: null,
    });
    expect(
      resolveWorkProfileFromTeam('user-1', {
        team: { name: 'Studio' },
        members: [{ user_id: 'user-1', role: TeamRole.admin }],
      } as never)
    ).toEqual({ teamName: 'Studio', role: TeamRole.admin });
  });
});

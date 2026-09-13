import { describe, expect, it } from 'vitest';
import type { RemoteParticipant, Room } from 'livekit-client';
import { buildOrderedInCallMembers } from './InCallPanel/members';
import {
  classifyCallParticipantIdentity,
  isStandingRoomEmpty,
  isStandingRoomWaiting,
  standingRoomEmptyJoinAllowed,
} from './join-channel-call';

function remote(
  identity: string,
  opts?: { isAgent?: boolean }
): RemoteParticipant {
  return {
    sid: `sid-${identity}`,
    identity,
    isAgent: opts?.isAgent ?? false,
  } as RemoteParticipant;
}

describe('standing rooms', () => {
  it('allows joining an empty LiveKit room', () => {
    expect(standingRoomEmptyJoinAllowed()).toBe(true);
  });

  it('classifies people, bots, and agents from LiveKit identity', () => {
    expect(classifyCallParticipantIdentity('conation|ada@example.com')).toBe(
      'person'
    );
    expect(classifyCallParticipantIdentity('bot:alerts')).toBe('bot');
    expect(
      classifyCallParticipantIdentity('agent:scribe', { isAgent: true })
    ).toBe('agent');
    expect(
      classifyCallParticipantIdentity('room-transcription-agent')
    ).toBe('agent');
  });

  it('treats a solo occupant as waiting for others', () => {
    expect(isStandingRoomWaiting(0)).toBe(true);
    expect(isStandingRoomWaiting(1)).toBe(true);
    expect(isStandingRoomWaiting(2)).toBe(false);
  });

  it('treats an unoccupied standing room as empty', () => {
    expect(isStandingRoomEmpty(0)).toBe(true);
    expect(isStandingRoomEmpty(1)).toBe(false);
  });
});

describe('in-call roster roles', () => {
  it('orders people, then bots, then agents and keeps isAgent remotes', () => {
    const room = {} as Room;
    const remotes = new Map<string, RemoteParticipant>([
      ['a', remote('agent:scribe', { isAgent: true })],
      ['b', remote('bot:alerts')],
      ['c', remote('conation|ada@example.com')],
    ]);
    const members = buildOrderedInCallMembers(room, remotes);
    expect(members.map((m) => m.role)).toEqual([
      'person',
      'person',
      'bot',
      'agent',
    ]);
    expect(members.filter((m) => m.kind === 'remote').map((m) => m.role)).toEqual(
      ['person', 'bot', 'agent']
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  classifyCallParticipantIdentity,
  isStandingRoomEmpty,
  isStandingRoomWaiting,
  standingRoomEmptyJoinAllowed,
} from './join-channel-call';

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

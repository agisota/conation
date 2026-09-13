import type { RemoteParticipant, Room } from 'livekit-client';
import {
  type CallParticipantKind,
  classifyCallParticipantIdentity,
} from '../join-channel-call';
import type { InCallPanelMember, InCallVisibleAvatarSlot } from './types';

const ROLE_ORDER: Record<CallParticipantKind, number> = {
  person: 0,
  bot: 1,
  agent: 2,
};

/** How many participant avatars show inline before the rest go in a dropdown. */
export const IN_CALL_PANEL_VISIBLE_AVATAR_COUNT = 3;

/** Non-slim panel: when there are more than this many people, show this many inline avatars plus the roster trigger. */
export const IN_CALL_PANEL_CROWDED_MEMBER_THRESHOLD = 5;
export const IN_CALL_PANEL_VISIBLE_AVATAR_COUNT_CROWDED = 4;

/**
 * Ordered list: local participant first, then people, bots, and agents.
 * Empty when there is no room yet (e.g. still connecting).
 */
export function buildOrderedInCallMembers(
  room: Room | null,
  remoteParticipants: Map<string, RemoteParticipant>
): InCallPanelMember[] {
  if (!room) return [];
  const remotes: InCallPanelMember[] = [...remoteParticipants.values()].map(
    (p) => ({
      kind: 'remote' as const,
      participant: p,
      role: classifyCallParticipantIdentity(p.identity, {
        isAgent: p.isAgent,
      }),
    })
  );
  remotes.sort((a, b) => {
    const roleDelta = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    if (roleDelta !== 0) return roleDelta;
    if (a.kind !== 'remote' || b.kind !== 'remote') return 0;
    return a.participant.identity.localeCompare(b.participant.identity);
  });
  return [{ kind: 'local', role: 'person' }, ...remotes];
}

export function splitInCallMembersForAvatars(
  members: InCallPanelMember[],
  visibleCount: number
): { visible: InCallPanelMember[]; overflow: InCallPanelMember[] } {
  return {
    visible: members.slice(0, visibleCount),
    overflow: members.slice(visibleCount),
  };
}

export function buildVisibleAvatarSlots(
  panelActive: boolean,
  members: InCallPanelMember[],
  visibleCount: number
): InCallVisibleAvatarSlot[] {
  if (!panelActive) return [];
  if (members.length === 0) {
    return [{ type: 'placeholder', key: 'connecting' }];
  }
  const slice = members.slice(0, visibleCount);
  return slice.map((member) => ({
    type: 'member',
    member,
    key: member.kind === 'local' ? 'local' : member.participant.sid,
  }));
}

import { ENABLE_CALLS } from '@core/constant/featureFlags';
import { globalSplitManager } from '@app/signal/splitLayout';
import { URL_PARAMS } from '@channel/Channel/link';

/**
 * Focuses the channel split (opens if needed) and pushes the
 * `?join_call=true` deep-link param so `ChannelCallAutoJoin` drops the user
 * straight into the call. Used for accept-call flows like clicking an
 * incoming-call browser notification.
 */
export async function joinChannelCall(channelId: string): Promise<void> {
  const manager = globalSplitManager();
  if (!manager || !channelId) return;

  const existing = manager.getSplitByContent('channel', channelId);
  if (existing) {
    existing.activate();
  } else {
    manager.openWithSplit(
      { type: 'channel', id: channelId },
      { activate: true, referredFrom: 'sidebar' }
    );
  }

  const orchestrator = manager.getOrchestrator();
  const handle = await orchestrator.getBlockHandle(channelId, 'channel');
  await handle?.goToLocationFromParams({
    [URL_PARAMS.joinCall]: 'true',
  });
}

export type CallParticipantKind = 'person' | 'bot' | 'agent';

/**
 * LiveKit already creates a room on first join (`get_or_create_call`).
 * Standing rooms stay joinable when empty so others can arrive later.
 */
export function standingRoomEmptyJoinAllowed(): boolean {
  return true;
}

/** Classify a LiveKit identity as a person, bot, or agent. */
export function classifyCallParticipantIdentity(
  identity: string,
  options?: { isAgent?: boolean }
): CallParticipantKind {
  if (options?.isAgent) return 'agent';
  const value = identity.trim().toLowerCase();
  if (
    value.startsWith('agent:') ||
    value.startsWith('agent|') ||
    value.includes('transcription-agent')
  ) {
    return 'agent';
  }
  if (value.startsWith('bot:') || value.startsWith('bot|')) {
    return 'bot';
  }
  return 'person';
}

/** True while only the local participant (or nobody) is in the room. */
export function isStandingRoomWaiting(memberCount: number): boolean {
  return memberCount <= 1;
}

/**
 * Empty standing room: nobody else is in yet (join-empty / solo occupant).
 * `otherCount` is remotes, or call-record occupants when you have not joined.
 */
export function isStandingRoomEmpty(otherCount: number): boolean {
  return otherCount === 0;
}

/** Tooltip / profile Call action. Isolated so tests can mock without featureFlags. */
export function canStartUserCall(): boolean {
  return ENABLE_CALLS;
}

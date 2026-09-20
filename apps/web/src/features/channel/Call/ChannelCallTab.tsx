import { t } from '@app/lib/i18n';
import { useChannelTab } from '@channel/Channel/ChannelTabContext';
import { UserGroup } from '@core/component/UserGroup';
import { getDisplayName, tryMacroId } from '@core/user';
import PhoneIcon from '@phosphor/phone-call.svg';
import { useActiveCallQuery, useCallRecordQuery } from '@queries/call/call';
import { Button } from '@ui';
import { type Accessor, createMemo, Match, Show, Suspense, Switch } from 'solid-js';
import { CallOverlay } from './CallOverlay';
import { getCallJoinTab, getCallLeaveTab } from './call-tabs';
import { isStandingRoomEmpty } from './join-channel-call';
import { useCall } from './use-call';

function participantFirstName(id: string) {
  const fullName = getDisplayName(tryMacroId(id));
  return (
    fullName.trim().split(/\s+/)[0] ||
    fullName ||
    t('channel.call.participants.someone')
  );
}

function ParticipantNamesLine(props: { ids: string[] }) {
  const count = () => props.ids.length;
  const remaining = () => Math.max(0, count() - 2);
  const first = () => participantFirstName(props.ids[0]);
  const second = () => participantFirstName(props.ids[1]);

  return (
    <Show when={count() > 0}>
      <p class="max-w-sm text-sm text-ink-muted">
        <Show when={count() === 1}>
          {t('channel.call.participants.one', { name: first() })}
        </Show>
        <Show when={count() === 2}>
          {t('channel.call.participants.two', {
            first: first(),
            second: second(),
          })}
        </Show>
        <Show when={count() > 2}>
          {t('channel.call.participants.many', {
            first: first(),
            second: second(),
            count: remaining(),
          })}
        </Show>
      </p>
    </Show>
  );
}

function JoinCallEmptyState(props: {
  channelId: string;
  isJoining: boolean;
  onJoin: () => void;
}) {
  const activeCallQuery = useActiveCallQuery(() => props.channelId);
  const callRecordQuery = useCallRecordQuery(
    () => activeCallQuery.data?.callId ?? ''
  );
  const participantIds = createMemo(
    () =>
      callRecordQuery.data?.participants
        .filter((participant) => !participant.leftAt)
        .map((participant) => participant.userId) ?? []
  );

  return (
    <div class="flex size-full flex-col items-center justify-center gap-5 px-6 text-center text-ink">
      <div class="flex flex-col items-center gap-3">
        <UserGroup
          userIds={participantIds()}
          maxUsers={5}
          size="lg"
          suppressClick
          showTooltip
        />
        <div class="flex flex-col items-center gap-1">
          <h2 class="text-lg font-semibold">
            {isStandingRoomEmpty(participantIds().length)
              ? t('channel.call.waitingForOthers')
              : t('channel.call.inProgress')}
          </h2>
          <Show when={!isStandingRoomEmpty(participantIds().length)}>
            <ParticipantNamesLine ids={participantIds()} />
          </Show>
        </div>
      </div>

      <Button
        variant="cta"
        size="lg"
        class="rounded-lg px-5"
        onClick={props.onJoin}
        disabled={props.isJoining}
      >
        <PhoneIcon class="size-5" />
        {props.isJoining
          ? t('channel.call.connecting')
          : isStandingRoomEmpty(participantIds().length)
            ? t('channel.call.enterRoom')
            : t('channel.call.join')}
      </Button>
    </div>
  );
}

export function ChannelCallTab(props: {
  channelId: string;
  /**
   * When true, show a "Joining call…" placeholder if we aren't yet
   * connected to this channel's call. Used for auto-join flows (e.g.
   * `?join_call=true` deep links) so the tab can render meaningful
   * content before the join request lands.
   */
  pendingJoin?: Accessor<boolean>;
}) {
  const { setActiveTab } = useChannelTab();

  // Match ChannelCallButton / ChannelCallAutoJoin so leaving from the
  // overlay (or disconnect) switches back to Messages — not only when
  // the join was initiated from the header button.
  const call = useCall(() => props.channelId, {
    onJoin: () => setActiveTab(getCallJoinTab()),
    onLeave: () => setActiveTab(getCallLeaveTab()),
  });

  const handleRetry = async () => {
    try {
      await call.joinCall();
    } catch {
      // joinError is set inside useCall join mutation onError
    }
  };

  return (
    <Switch
      fallback={
        <Suspense
          fallback={
            <div class="flex size-full items-center justify-center px-6 text-center text-ink">
              <h2 class="text-lg font-semibold">
                {t('channel.call.waitingForOthers')}
              </h2>
            </div>
          }
        >
          <JoinCallEmptyState
            channelId={props.channelId}
            isJoining={call.isJoining()}
            onJoin={() => void call.joinCall()}
          />
        </Suspense>
      }
    >
      <Match when={call.isInThisChannel() && !call.joinError()}>
        <CallOverlay onLeave={call.leaveCall} />
      </Match>
      <Match when={call.joinError()}>
        <div class="flex size-full flex-col items-center justify-center gap-3 text-ink-muted px-4">
          <h2 class="text-lg font-semibold text-ink">
            {t('channel.call.waitingForOthers')}
          </h2>
          <p class="text-center">{call.joinError()}</p>
          <Show when={call.isJoining()}>
            <p class="text-xs text-ink-extra-muted animate-pulse">
              {t('channel.call.connecting')}
            </p>
          </Show>
          <button
            type="button"
            onClick={handleRetry}
            disabled={call.isJoining()}
            class="rounded-lg bg-surface-2 px-4 py-2 text-sm text-ink hover:bg-surface-3 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {t('channel.call.tryAgain')}
          </button>
        </div>
      </Match>
      <Match when={props.pendingJoin?.() || call.isJoining()}>
        <div class="flex size-full flex-col items-center justify-center gap-2 px-6 text-center text-ink">
          <h2 class="text-lg font-semibold">
            {t('channel.call.waitingForOthers')}
          </h2>
          <p class="text-sm text-ink-muted">{t('channel.call.joining')}</p>
        </div>
      </Match>
    </Switch>
  );
}

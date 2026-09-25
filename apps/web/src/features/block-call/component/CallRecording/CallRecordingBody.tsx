import { AskMacroButton } from '@app/features/chat/ChatWithAgentButton';
import { SidePanel } from '@components/app/side-panel';
import { useBlockId } from '@core/block';
import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { ENABLE_BEARER_TOKEN_AUTH } from '@core/constant/featureFlags';
import { SERVER_HOSTS } from '@core/constant/servers';
import { isMobile } from '@core/mobile/isMobile';
import { fetchToken } from '@core/util/fetchWithToken';
import { callServiceClient } from '@service-call/client';
import type { CallRecord } from '@service-storage/generated/schemas/callRecord';
import { format } from 'date-fns';
import type { Accessor } from 'solid-js';
import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  Show,
} from 'solid-js';
import { formatCallDuration } from '../../utils';
import type { CallTranscriptTarget } from '../CallBlockAdapter';
import { CallTranscript } from '../CallTranscript';
import {
  getActiveTranscriptSequenceNum,
  getSegmentVideoSeconds,
  sortTranscriptSegments,
} from '../transcript-playback';
import { CallRecordingParticipantsSection } from './CallRecordingParticipants';
import { CallRecordingSplitHeader } from './CallRecordingSplitHeader';
import { CallRecordingSummarySection } from './CallRecordingSummary';
import { CallRecordingVideo } from './CallRecordingVideo';
import {
  seekDedupeKey,
  shouldCoalesceSeekGenerationBump,
} from './call-recording-utils';

export function CallRecordingBody(props: {
  data: Accessor<CallRecord>;
  transcriptTarget?: Accessor<CallTranscriptTarget | undefined>;
}) {
  const record = props.data;
  const blockId = useBlockId();
  const hasTranscripts = createMemo(() => record().transcript.length > 0);
  const [playbackSeconds, setPlaybackSeconds] = createSignal(0);
  const [allowFutureLead, setAllowFutureLead] = createSignal(true);
  const [videoRef, setVideoRef] = createSignal<HTMLVideoElement>();
  const [scrollRef, setScrollRef] = createSignal<HTMLDivElement>();
  const sortedTranscript = createMemo(() =>
    sortTranscriptSegments(record().transcript)
  );
  const [videoSeekGeneration, setVideoSeekGeneration] = createSignal(0);
  const [mediaSessionState, setMediaSessionState] = createSignal<
    { callId: string; status: 'ready' } | { callId: string; status: 'denied' }
  >();
  let pendingSeek: { callId: string; seconds: number } | undefined;
  let previousCallId: string | undefined;
  const mediaIdentity = createMemo(
    () => `${record().callId}:${record().recordingAvailable}`
  );
  createEffect(
    on(mediaIdentity, () => {
      const { callId, recordingAvailable } = record();
      if (callId !== previousCallId) {
        previousCallId = callId;
        if (pendingSeek?.callId !== callId) pendingSeek = undefined;
        setVideoRef(undefined);
      }
      if (!recordingAvailable) {
        setMediaSessionState(undefined);
        return;
      }
      if (!ENABLE_BEARER_TOKEN_AUTH) {
        setMediaSessionState({ callId, status: 'ready' });
        return;
      }

      let cancelled = false;
      setMediaSessionState(undefined);
      void (async () => {
        try {
          const result = await callServiceClient.createCallMediaSession(callId);
          if (!cancelled) {
            setMediaSessionState({
              callId,
              status: result.isErr() ? 'denied' : 'ready',
            });
          }
        } catch {
          if (!cancelled) setMediaSessionState({ callId, status: 'denied' });
        }
      })();
      onCleanup(() => {
        cancelled = true;
      });
    })
  );
  let lastVideoSeekBumpKey: string | null = null;
  let lastVideoSeekBumpAtMs = 0;

  const timelineStartMs = createMemo(() => {
    const anchor = record().recordingStartedAt ?? record().startedAt;
    const ms = new Date(anchor).getTime();
    return Number.isFinite(ms) ? ms : null;
  });

  const bumpVideoSeekGeneration = (seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    const key = seekDedupeKey(seconds);
    const now = performance.now();
    if (
      shouldCoalesceSeekGenerationBump(
        key,
        now,
        lastVideoSeekBumpKey,
        lastVideoSeekBumpAtMs
      )
    )
      return;
    lastVideoSeekBumpKey = key;
    lastVideoSeekBumpAtMs = now;
    setVideoSeekGeneration((n) => n + 1);
  };

  const activeSequenceNum = createMemo(() =>
    getActiveTranscriptSequenceNum(
      sortedTranscript(),
      playbackSeconds(),
      timelineStartMs(),
      allowFutureLead()
    )
  );

  const handleTimeUpdate = (
    seconds: number,
    source: 'playback' | 'seeking' | 'seeked'
  ) => {
    setPlaybackSeconds(seconds);
    setAllowFutureLead(source === 'playback');
    if (source === 'seeked') bumpVideoSeekGeneration(seconds);
  };

  const seekToSeconds = (seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    const video = videoRef();
    const maxTime = Number.isFinite(video?.duration ?? Number.NaN)
      ? (video!.duration as number)
      : seconds;
    const targetSeconds = Math.max(0, Math.min(seconds, maxTime));

    setPlaybackSeconds(targetSeconds);
    setAllowFutureLead(false);
    bumpVideoSeekGeneration(targetSeconds);

    if (
      video?.readyState &&
      video.readyState >= HTMLMediaElement.HAVE_METADATA
    ) {
      video.currentTime = targetSeconds;
    } else {
      pendingSeek = { callId: record().callId, seconds: targetSeconds };
    }
  };

  const goToTranscriptSegment = (transcriptId: string) => {
    const segment = sortedTranscript().find(
      (s) => s.transcriptId === transcriptId
    );
    if (!segment) return;
    const seconds = getSegmentVideoSeconds(segment, timelineStartMs());
    if (seconds === null) return;
    seekToSeconds(seconds);
  };

  createEffect(
    on(
      () => props.transcriptTarget?.(),
      (target) => {
        if (!target) return;
        goToTranscriptSegment(target.transcriptId);
      }
    )
  );

  const callTitle = createMemo(
    () => record().customName ?? record().channelName ?? 'Call Recording'
  );

  const formattedDate = createMemo(() => {
    const ended = record().endedAt;
    if (!ended) return null;
    return format(new Date(ended), 'MMM d, yyyy · h:mm a');
  });

  const formattedDuration = createMemo(() => {
    const ms = record().durationMs;
    if (!ms) return null;
    return formatCallDuration(ms);
  });

  return (
    <>
      <CallRecordingSplitHeader record={record} />
      <div class="relative flex-1 min-h-0 overflow-hidden">
        <SidePanel.Section
          id="call-ai-actions"
          title="Actions"
          defaultOpen
          order={0}
        >
          <div class="m-px flex items-center justify-start gap-2">
            <AskMacroButton
              entity={{
                type: 'document',
                id: blockId,
                name: callTitle(),
                fileType: 'call',
              }}
            />
          </div>
        </SidePanel.Section>
        <div
          class="h-full min-h-0 overflow-y-auto scrollbar-hidden"
          ref={setScrollRef}
        >
          <div class="mx-auto max-w-3xl min-w-0 px-6 pt-12 pb-16 touch:pt-(--mobile-content-inset-top) touch:pb-(--mobile-content-inset-bottom)">
            <div class="flex flex-col gap-10">
              <header>
                <Show when={!isMobile()}>
                  <div class="h-8 mb-4" />
                </Show>
                <h1 class="text-2xl font-semibold text-ink text-balance">
                  {callTitle()}
                </h1>
                <div class="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
                  <Show when={formattedDate()}>
                    {(date) => <span>{date()}</span>}
                  </Show>
                  <Show when={formattedDuration()}>
                    {(dur) => (
                      <>
                        <span class="text-ink-extra-muted">&middot;</span>
                        <span>{dur()}</span>
                      </>
                    )}
                  </Show>
                  <Show when={record().isActive}>
                    <span class="text-success font-medium">In progress</span>
                  </Show>
                </div>
              </header>

              <CallRecordingParticipantsSection record={record} />

              <CallRecordingSummarySection record={record} />

              <Show when={record().recordingAvailable}>
                <section class="flex flex-col gap-3">
                  <h3 class="text-sm font-semibold text-ink">Recording</h3>
                  <div class="overflow-hidden rounded border border-edge-muted/50">
                    <Show
                      when={
                        !ENABLE_BEARER_TOKEN_AUTH ||
                        (mediaSessionState()?.callId === record().callId &&
                          mediaSessionState()?.status === 'ready')
                      }
                      fallback={
                        <Show
                          when={
                            mediaSessionState()?.callId === record().callId &&
                            mediaSessionState()?.status === 'denied'
                          }
                          fallback={
                            <div
                              role="status"
                              class="p-4 text-sm text-ink-muted"
                            >
                              Preparing recording…
                            </div>
                          }
                        >
                          <div role="alert" class="p-4 text-sm text-alert-ink">
                            This recording is unavailable because access could
                            not be verified.
                          </div>
                        </Show>
                      }
                    >
                      <CallRecordingVideo
                        url={`${SERVER_HOSTS['document-storage-service']}/call/record/${record().callId}/media`}
                        recordKey={record().callId}
                        posterUrl={
                          record().previewAvailable
                            ? `${SERVER_HOSTS['document-storage-service']}/call/record/${record().callId}/preview`
                            : undefined
                        }
                        onTimeUpdate={handleTimeUpdate}
                        setVideoRef={setVideoRef}
                        onLoadedMetadata={(video) => {
                          if (pendingSeek?.callId !== record().callId) return;
                          video.currentTime = pendingSeek.seconds;
                          pendingSeek = undefined;
                        }}
                        renewMediaAccess={async () => {
                          if (!ENABLE_BEARER_TOKEN_AUTH) {
                            const result = await fetchToken();
                            if (result.isErr()) throw result.error;
                            return;
                          }

                          const result =
                            await callServiceClient.createCallMediaSession(
                              record().callId
                            );
                          if (result.isErr()) throw result.error;
                        }}
                      />
                    </Show>
                  </div>
                </section>
              </Show>
              <Show when={!record().recordingAvailable}>
                <section class="flex flex-col gap-3">
                  <h3 class="text-sm font-semibold text-ink">Recording</h3>
                  <p class="text-sm text-ink-muted">
                    {record().isActive
                      ? 'Recording will be available after the call ends.'
                      : 'No recording is available for this call.'}
                  </p>
                </section>
              </Show>

              <Show when={hasTranscripts()}>
                <section class="flex flex-col gap-3">
                  <h3 class="text-sm font-semibold text-ink">Transcript</h3>
                  <div class="flex flex-col max-h-[min(600px,60vh)] overflow-hidden rounded border border-edge-muted/50">
                    <CallTranscript
                      transcript={record().transcript}
                      channelId={record().channelId}
                      timelineStartMs={timelineStartMs()}
                      activeSequenceNum={activeSequenceNum()}
                      videoSeekGeneration={videoSeekGeneration()}
                      onSeekToSeconds={seekToSeconds}
                      hideHeader
                    />
                  </div>
                </section>
              </Show>
            </div>
          </div>
        </div>
        <CustomScrollbar scrollContainer={scrollRef} />
      </div>
    </>
  );
}

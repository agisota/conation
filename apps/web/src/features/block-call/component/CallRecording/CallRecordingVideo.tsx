import type { JSX } from 'solid-js';
import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';

export function CallRecordingVideo(props: {
  url: string;
  recordKey?: string;
  posterUrl?: string;
  onTimeUpdate?: (
    seconds: number,
    source: 'playback' | 'seeking' | 'seeked'
  ) => void;
  setVideoRef?: (el: HTMLVideoElement) => void;
  onLoadedMetadata?: (video: HTMLVideoElement) => void;
  renewMediaAccess?: () => Promise<void>;
}): JSX.Element {
  const [isLoaded, setIsLoaded] = createSignal(false);
  const [playbackError, setPlaybackError] = createSignal(false);
  const [posterBlobUrl, setPosterBlobUrl] = createSignal<string>();
  const hasVisibleVideo = () =>
    isLoaded() || !!posterBlobUrl() || playbackError();
  let rafId: number | null = null;
  let videoRef: HTMLVideoElement | undefined;
  let mediaRetryUsed = false;
  let mediaGeneration = 0;
  let pendingSeekSeconds: number | undefined;
  let renewalPromise: Promise<void> | undefined;

  const renewMediaAccess = () => {
    if (!props.renewMediaAccess) return Promise.resolve();
    renewalPromise ??= props.renewMediaAccess().finally(() => {
      renewalPromise = undefined;
    });
    return renewalPromise;
  };

  createEffect<{
    url: string;
    recordKey?: string;
  }>((previous) => {
    const url = props.url;
    const recordKey = props.recordKey;
    if (url !== previous?.url || recordKey !== previous?.recordKey) {
      mediaGeneration += 1;
      mediaRetryUsed = false;
      pendingSeekSeconds = undefined;
      setIsLoaded(false);
      setPlaybackError(false);
    }
    return { url, recordKey };
  });

  createEffect(() => {
    const posterUrl = props.posterUrl;
    const recordKey = props.recordKey;
    const generation = mediaGeneration;
    setPosterBlobUrl(undefined);
    if (!posterUrl) return;

    const abortController = new AbortController();
    let objectUrl: string | undefined;

    onCleanup(() => {
      abortController.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    });

    void (async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (
          abortController.signal.aborted ||
          generation !== mediaGeneration ||
          props.recordKey !== recordKey
        ) {
          return;
        }
        try {
          const response = await fetch(posterUrl, {
            credentials: 'include',
            signal: abortController.signal,
          });
          if (
            abortController.signal.aborted ||
            generation !== mediaGeneration ||
            props.recordKey !== recordKey
          ) {
            return;
          }
          if (
            response.status === 401 &&
            attempt === 0 &&
            props.renewMediaAccess
          ) {
            await renewMediaAccess();
            continue;
          }
          if (!response.ok) {
            throw new Error(`Failed to fetch poster: ${response.status}`);
          }

          const blob = await response.blob();
          if (
            abortController.signal.aborted ||
            generation !== mediaGeneration ||
            props.recordKey !== recordKey
          ) {
            return;
          }
          objectUrl = URL.createObjectURL(blob);
          setPosterBlobUrl(objectUrl);
          return;
        } catch (error) {
          if (abortController.signal.aborted) return;
          console.error('Failed to load call recording preview poster', error);
          return;
        }
      }
    })();
  });

  const stopTicking = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const startTicking = (video: HTMLVideoElement) => {
    stopTicking();
    const tick = () => {
      props.onTimeUpdate?.(video.currentTime, 'playback');
      if (!video.paused && !video.ended) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    };
    rafId = requestAnimationFrame(tick);
  };

  function markPlaybackReady(): void {
    setIsLoaded(true);
    setPlaybackError(false);
  }

  async function handlePlaybackError(): Promise<void> {
    stopTicking();
    const generation = mediaGeneration;
    if (!props.renewMediaAccess || mediaRetryUsed) {
      setPlaybackError(true);
      return;
    }

    mediaRetryUsed = true;
    pendingSeekSeconds = videoRef?.currentTime;
    try {
      await renewMediaAccess();
      if (generation !== mediaGeneration || !videoRef) return;
      setPlaybackError(false);
      videoRef.load();
    } catch {
      if (generation === mediaGeneration) setPlaybackError(true);
    }
  }

  function restorePlaybackPosition(video: HTMLVideoElement): void {
    if (pendingSeekSeconds === undefined) return;
    video.currentTime = pendingSeekSeconds;
    pendingSeekSeconds = undefined;
  }

  onMount(() => videoRef?.load());
  onCleanup(() => {
    mediaGeneration += 1;
    stopTicking();
  });

  return (
    <div class="p-4 flex flex-col justify-center items-center gap-3 overflow-hidden">
      <video
        ref={(element) => {
          videoRef = element;
          props.setVideoRef?.(element);
        }}
        class="max-w-full max-h-full rounded transition-opacity duration-200"
        classList={{
          'opacity-0': !hasVisibleVideo(),
          'opacity-100': hasVisibleVideo(),
        }}
        controls
        crossorigin="use-credentials"
        preload="metadata"
        poster={posterBlobUrl()}
        src={props.url}
        onError={handlePlaybackError}
        onLoadedData={markPlaybackReady}
        onCanPlay={markPlaybackReady}
        onPlaying={(event) => {
          mediaRetryUsed = false;
          markPlaybackReady();
          startTicking(event.currentTarget);
        }}
        onPlay={(event) => startTicking(event.currentTarget)}
        onPause={() => stopTicking()}
        onSeeking={(event) =>
          props.onTimeUpdate?.(event.currentTarget.currentTime, 'seeking')
        }
        onSeeked={(event) =>
          props.onTimeUpdate?.(event.currentTarget.currentTime, 'seeked')
        }
        onEnded={(event) => {
          stopTicking();
          props.onTimeUpdate?.(event.currentTarget.duration, 'playback');
        }}
        onTimeUpdate={(event) =>
          props.onTimeUpdate?.(event.currentTarget.currentTime, 'playback')
        }
        onLoadedMetadata={(event) => {
          restorePlaybackPosition(event.currentTarget);
          props.onLoadedMetadata?.(event.currentTarget);
          props.onTimeUpdate?.(event.currentTarget.currentTime, 'playback');
        }}
      />
      <Show when={playbackError()}>
        <div
          role="alert"
          class="w-full max-w-lg rounded border border-alert/30 bg-alert-bg px-3 py-2 text-sm text-alert-ink"
        >
          <p class="font-medium">This recording couldn't be played.</p>
          <p class="mt-1 text-alert-ink/80">
            Reload the page to try again, or open or download the recording to
            play it in another app.
          </p>
          <a
            href={props.url}
            target="_blank"
            rel="noopener noreferrer"
            download=""
            class="mt-2 inline-flex font-medium text-alert-ink underline underline-offset-2 hover:text-alert-ink/80"
          >
            Open or download recording
          </a>
        </div>
      </Show>
    </div>
  );
}

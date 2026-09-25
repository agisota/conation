/**
 * @vitest-environment jsdom
 */

import type { CallRecord } from '@service-storage/generated/schemas/callRecord';
import { render, screen, waitFor } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { CallRecordingBody } from './CallRecordingBody';
import { CallRecordingVideo } from './CallRecordingVideo';

const bodyMocks = vi.hoisted(() => ({
  createCallMediaSession: vi.fn(),
}));

vi.mock('@service-call/client', () => ({
  callServiceClient: {
    createCallMediaSession: bodyMocks.createCallMediaSession,
  },
}));
vi.mock('@core/constant/featureFlags', async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import('@core/constant/featureFlags');
  return { ...actual, ENABLE_BEARER_TOKEN_AUTH: true };
});
vi.mock('@core/block', () => ({ useBlockId: () => 'block-1' }));
vi.mock('@core/mobile/isMobile', () => ({ isMobile: () => false }));
vi.mock('@app/features/chat/ChatWithAgentButton', () => ({
  AskMacroButton: () => null,
}));
vi.mock('@components/app/side-panel', () => ({
  SidePanel: { Section: () => null },
}));
vi.mock('@core/component/CustomScrollbar', () => ({
  CustomScrollbar: () => null,
}));
vi.mock('./CallRecordingParticipants', () => ({
  CallRecordingParticipantsSection: () => null,
}));
vi.mock('./CallRecordingSplitHeader', () => ({
  CallRecordingSplitHeader: () => null,
}));
vi.mock('./CallRecordingSummary', () => ({
  CallRecordingSummarySection: () => null,
}));
vi.mock('../CallTranscript', () => ({ CallTranscript: () => null }));

const recordingUrl = 'https://storage.example/call/record/call-1/media';
const nextRecordingUrl = 'https://storage.example/call/record/call-2/media';
const posterUrl = 'https://storage.example/call/record/call-1/preview';
const posterBlobUrl = 'blob:call-recording-preview';

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(
  URL,
  'createObjectURL'
);
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(
  URL,
  'revokeObjectURL'
);

function restoreUrlMethod(
  name: 'createObjectURL' | 'revokeObjectURL',
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) {
    Object.defineProperty(URL, name, descriptor);
    return;
  }

  Reflect.deleteProperty(URL, name);
}

function mockPosterFetch() {
  const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => ({
    blob: async () => new Blob(['poster'], { type: 'image/jpeg' }),
    ok: true,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function getVideo(container: HTMLElement): HTMLVideoElement {
  const video = container.querySelector('video');
  if (!(video instanceof HTMLVideoElement)) {
    throw new Error('Expected call recording video element');
  }

  return video;
}

function dispatchMediaError(video: HTMLVideoElement, code: number): void {
  Object.defineProperty(video, 'error', {
    configurable: true,
    value: { code },
  });
  video.dispatchEvent(new Event('error'));
}

beforeEach(() => {
  bodyMocks.createCallMediaSession.mockReset();
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => posterBlobUrl),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterAll(() => {
  restoreUrlMethod('createObjectURL', originalCreateObjectUrl);
  restoreUrlMethod('revokeObjectURL', originalRevokeObjectUrl);
});

describe('CallRecordingVideo', () => {
  it('shows a playback fallback while preserving native video attributes', async () => {
    const fetchMock = mockPosterFetch();
    const { container } = render(() => (
      <CallRecordingVideo url={recordingUrl} posterUrl={posterUrl} />
    ));
    const video = getVideo(container);

    expect(video.load).toHaveBeenCalledOnce();

    await waitFor(() =>
      expect(video.getAttribute('poster')).toBe(posterBlobUrl)
    );

    dispatchMediaError(video, 4);

    expect(
      screen.getByText("This recording couldn't be played.")
    ).not.toBeNull();

    const fallbackLink = screen.getByRole('link', {
      name: 'Open or download recording',
    });
    expect(fallbackLink.getAttribute('href')).toBe(recordingUrl);
    expect(fallbackLink.getAttribute('target')).toBe('_blank');
    expect(fallbackLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(fallbackLink.hasAttribute('download')).toBe(true);

    expect(video.hasAttribute('controls')).toBe(true);
    expect(video.getAttribute('preload')).toBe('metadata');
    expect(video.getAttribute('crossorigin')).toBe('use-credentials');
    expect(fetchMock).toHaveBeenCalledWith(
      posterUrl,
      expect.objectContaining({ credentials: 'include' })
    );
    expect(video.getAttribute('poster')).toBe(posterBlobUrl);
    expect(video.getAttribute('src')).toBe(recordingUrl);

    video.dispatchEvent(new Event('canplay'));

    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('keeps native URL streaming with credentialed poster requests', async () => {
    const fetchMock = mockPosterFetch();
    const { container } = render(() => (
      <CallRecordingVideo url={recordingUrl} posterUrl={posterUrl} />
    ));
    const video = getVideo(container);

    expect(video.getAttribute('src')).toBe(recordingUrl);
    expect(video.getAttribute('preload')).toBe('metadata');
    expect(video.getAttribute('crossorigin')).toBe('use-credentials');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([posterUrl]);
  });

  it('renews once, reloads at the previous playback position, and resets after playback', async () => {
    mockPosterFetch();
    const renew = vi.fn(async () => {});
    const { container } = render(() => (
      <CallRecordingVideo url={recordingUrl} renewMediaAccess={renew} />
    ));
    const video = getVideo(container);
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      writable: true,
      value: 42,
    });

    dispatchMediaError(video, 2);
    await waitFor(() => expect(video.load).toHaveBeenCalledTimes(2));
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(video.currentTime).toBe(42);

    dispatchMediaError(video, 2);
    await waitFor(() =>
      expect(
        screen.getByText("This recording couldn't be played.")
      ).not.toBeNull()
    );
    expect(renew).toHaveBeenCalledOnce();

    video.dispatchEvent(new Event('playing'));
    dispatchMediaError(video, 2);
    await waitFor(() => expect(renew).toHaveBeenCalledTimes(2));
  });

  it('falls back when media access renewal is denied', async () => {
    const renew = vi.fn(async () => {
      throw new Error('denied');
    });
    const { container } = render(() => (
      <CallRecordingVideo url={recordingUrl} renewMediaAccess={renew} />
    ));

    dispatchMediaError(getVideo(container), 4);

    expect(await screen.findByRole('alert')).not.toBeNull();
    expect(renew).toHaveBeenCalledOnce();
  });

  it('does not renew media access for a missing poster', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const renew = vi.fn(async () => {});

    render(() => (
      <CallRecordingVideo
        url={recordingUrl}
        posterUrl={posterUrl}
        renewMediaAccess={renew}
      />
    ));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(console.error).toHaveBeenCalledOnce());
    expect(renew).not.toHaveBeenCalled();
  });

  it('does not apply a poster response after the recording key changes', async () => {
    let resolvePoster!: (response: {
      ok: true;
      blob: () => Promise<Blob>;
    }) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvePoster = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const [recordKey, setRecordKey] = createSignal('call-1');
    const { container } = render(() => (
      <CallRecordingVideo
        url={recordingUrl}
        recordKey={recordKey()}
        posterUrl={posterUrl}
      />
    ));

    setRecordKey('call-2');
    resolvePoster({
      ok: true,
      blob: async () => new Blob(['poster'], { type: 'image/jpeg' }),
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(getVideo(container).getAttribute('poster')).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('retries a poster fetch once after renewing media access', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        blob: async () => new Blob(['poster'], { type: 'image/jpeg' }),
        ok: true,
      });
    vi.stubGlobal('fetch', fetchMock);
    const renew = vi.fn(async () => {});

    render(() => (
      <CallRecordingVideo
        url={recordingUrl}
        posterUrl={posterUrl}
        renewMediaAccess={renew}
      />
    ));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(renew).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      posterUrl,
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('clears the fallback when the recording URL changes', async () => {
    const [url, setUrl] = createSignal(recordingUrl);
    const { container } = render(() => <CallRecordingVideo url={url()} />);
    const video = getVideo(container);

    dispatchMediaError(video, 4);
    expect(screen.getByRole('alert')).not.toBeNull();

    setUrl(nextRecordingUrl);

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(video.getAttribute('src')).toBe(nextRecordingUrl);
  });
});
describe('CallRecordingBody media authorization', () => {
  it('waits for bearer media-session preflight before creating the native video', async () => {
    const { promise: preflight, resolve: resolvePreflight } =
      Promise.withResolvers<{ isErr: () => boolean }>();
    bodyMocks.createCallMediaSession
      .mockReturnValueOnce(preflight)
      .mockResolvedValueOnce({ isErr: () => true });
    const callRecord = {
      callId: 'call-1',
      channelId: 'channel-1',
      channelName: 'Channel',
      createdBy: 'user-1',
      isActive: false,
      participants: [],
      recordingAvailable: true,
      previewAvailable: false,
      roomName: 'room-1',
      shareWithTeam: false,
      startedAt: '2026-01-01T00:00:00.000Z',
      transcript: [
        {
          transcriptId: 'segment-1',
          sequenceNum: 1,
          content: 'Relevant moment',
          speakerId: 'user-1',
          startedAt: '2026-01-01T00:00:42.000Z',
        },
      ],
    } as unknown as CallRecord;
    const [record, setRecord] = createSignal(callRecord);
    const { container } = render(() => (
      <CallRecordingBody
        data={record}
        transcriptTarget={() => ({ transcriptId: 'segment-1', gen: 0 })}
      />
    ));

    expect(bodyMocks.createCallMediaSession).toHaveBeenCalledWith('call-1');
    expect(container.querySelector('video')).toBeNull();

    resolvePreflight({ isErr: () => false });
    await waitFor(() =>
      expect(container.querySelector('video')?.getAttribute('src')).toContain(
        '/dss/call/record/call-1/media'
      )
    );

    const video = getVideo(container);
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(video.currentTime).toBe(42);

    setRecord({ ...callRecord, customName: 'Renamed call' });
    expect(container.querySelector('video')).toBe(video);
    expect(bodyMocks.createCallMediaSession).toHaveBeenCalledTimes(1);

    setRecord({ ...callRecord, callId: 'call-2' });
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'access could not be verified'
      )
    );
    expect(container.querySelector('video')).toBeNull();
  });
});

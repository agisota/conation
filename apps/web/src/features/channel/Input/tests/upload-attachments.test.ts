/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getImageDimensionsMock, getVideoDimensionsMock, toastFailureMock } =
  vi.hoisted(() => ({
    getImageDimensionsMock: vi.fn(),
    getVideoDimensionsMock: vi.fn(),
    toastFailureMock: vi.fn(),
  }));

vi.mock('@core/constant/allBlocks', () => ({
  fileTypeToBlockName: (type?: string | null) => type ?? 'unknown',
}));

vi.mock('@core/util/media', () => ({
  getImageDimensions: getImageDimensionsMock,
  getVideoDimensions: getVideoDimensionsMock,
}));

import { createInputAttachmentTracker } from '../attachment-tracker';
import { uploadInputAttachments } from '../upload-attachments';
import { getAttachmentKindFromFile } from '../utils/file-helpers';

vi.mock('@core/component/Toast/Toast', () => ({
  toast: {
    failure: toastFailureMock,
  },
}));

describe('uploadInputAttachments', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:attachment-preview');
    getImageDimensionsMock.mockReset();
    getImageDimensionsMock.mockResolvedValue({ width: 0, height: 0 });
    getVideoDimensionsMock.mockReset();
    getVideoDimensionsMock.mockResolvedValue({ width: 0, height: 0 });
    toastFailureMock.mockReset();
  });

  afterEach(() => {
    localStorage.removeItem('attachment-tracker-stale-upload');
    localStorage.removeItem('attachment-tracker-remounted-upload');
    vi.restoreAllMocks();
  });

  it('infers attachment kind from mime type and extension', () => {
    expect(
      getAttachmentKindFromFile({
        name: 'image.png',
        type: '',
      } as File)
    ).toBe('image');
    expect(
      getAttachmentKindFromFile({
        name: 'clip.mov',
        type: '',
      } as File)
    ).toBe('video');
    expect(
      getAttachmentKindFromFile({
        name: 'spec.md',
        type: '',
      } as File)
    ).toBe('document');
  });

  it('keeps the attachment pending until the upload promise resolves', async () => {
    const tracker = createInputAttachmentTracker();
    const file = new File(['abc'], 'image.png', { type: 'image/png' });
    let resolveUpload:
      | ((result: { failed: false; destination: 'static'; id: string }) => void)
      | undefined;

    const uploadPromise = uploadInputAttachments({
      files: [file],
      tracker,
      uploadFile: () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    });

    await Promise.resolve();
    expect(tracker.attachments()).toEqual([
      {
        id: expect.any(String),
        name: 'image.png',
        kind: 'image',
        pending: true,
        previewSrc: 'blob:attachment-preview',
      },
    ]);

    resolveUpload?.({
      failed: false,
      destination: 'static',
      id: 'uploaded-image-1',
    });
    await uploadPromise;

    expect(tracker.attachments()).toEqual([
      {
        id: 'uploaded-image-1',
        name: 'image.png',
        kind: 'image',
        mimeType: 'image/png',
        size: 3,
        previewSrc: 'blob:attachment-preview',
      },
    ]);
  });

  it.each([
    {
      kind: 'image' as const,
      name: 'image.png',
      mimeType: 'image/png',
      uploadedId: 'uploaded-image-1',
      getDimensionsMock: getImageDimensionsMock,
    },
    {
      kind: 'video' as const,
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      uploadedId: 'uploaded-video-1',
      getDimensionsMock: getVideoDimensionsMock,
    },
  ])('keeps $kind pending until dimensions are ready', async (media) => {
    const tracker = createInputAttachmentTracker();
    const file = new File(['abc'], media.name, { type: media.mimeType });
    let resolveDimensions:
      | ((dimensions: { width: number; height: number }) => void)
      | undefined;

    media.getDimensionsMock.mockReturnValue(
      new Promise((resolve) => {
        resolveDimensions = resolve;
      })
    );

    let completed = false;
    const uploadPromise = uploadInputAttachments({
      files: [file],
      tracker,
      uploadFile: async () => ({
        failed: false,
        destination: 'static',
        id: media.uploadedId,
      }),
    }).then(() => {
      completed = true;
    });

    await vi.waitFor(() => {
      expect(media.getDimensionsMock).toHaveBeenCalledOnce();
    });

    expect(completed).toBe(false);
    expect(tracker.hasPending()).toBe(true);

    resolveDimensions?.({ width: 1920, height: 1080 });
    await uploadPromise;

    expect(tracker.attachments()).toEqual([
      {
        id: media.uploadedId,
        name: media.name,
        kind: media.kind,
        mimeType: media.mimeType,
        size: 3,
        width: 1920,
        height: 1080,
        previewSrc: 'blob:attachment-preview',
      },
    ]);
  });

  it('removes pending attachment and shows toast on failed upload', async () => {
    const tracker = createInputAttachmentTracker();
    const file = new File(['abc'], 'spec.md', { type: 'text/markdown' });

    await uploadInputAttachments({
      files: [file],
      tracker,
      uploadFile: async () => ({
        failed: true,
      }),
    });

    expect(tracker.attachments()).toEqual([]);
    expect(toastFailureMock).toHaveBeenCalledWith('Failed to upload spec.md');
  });

  it('stores document icon type from upload result', async () => {
    const tracker = createInputAttachmentTracker();
    const file = new File(['abc'], 'manual.pdf', {
      type: 'application/pdf',
    });

    await uploadInputAttachments({
      files: [file],
      tracker,
      uploadFile: async () => ({
        failed: false,
        destination: 'dss',
        type: 'document',
        documentId: 'doc-1',
        fileType: 'pdf',
      }),
    });

    expect(tracker.attachments()).toEqual([
      {
        id: 'doc-1',
        name: 'manual',
        kind: 'document',
        iconType: 'pdf',
        mimeType: 'application/pdf',
        size: 3,
      },
    ]);
  });

  it('does not persist an upload after a remounted composer has sent', async () => {
    const persistenceKey = 'attachment-tracker-stale-upload';
    localStorage.removeItem(persistenceKey);
    const staleTracker = createInputAttachmentTracker({
      persistenceKey,
      persistenceStorage: localStorage,
    });
    const file = new File(['abc'], 'notes.txt');
    const { promise: uploadResult, resolve: resolveUpload } =
      Promise.withResolvers<{
        failed: false;
        destination: 'static';
        id: string;
      }>();

    const uploadPromise = uploadInputAttachments({
      files: [file],
      tracker: staleTracker,
      uploadFile: () => uploadResult,
    });
    await Promise.resolve();

    const remountedTracker = createInputAttachmentTracker({
      persistenceKey,
      persistenceStorage: localStorage,
    });
    remountedTracker.clearAttachments();

    resolveUpload({
      failed: false,
      destination: 'static',
      id: 'uploaded-notes',
    });
    await uploadPromise;

    expect(remountedTracker.attachments()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(persistenceKey) ?? '[]')).toEqual(
      []
    );
    localStorage.removeItem(persistenceKey);
  });

  it('persists an in-flight upload when the composer only remounts', async () => {
    const persistenceKey = 'attachment-tracker-remounted-upload';
    localStorage.removeItem(persistenceKey);
    const staleTracker = createInputAttachmentTracker({
      persistenceKey,
      persistenceStorage: localStorage,
    });
    const file = new File(['abc'], 'notes.txt');
    const { promise: uploadResult, resolve: resolveUpload } =
      Promise.withResolvers<{
        failed: false;
        destination: 'static';
        id: string;
      }>();

    const uploadPromise = uploadInputAttachments({
      files: [file],
      tracker: staleTracker,
      uploadFile: () => uploadResult,
    });
    await Promise.resolve();

    createInputAttachmentTracker({
      persistenceKey,
      persistenceStorage: localStorage,
    });
    resolveUpload({
      failed: false,
      destination: 'static',
      id: 'uploaded-notes',
    });
    await uploadPromise;

    const restoredTracker = createInputAttachmentTracker({
      persistenceKey,
      persistenceStorage: localStorage,
    });
    expect(restoredTracker.attachments()).toEqual([
      {
        id: 'uploaded-notes',
        name: 'notes.txt',
        kind: 'document',
        iconType: 'txt',
        size: 3,
      },
    ]);
    localStorage.removeItem(persistenceKey);
  });
});

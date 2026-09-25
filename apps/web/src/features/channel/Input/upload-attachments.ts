import { toast } from '@core/component/Toast/Toast';
import { getImageDimensions, getVideoDimensions } from '@core/util/media';
import {
  createUploadFile,
  createUploadFilePreviewUrl,
  getUploadFilePreviewSource,
  type UploadFile,
} from '@core/util/uploadFile';
import type { InputAttachmentTracker } from './types';
import {
  buildUploadedAttachment,
  getAttachmentKindFromFile,
  iconTypeFromFilename,
  type UploadResult,
} from './utils/file-helpers';

export { getAttachmentKindFromFile } from './utils/file-helpers';

function createAttachmentPreviewSrc(
  file: UploadFile,
  kind: 'image' | 'video' | 'document'
): string | undefined {
  if (kind === 'document') return undefined;

  try {
    return createUploadFilePreviewUrl(file);
  } catch {
    return undefined;
  }
}

/**
 * Resolve media dimensions from a File for image/video attachments.
 * Returns undefined for documents or on failure.
 */
async function resolveMediaDimensions(
  file: UploadFile,
  kind: 'image' | 'video' | 'document'
): Promise<{ width: number; height: number } | undefined> {
  if (kind === 'document') return undefined;
  try {
    const source = getUploadFilePreviewSource(file);
    const dims =
      kind === 'image'
        ? await getImageDimensions(source)
        : await getVideoDimensions(source);
    if (dims && dims.width > 0 && dims.height > 0) return dims;
  } catch {
    // Dimension extraction is best-effort
  }
  return undefined;
}

export async function uploadInputAttachments(options: {
  files: File[];
  tracker: InputAttachmentTracker;
  uploadFile: (file: File) => Promise<UploadResult>;
}): Promise<void> {
  const uploadGeneration = options.tracker.getUploadGeneration();
  for (const file of options.files) {
    if (!options.tracker.isUploadGenerationCurrent(uploadGeneration)) break;
    const uploadSource = createUploadFile(file);
    const pendingId = crypto.randomUUID();
    const pendingKind = getAttachmentKindFromFile(uploadSource);
    const previewSrc = createAttachmentPreviewSrc(uploadSource, pendingKind);

    options.tracker.addAttachment({
      id: pendingId,
      name: file.name,
      kind: pendingKind,
      iconType:
        pendingKind === 'document'
          ? iconTypeFromFilename(file.name)
          : undefined,
      pending: true,
      previewSrc,
    });

    try {
      const dimensionsPromise = resolveMediaDimensions(
        uploadSource,
        pendingKind
      );
      const result = await options.uploadFile(file);
      if (!options.tracker.isUploadGenerationCurrent(uploadGeneration)) break;
      if (result.failed) {
        if (!options.tracker.removeAttachment(pendingId, uploadGeneration))
          continue;
        toast.failure(`Failed to upload ${file.name}`);
        continue;
      }

      const dimensions = await dimensionsPromise;
      if (!options.tracker.isUploadGenerationCurrent(uploadGeneration)) break;
      const uploaded = buildUploadedAttachment(file, pendingKind, result);
      if (!uploaded) {
        if (!options.tracker.removeAttachment(pendingId, uploadGeneration))
          continue;
        toast.failure(`Failed to upload ${file.name}`);
        continue;
      }
      if (previewSrc && uploaded.kind !== 'document') {
        uploaded.previewSrc = previewSrc;
      }
      if (file.type) uploaded.mimeType = file.type;
      uploaded.size = file.size;
      if (dimensions) {
        uploaded.width = dimensions.width;
        uploaded.height = dimensions.height;
      }

      options.tracker.replaceAttachment(pendingId, uploaded, uploadGeneration);
    } catch (error) {
      if (!options.tracker.removeAttachment(pendingId, uploadGeneration))
        continue;
      console.error('failed to upload attachment', error);
      toast.failure(`Failed to upload ${file.name}`);
    }
  }
}

import { makePersisted } from '@solid-primitives/storage';
import { type Accessor, createMemo, createSignal } from 'solid-js';
import type { InputAttachmentData } from './types';

export type InputAttachmentTracker = {
  attachments: Accessor<InputAttachmentData[]>;
  hasPending: Accessor<boolean>;
  addAttachment: (attachment: InputAttachmentData) => void;
  removeAttachment: (attachmentId: string) => void;
  setAttachmentPending: (attachmentId: string, pending: boolean) => void;
  setAttachments: (attachments: InputAttachmentData[]) => void;
  clearAttachments: () => void;
  getUploadGeneration: () => string;
  isUploadGenerationCurrent: (generation: string) => boolean;
};

type CreateInputAttachmentTrackerOptions = {
  persistenceKey?: string;
  initialAttachments?: InputAttachmentData[];
  maxAttachments?: number;
};

export function createInputAttachmentTracker(
  options: CreateInputAttachmentTrackerOptions = {}
): InputAttachmentTracker {
  const raw = createSignal<InputAttachmentData[]>(
    options.initialAttachments ?? []
  );

  const [attachments, setAttachments] = options.persistenceKey
    ? makePersisted(raw, {
        name: options.persistenceKey,
        serialize: (data: InputAttachmentData[]) =>
          JSON.stringify(data.filter((a) => !a.pending)),
        deserialize: (data: string) =>
          (JSON.parse(data) as InputAttachmentData[]).filter((a) => !a.pending),
      })
    : raw;

  const maxAttachments = options.maxAttachments ?? 10;
  let localUploadGeneration = 'initial';
  const generationKey = options.persistenceKey
    ? `${options.persistenceKey}-upload-generation`
    : undefined;
  let fallbackAfterFailedWrite = false;
  let failedStoredGeneration: string | null | undefined;
  const getUploadGeneration = () => {
    if (generationKey) {
      try {
        const stored = localStorage.getItem(generationKey);
        if (fallbackAfterFailedWrite) {
          if (
            failedStoredGeneration === undefined ||
            stored === failedStoredGeneration
          )
            return localUploadGeneration;
          // A different tracker advanced the shared generation afterward.
          fallbackAfterFailedWrite = false;
        }
        return stored ?? localUploadGeneration;
      } catch {
        // In-memory generation still fences uploads if storage is unavailable.
      }
    }
    return localUploadGeneration;
  };
  const isUploadGenerationCurrent = (generation: string) =>
    generation === getUploadGeneration();

  const hasPending = createMemo(() =>
    attachments().some((attachment) => attachment.pending === true)
  );

  const addAttachment = (attachment: InputAttachmentData) => {
    setAttachments((current) => {
      if (current.some((item) => item.id === attachment.id)) return current;
      if (current.length >= maxAttachments) return current;
      return [...current, attachment];
    });
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((current) =>
      current.filter((attachment) => attachment.id !== attachmentId)
    );
  };

  const setAttachmentPending = (attachmentId: string, pending: boolean) => {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.id === attachmentId ? { ...attachment, pending } : attachment
      )
    );
  };

  const replaceAttachments = (nextAttachments: InputAttachmentData[]) => {
    setAttachments(nextAttachments);
  };

  const clearAttachments = () => {
    localUploadGeneration = crypto.randomUUID();
    if (generationKey) {
      let storedBeforeWrite: string | null | undefined;
      try {
        storedBeforeWrite = localStorage.getItem(generationKey);
        localStorage.setItem(generationKey, localUploadGeneration);
        fallbackAfterFailedWrite = false;
      } catch {
        // The local token must win over a stale stored token on write failure.
        failedStoredGeneration = storedBeforeWrite;
        fallbackAfterFailedWrite = true;
      }
    }
    setAttachments([]);
  };

  return {
    attachments,
    hasPending,
    addAttachment,
    removeAttachment,
    setAttachmentPending,
    setAttachments: replaceAttachments,
    clearAttachments,
    getUploadGeneration,
    isUploadGenerationCurrent,
  };
}

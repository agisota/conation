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

// A failed localStorage write still has to invalidate uploads from an earlier
// tracker instance with the same key (for example, after a composer remount).
const unpersistedUploadGenerations = new Map<
  string,
  { generation: string; storedBeforeClear: string | null | undefined }
>();

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
  const getUploadGeneration = () => {
    if (generationKey) {
      const fallback = unpersistedUploadGenerations.get(generationKey);
      try {
        const stored = localStorage.getItem(generationKey);
        if (fallback) {
          if (
            fallback.storedBeforeClear === undefined ||
            stored === fallback.storedBeforeClear
          )
            return fallback.generation;
          // Another tab or tracker advanced the persisted token after the failure.
          unpersistedUploadGenerations.delete(generationKey);
        }
        return stored ?? localUploadGeneration;
      } catch {
        if (fallback) return fallback.generation;
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
      let storedBeforeClear: string | null | undefined;
      try {
        storedBeforeClear = localStorage.getItem(generationKey);
        localStorage.setItem(generationKey, localUploadGeneration);
        unpersistedUploadGenerations.delete(generationKey);
      } catch {
        unpersistedUploadGenerations.set(generationKey, {
          generation: localUploadGeneration,
          storedBeforeClear,
        });
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

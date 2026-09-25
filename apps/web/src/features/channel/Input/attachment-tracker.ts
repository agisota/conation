import {
  type Accessor,
  createMemo,
  createSignal,
  getOwner,
  onCleanup,
} from 'solid-js';
import type { InputAttachmentData } from './types';

export type InputAttachmentTracker = {
  attachments: Accessor<InputAttachmentData[]>;
  hasPending: Accessor<boolean>;
  addAttachment: (attachment: InputAttachmentData) => void;
  removeAttachment: (attachmentId: string, generation?: string) => boolean;
  setAttachmentPending: (attachmentId: string, pending: boolean) => void;
  setAttachments: (attachments: InputAttachmentData[]) => void;
  replaceAttachment: (
    pendingId: string,
    attachment: InputAttachmentData,
    generation: string
  ) => void;
  clearAttachments: () => void;
  getUploadGeneration: () => string;
  isUploadGenerationCurrent: (generation: string) => boolean;
};

type CreateInputAttachmentTrackerOptions = {
  persistenceKey?: string;
  persistenceStorage?: Storage;
  initialAttachments?: InputAttachmentData[];
  maxAttachments?: number;
};

type PersistedAttachmentState = {
  generation: string;
  attachments: InputAttachmentData[];
};

type Listener = (state: PersistedAttachmentState) => void;

const INITIAL_GENERATION = 'initial';
const listenersByKey = new Map<string, Set<Listener>>();

function parsePersistedState(value: string | null): PersistedAttachmentState {
  if (!value) {
    return { generation: INITIAL_GENERATION, attachments: [] };
  }

  const parsed: unknown = JSON.parse(value);
  if (Array.isArray(parsed)) {
    return {
      generation: INITIAL_GENERATION,
      attachments: (parsed as InputAttachmentData[]).filter(
        (item) => !item.pending
      ),
    };
  }

  const state = parsed as Partial<PersistedAttachmentState>;
  return {
    generation:
      typeof state.generation === 'string'
        ? state.generation
        : INITIAL_GENERATION,
    attachments: Array.isArray(state.attachments)
      ? state.attachments.filter((item) => !item.pending)
      : [],
  };
}

function mergeAttachments(
  persisted: InputAttachmentData[],
  localPending: InputAttachmentData[]
): InputAttachmentData[] {
  const merged = new Map<string, InputAttachmentData>();
  for (const attachment of persisted) {
    merged.set(attachment.id, attachment);
  }
  for (const attachment of localPending) {
    if (!merged.has(attachment.id)) merged.set(attachment.id, attachment);
  }
  return [...merged.values()];
}

function notifyListeners(key: string, state: PersistedAttachmentState) {
  for (const listener of listenersByKey.get(key) ?? []) listener(state);
}

function newGeneration(): string {
  return crypto.randomUUID();
}

export function createInputAttachmentTracker(
  options: CreateInputAttachmentTrackerOptions = {}
): InputAttachmentTracker {
  const maxAttachments = options.maxAttachments ?? 10;
  let localGeneration = 0;
  const storage =
    options.persistenceStorage ??
    (typeof localStorage === 'undefined' ? undefined : localStorage);
  let persistedState: PersistedAttachmentState = {
    generation: INITIAL_GENERATION,
    attachments: options.initialAttachments ?? [],
  };
  if (options.persistenceKey && storage) {
    try {
      persistedState = parsePersistedState(
        storage.getItem(options.persistenceKey)
      );
    } catch {
      // Persistence must not prevent the composer from remaining editable.
    }
  }
  const [attachments, setAttachmentsSignal] = createSignal<
    InputAttachmentData[]
  >(
    options.persistenceKey && storage
      ? persistedState.attachments
      : (options.initialAttachments ?? persistedState.attachments)
  );

  const receivePersistedState = (incoming: PersistedAttachmentState) => {
    const localPending =
      incoming.generation === persistedState.generation
        ? attachments().filter((attachment) => attachment.pending)
        : [];
    persistedState = incoming;
    setAttachmentsSignal(mergeAttachments(incoming.attachments, localPending));
  };

  if (options.persistenceKey) {
    const key = options.persistenceKey;
    const listeners = listenersByKey.get(key) ?? new Set<Listener>();
    listeners.add(receivePersistedState);
    listenersByKey.set(key, listeners);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      const incoming = parsePersistedState(event.newValue);
      notifyListeners(key, incoming);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
    }

    if (getOwner()) {
      onCleanup(() => {
        listeners.delete(receivePersistedState);
        if (listeners.size === 0) listenersByKey.delete(key);
        if (typeof window !== 'undefined') {
          window.removeEventListener('storage', onStorage);
        }
      });
    }
  }

  const hasPending = createMemo(() =>
    attachments().some((attachment) => attachment.pending === true)
  );

  const readLatest = (): PersistedAttachmentState => {
    if (!options.persistenceKey) return persistedState;
    try {
      const value = storage?.getItem(options.persistenceKey);
      return value == null ? persistedState : parsePersistedState(value);
    } catch {
      return persistedState;
    }
  };
  const commit = (
    nextAttachments: InputAttachmentData[],
    generation = readLatest().generation
  ) => {
    const nextState = {
      generation,
      attachments: nextAttachments.filter((attachment) => !attachment.pending),
    };
    persistedState = nextState;
    setAttachmentsSignal(nextAttachments);
    if (options.persistenceKey && storage) {
      try {
        storage.setItem(options.persistenceKey, JSON.stringify(nextState));
      } catch {
        // Persistence must not prevent the composer from remaining editable.
      }
      notifyListeners(options.persistenceKey, nextState);
    }
  };

  const mutateLatest = (
    update: (current: InputAttachmentData[]) => InputAttachmentData[]
  ) => {
    const latest = readLatest();
    const current = mergeAttachments(
      latest.attachments,
      attachments().filter((attachment) => attachment.pending)
    );
    commit(update(current), latest.generation);
  };

  const addAttachment = (attachment: InputAttachmentData) => {
    mutateLatest((current) => {
      if (current.some((item) => item.id === attachment.id)) return current;
      if (current.length >= maxAttachments) return current;
      return [...current, attachment];
    });
  };

  const removeAttachment = (attachmentId: string, generation?: string) => {
    const latest = readLatest();
    if (generation && `${latest.generation}:${localGeneration}` !== generation)
      return false;
    const current = mergeAttachments(
      latest.attachments,
      attachments().filter((attachment) => attachment.pending)
    );
    commit(
      current.filter((attachment) => attachment.id !== attachmentId),
      latest.generation
    );
    return true;
  };

  const setAttachmentPending = (attachmentId: string, pending: boolean) => {
    mutateLatest((current) =>
      current.map((attachment) =>
        attachment.id === attachmentId ? { ...attachment, pending } : attachment
      )
    );
  };

  const replaceAllAttachments = (nextAttachments: InputAttachmentData[]) => {
    commit(nextAttachments);
  };

  const replaceAttachment = (
    pendingId: string,
    uploaded: InputAttachmentData,
    generation: string
  ) => {
    const latest = readLatest();
    if (`${latest.generation}:${localGeneration}` !== generation) return;
    const current = mergeAttachments(
      latest.attachments,
      attachments().filter((attachment) => attachment.pending)
    );
    const pendingIndex = current.findIndex(
      (attachment) => attachment.id === pendingId
    );
    if (pendingIndex === -1) {
      if (current.some((item) => item.id === uploaded.id)) return;
      if (current.length >= maxAttachments) return;
      commit([...current, uploaded], latest.generation);
      return;
    }
    const next = [...current];
    next[pendingIndex] = uploaded;
    commit(next, latest.generation);
  };

  const clearAttachments = () => {
    localGeneration += 1;
    commit([], options.persistenceKey ? newGeneration() : INITIAL_GENERATION);
  };

  const getUploadGeneration = () =>
    `${readLatest().generation}:${localGeneration}`;
  const isUploadGenerationCurrent = (generation: string) =>
    generation === getUploadGeneration();

  return {
    attachments,
    hasPending,
    addAttachment,
    removeAttachment,
    setAttachmentPending,
    setAttachments: replaceAllAttachments,
    replaceAttachment,
    clearAttachments,
    getUploadGeneration,
    isUploadGenerationCurrent,
  };
}

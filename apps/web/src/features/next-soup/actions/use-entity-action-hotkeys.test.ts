import type { EntityData } from '@entity';
import { createRoot } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntityActionListState } from './entity-action-context';

const mocks = vi.hoisted(() => {
  const registrations: Array<{
    hotkey: string[];
    keyDownHandler: () => boolean;
  }> = [];
  const deleteExecuteWithSoup = vi.fn();
  const inertAction = () => ({
    canExecute: vi.fn(() => false),
    execute: vi.fn(),
    executeWithSoup: vi.fn(),
  });
  return { registrations, deleteExecuteWithSoup, inertAction };
});

vi.mock('@core/hotkey/hotkeys', () => ({
  createHotkeyGroup: () => ({ dispose: vi.fn() }),
  registerHotkey: (registration: (typeof mocks.registrations)[number]) => {
    mocks.registrations.push(registration);
    return { withGroup: vi.fn() };
  },
}));
vi.mock('@core/context/user', () => ({ useUserId: () => () => 'macro|me' }));
vi.mock('@app/features/next-soup/utils', () => ({
  openEntityInSplitFromUnifiedList: vi.fn(),
}));
vi.mock('@components/app/split-layout/layoutUtils', () => ({
  returnSplitToRecentListView: vi.fn(),
}));
vi.mock('@service-storage/websocket', () => ({
  storageWS: { reconnectIfDisconnected: vi.fn() },
  createWebSocketJob: vi.fn(),
}));
vi.mock('@service-connection/websocket', () => ({
  ws: { addEventListener: vi.fn(), send: vi.fn() },
  state: () => 'closed',
  createConnectionBlockWebsocketEffect: vi.fn(),
  createConnectionWebsocketEffect: vi.fn(),
}));
vi.mock('@components/app/GlobalAppState', () => ({
  useGlobalNotificationSource: () => ({}),
}));
vi.mock('@app/features/property/editor/hooks/useAllProperties', () => ({
  useAllProperties: () => () => [],
}));
vi.mock('@app/features/property/editor/state/propertyEditor', () => ({
  openPropertyEditor: vi.fn(),
}));
vi.mock('@app/features/sharing/global-share-modal/shareable-entity', () => ({
  isShareableEntityType: () => false,
}));
vi.mock('@entity', () => ({ isTaskEntity: () => false }));
vi.mock('./index', () => ({
  makeAddTagAction: mocks.inertAction,
  makeCopyAction: mocks.inertAction,
  makeCopyBranchNameAction: mocks.inertAction,
  makeCopyEntityIdAction: mocks.inertAction,
  makeCopyLinkAction: mocks.inertAction,
  makeCreateReminderAction: mocks.inertAction,
  makeDeleteAction: () => ({
    canExecute: () => true,
    executeWithSoup: mocks.deleteExecuteWithSoup,
  }),
  makeEditReminderAction: mocks.inertAction,
  makeFavoriteAction: mocks.inertAction,
  makeMarkDoneAction: mocks.inertAction,
  makeMarkNotDoneAction: mocks.inertAction,
  makeMarkReadAction: mocks.inertAction,
  makeMarkUnreadAction: mocks.inertAction,
  makeMoveToProjectAction: mocks.inertAction,
  makeMuteAction: mocks.inertAction,
  makeRenameAction: mocks.inertAction,
  makeSetCompanyPropertyAction: mocks.inertAction,
  makeShareAction: mocks.inertAction,
  markReminderTargetDone: () => vi.fn(),
}));

import { useEntityActionHotkeys } from './use-entity-action-hotkeys';

const document = {
  type: 'document',
  id: 'sole-document',
  name: 'Sole document',
  ownerId: 'macro|me',
  fileType: 'md',
} as EntityData;

const list = {
  focus: { id: () => document.id, index: () => 0, set: vi.fn() },
  items: { count: () => 1, at: vi.fn(), get: vi.fn() },
  navigate: { peekOffset: vi.fn() },
  selection: { clear: vi.fn() },
  collapseEntity: { shouldCollapse: () => false, callback: vi.fn() },
} as EntityActionListState;

afterEach(() => {
  mocks.registrations.length = 0;
  vi.clearAllMocks();
});

describe('Home delete hotkey wiring', () => {
  it('passes the view-owned navigation handler to confirmed deletion', () => {
    const navigate = vi.fn();
    createRoot((dispose) => {
      useEntityActionHotkeys({
        scopeId: 'home',
        list,
        selectedEntities: () => [],
        focusedEntity: () => document,
        restoreFocus: vi.fn(),
        viewContext: () => ({
          supportsMarkDone: true,
          senderBucket: undefined,
        }),
        createActionNavigationHandler: () => navigate,
      });

      const deletion = mocks.registrations.find(({ hotkey }) =>
        hotkey.includes('delete')
      );
      expect(deletion?.keyDownHandler()).toBe(true);
      expect(mocks.deleteExecuteWithSoup).toHaveBeenCalledExactlyOnceWith(
        [document],
        list,
        navigate
      );
      dispose();
    });
  });
});

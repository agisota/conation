import type {
  EntityActionListState,
  EntityActionNavigationHandler,
} from '@app/features/next-soup/actions';
import type { EntityData } from '@entity';
import { createRoot } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const deleteExecuteWithSoup = vi.fn();
  const inertAction = () => ({
    canExecute: vi.fn(() => false),
    execute: vi.fn(),
    executeWithSoup: vi.fn(),
  });
  return { deleteExecuteWithSoup, inertAction };
});

vi.mock('@app/features/next-soup/actions', () => ({
  makeBlockSenderAction: mocks.inertAction,
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
  makeHideCompanyAction: mocks.inertAction,
  makeMarkDoneAction: mocks.inertAction,
  makeMarkNotDoneAction: mocks.inertAction,
  makeMarkNotificationsReadAction: mocks.inertAction,
  makeMarkReadAction: mocks.inertAction,
  makeMarkSenderNoiseAction: mocks.inertAction,
  makeMarkSenderSignalAction: mocks.inertAction,
  makeMarkUnreadAction: mocks.inertAction,
  makeMoveToProjectAction: mocks.inertAction,
  makeMuteAction: mocks.inertAction,
  makeRemoveFromProjectAction: mocks.inertAction,
  makeRenameAction: mocks.inertAction,
  makeSetCompanyPropertyAction: mocks.inertAction,
  makeShareAction: mocks.inertAction,
  markReminderTargetDone: () => vi.fn(),
}));
vi.mock('@app/features/next-soup/utils', () => ({
  markReminderSeenOnOpen: vi.fn(),
  openEntityInSplitFromUnifiedList: vi.fn(),
}));
vi.mock('@app/lib/analytics/analytics-context', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}));
vi.mock('@app/signal/splitLayout', () => ({
  globalSplitManager: () => undefined,
}));
vi.mock('@components/app/GlobalAppState', () => ({
  useGlobalNotificationSource: () => ({}),
}));
vi.mock('@components/app/split-layout/layoutUtils', () => ({
  returnSplitToRecentListView: vi.fn(),
}));
vi.mock('@core/constant/allBlocks', () => ({ itemToBlockName: () => 'md' }));
vi.mock('@core/context/user', () => ({ useUserId: () => () => 'macro|me' }));
vi.mock('@core/mobile/isMobile', () => ({ isMobile: () => false }));
vi.mock('@queries/crm/companies', () => ({
  useSetCompanyHiddenMutation: () => ({ mutateAsync: vi.fn() }),
}));

import { createSoupEntityActions } from './createSoupEntityActions';

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

afterEach(() => vi.clearAllMocks());

describe('Home menu and drawer delete wiring', () => {
  it.each(['desktop context menu', 'touch drawer'])(
    'passes the Home preview owner through the %s action group',
    (_surface) => {
      const navigate = vi.fn() as EntityActionNavigationHandler;
      createRoot((dispose) => {
        const { buildActionGroups } = createSoupEntityActions();
        const groups = buildActionGroups(list, [document], {
          viewContext: { supportsMarkDone: false, senderBucket: undefined },
          createActionNavigationHandler: () => navigate,
        });
        const deletion = groups
          .flatMap(({ items }) => items)
          .find(({ id }) => id === 'delete');

        deletion?.onClick();

        expect(mocks.deleteExecuteWithSoup).toHaveBeenCalledExactlyOnceWith(
          [document],
          list,
          navigate
        );
        dispose();
      });
    }
  );
});

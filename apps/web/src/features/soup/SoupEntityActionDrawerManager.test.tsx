import type {
  EntityActionListState,
  EntityActionNavigationHandler,
} from '@app/features/next-soup/actions';
import type { EntityData } from '@entity';
import { render } from '@solidjs/testing-library';
import { createEffect, onMount } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ buildActionGroups: vi.fn(() => []) }));

vi.mock('./createSoupEntityActions', () => ({
  createSoupEntityActions: () => ({
    buildActionGroups: mocks.buildActionGroups,
  }),
  viewedProjectIdFromContent: () => undefined,
}));
vi.mock('./SoupEntityActionDrawer', () => ({
  SoupEntityActionDrawer: (props: { groups: unknown }) => {
    createEffect(() => void props.groups);
    return null;
  },
}));
vi.mock('@core/component/TopBar/ShareButton', () => ({
  getShareDrawerRecipientInput: vi.fn(),
}));
vi.mock('@core/directive/focusInput', () => ({ triggerFocusInput: vi.fn() }));
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
vi.mock('@components/app/split-layout/layoutUtils', () => ({
  useSplitPanelOrThrow: () => ({
    handle: { content: () => ({ type: 'inbox', id: 'inbox' }) },
  }),
}));
vi.mock('@core/mobile/isMobile', () => ({ isMobile: () => true }));

import { useSoupEntityActionDrawer } from './SoupEntityActionDrawerContext';
import { MaybeSoupEntityActionDrawerManager } from './SoupEntityActionDrawerManager';

const document = {
  type: 'document',
  id: 'sole-document',
  fileType: 'md',
} as EntityData;
const list = {} as EntityActionListState;

afterEach(() => vi.clearAllMocks());

describe('MaybeSoupEntityActionDrawerManager', () => {
  it('forwards the Home preview owner from a long-press entry', () => {
    const createActionNavigationHandler = () =>
      vi.fn() as EntityActionNavigationHandler;

    function OpenDrawer() {
      const drawer = useSoupEntityActionDrawer();
      onMount(() =>
        drawer?.open({
          entity: document,
          list,
          viewContext: { supportsMarkDone: false, senderBucket: undefined },
          createActionNavigationHandler,
        })
      );
      return null;
    }

    render(() => (
      <MaybeSoupEntityActionDrawerManager>
        <OpenDrawer />
      </MaybeSoupEntityActionDrawerManager>
    ));

    expect(mocks.buildActionGroups).toHaveBeenCalledWith(
      list,
      [document],
      expect.objectContaining({ createActionNavigationHandler })
    );
  });
});

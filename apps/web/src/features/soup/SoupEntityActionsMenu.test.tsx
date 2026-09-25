import type {
  EntityActionListState,
  EntityActionNavigationHandler,
} from '@app/features/next-soup/actions';
import type { EntityData } from '@entity';
import { render } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ buildActionGroups: vi.fn(() => []) }));

vi.mock('./createSoupEntityActions', () => ({
  createSoupEntityActions: () => ({
    buildActionGroups: mocks.buildActionGroups,
  }),
  viewedProjectIdFromContent: () => undefined,
}));
vi.mock('@components/app/split-layout/layoutUtils', () => ({
  useSplitPanelOrThrow: () => ({
    handle: { content: () => ({ type: 'inbox', id: 'inbox' }) },
  }),
}));

import { SoupEntityActionsMenu } from './SoupEntityActionsMenu';

const document = {
  type: 'document',
  id: 'sole-document',
  fileType: 'md',
} as EntityData;
const list = {} as EntityActionListState;

afterEach(() => vi.clearAllMocks());

describe('SoupEntityActionsMenu', () => {
  it('forwards the Home preview owner to desktop action groups', () => {
    const createActionNavigationHandler = () =>
      vi.fn() as EntityActionNavigationHandler;

    render(() => (
      <SoupEntityActionsMenu
        entities={[document]}
        list={list}
        viewContext={{ supportsMarkDone: false, senderBucket: undefined }}
        createActionNavigationHandler={createActionNavigationHandler}
      />
    ));

    expect(mocks.buildActionGroups).toHaveBeenCalledWith(
      list,
      [document],
      expect.objectContaining({ createActionNavigationHandler })
    );
  });
});

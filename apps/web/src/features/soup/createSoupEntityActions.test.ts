import type * as DuplicateTaskModule from '@app/features/next-soup/actions/make-duplicate-as-task-action';
import type { EntityData } from '@entity';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@app/features/next-soup/actions', async () => {
  const { makeDuplicateAsTaskAction } = await vi.importActual<
    typeof DuplicateTaskModule
  >('@app/features/next-soup/actions/make-duplicate-as-task-action');
  const inactive = () => ({
    canExecute: () => false,
    executeWithSoup: async () => {},
    isFavorited: () => false,
    isMuted: () => false,
  });
  const names = [
    'makeBlockSenderAction',
    'makeCopyBranchNameAction',
    'makeCopyEntityIdAction',
    'makeCreateReminderAction',
    'makeDeleteAction',
    'makeEditReminderAction',
    'makeFavoriteAction',
    'makeHideCompanyAction',
    'makeMarkDoneAction',
    'makeMarkNotDoneAction',
    'makeMarkNotificationsReadAction',
    'makeMarkReadAction',
    'makeMarkSenderNoiseAction',
    'makeMarkSenderSignalAction',
    'makeMarkUnreadAction',
    'makeMoveToProjectAction',
    'makeMuteAction',
    'makeRemoveFromProjectAction',
    'makeRenameAction',
    'makeSetCompanyPropertyAction',
    'makeShareAction',
  ];
  return {
    ...Object.fromEntries(names.map((name) => [name, inactive])),
    makeDuplicateAsTaskAction,
    makeCopyAction: () => ({
      canExecute: (entity: EntityData) => entity.type === 'document',
    }),
    makeCopyLinkAction: () => ({
      canExecute: (entity: EntityData) => entity.type === 'document',
    }),
    markReminderTargetDone: () => () => {},
  };
});
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
  useGlobalNotificationSource: () => undefined,
}));
vi.mock('@core/constant/allBlocks', () => ({ itemToBlockName: vi.fn() }));
vi.mock('@core/context/user', () => ({ useUserId: () => 'test-user' }));
vi.mock('@core/mobile/isMobile', () => ({ isMobile: () => true }));
vi.mock('@queries/crm/companies', () => ({
  useSetCompanyHiddenMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@service-sync/client', () => ({
  syncServiceClient: { getRaw: vi.fn() },
}));
vi.mock(
  '@core/component/LexicalMarkdown/context/LexicalWrapperContext',
  () => ({
    createLexicalWrapper: vi.fn(),
  })
);
vi.mock('@core/component/LexicalMarkdown/utils', () => ({
  editorStateAsMarkdown: vi.fn(),
  initializeEditorWithState: vi.fn(),
}));
vi.mock('@core/component/Toast/Toast', () => ({
  toast: { success: vi.fn(), failure: vi.fn() },
}));
vi.mock('@core/util/create', () => ({ createTask: vi.fn() }));

import { createSoupEntityActions } from './createSoupEntityActions';

const markdownDocument = {
  id: 'document-1',
  type: 'document',
  fileType: 'md',
  subType: null,
} as EntityData;
const viewContext = {
  supportsMarkDone: false,
  senderBucket: undefined,
} as const;
const soup = { selection: { clear: vi.fn() } } as never;

function actionIds(entities: EntityData[]): string[] {
  return createSoupEntityActions()
    .buildActionGroups(soup, entities, { viewContext })
    .flatMap(({ items }) => items.map(({ id }) => id));
}

describe('Duplicate as Task menu eligibility', () => {
  it('places the action between ordinary Duplicate and Copy Link for one ordinary Markdown document', () => {
    const ids = actionIds([markdownDocument]);
    expect(ids).toContain('duplicate');
    expect(
      ids.slice(ids.indexOf('duplicate'), ids.indexOf('copy-link') + 1)
    ).toEqual(['duplicate', 'duplicate-as-task', 'copy-link']);
  });

  it.each([
    ['task', { ...markdownDocument, subType: { type: 'task' } }],
    ['snippet', { ...markdownDocument, subType: { type: 'snippet' } }],
    ['skill', { ...markdownDocument, subType: { type: 'skill' } }],
    [
      'unclassified document',
      { ...markdownDocument, subType: { type: 'other' } },
    ],
    ['PDF document', { ...markdownDocument, fileType: 'pdf' }],
    ['email', { ...markdownDocument, type: 'email' }],
  ])('keeps normal actions but excludes ineligible %s', (_name, entity) => {
    const ids = actionIds([entity as EntityData]);
    expect(ids).not.toContain('duplicate-as-task');
    if (entity.type === 'document') expect(ids).toContain('duplicate');
  });

  it('accepts a Markdown document with an absent subtype', () => {
    expect(actionIds([{ ...markdownDocument, subType: undefined }])).toContain(
      'duplicate-as-task'
    );
  });

  it('excludes the action for empty and multi-selections without losing ordinary Duplicate', () => {
    expect(actionIds([])).not.toContain('duplicate-as-task');
    const ids = actionIds([
      markdownDocument,
      { ...markdownDocument, id: 'document-2' },
    ]);
    expect(ids).toContain('duplicate');
    expect(ids).not.toContain('duplicate-as-task');
  });
});

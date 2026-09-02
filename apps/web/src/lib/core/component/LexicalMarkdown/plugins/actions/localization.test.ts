import { setLocale } from '@core/i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/signal/splitLayout', () => ({
  globalSplitManager: () => undefined,
}));
vi.mock('@core/signal/mention', () => ({
  trackMention: vi.fn(),
}));
vi.mock('@conation/lexical-core', () => ({
  $createDocumentMentionNode: vi.fn(),
  AwaitNode: class AwaitNode {},
  CustomCodeNode: class CustomCodeNode {},
  DocumentMentionNode: class DocumentMentionNode {},
  EquationNode: class EquationNode {},
  HorizontalRuleNode: class HorizontalRuleNode {},
  ImageNode: class ImageNode {},
  VideoNode: class VideoNode {},
}));
vi.mock('@lexical/link', () => ({ LinkNode: class LinkNode {} }));
vi.mock('@lexical/list', () => ({ ListNode: class ListNode {} }));
vi.mock('@lexical/rich-text', () => ({
  HeadingNode: class HeadingNode {},
  QuoteNode: class QuoteNode {},
}));
vi.mock('@lexical/table', () => ({
  INSERT_TABLE_COMMAND: Symbol('INSERT_TABLE_COMMAND'),
  TableNode: class TableNode {},
}));
vi.mock('../await', () => ({
  INSERT_AWAIT_NODE_COMMAND: Symbol('INSERT_AWAIT_NODE_COMMAND'),
  REPLACE_AWAIT_NODE_COMMAND: Symbol('REPLACE_AWAIT_NODE_COMMAND'),
}));
vi.mock('../horizontal-rules/horizontalRulePlugin', () => ({
  INSERT_HORIZONTAL_RULE_COMMAND: Symbol('INSERT_HORIZONTAL_RULE_COMMAND'),
}));
vi.mock('../katex', () => ({
  TRY_INSERT_EQUATION_COMMAND: Symbol('TRY_INSERT_EQUATION_COMMAND'),
}));
vi.mock('../links', () => ({
  TRY_INSERT_LINK_COMMAND: Symbol('TRY_INSERT_LINK_COMMAND'),
}));
vi.mock('../media', () => ({
  TRY_INSERT_MEDIA_UPLOAD_COMMAND: Symbol('TRY_INSERT_MEDIA_UPLOAD_COMMAND'),
}));
vi.mock('../mentions/mentionsPlugin', () => ({
  INSERT_DOCUMENT_MENTION_COMMAND: Symbol('INSERT_DOCUMENT_MENTION_COMMAND'),
}));
vi.mock('../node-transform', () => ({
  NODE_TRANSFORM: Symbol('NODE_TRANSFORM'),
}));
vi.mock('../tables', () => ({
  TRY_INSERT_TABLE_PICKER_COMMAND: Symbol('TRY_INSERT_TABLE_PICKER_COMMAND'),
}));

import { ACTIONS } from './actions';

afterEach(() => setLocale('en'));

describe('slash action localization', () => {
  it('resolves labels from the current locale without reloading the module', () => {
    const paragraph = ACTIONS.find((action) => action.id === 'paragraph');
    expect(paragraph).toBeDefined();

    setLocale('en');
    expect(paragraph?.name).toBe('Normal text');

    setLocale('ru');
    expect(paragraph?.name).toBe('Обычный текст');
  });

  it('keeps stable action identifiers and search keywords across locales', () => {
    const before = ACTIONS.map(({ id, keywords }) => ({ id, keywords }));
    setLocale('ru');
    expect(ACTIONS.map(({ id, keywords }) => ({ id, keywords }))).toEqual(
      before
    );
  });
});

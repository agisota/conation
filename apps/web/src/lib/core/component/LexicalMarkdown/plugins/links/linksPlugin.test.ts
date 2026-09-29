import type { LexicalEditor } from 'lexical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  findNextAutoLinkMatch,
  linksPlugin,
  normalizeLinkUrl,
} from './linksPlugin';

const open = vi.hoisted(() => vi.fn());
vi.mock('@core/util/url', () => ({ openExternalUrl: open }));

afterEach(() => vi.clearAllMocks());

describe('normalizeLinkUrl', () => {
  it('normalizes bare hosts to HTTPS', () => {
    expect(normalizeLinkUrl(' example.com/path with spaces ')).toBe(
      'https://example.com/path%20with%20spaces'
    );
  });

  it('allows HTTP, HTTPS, and mailto links', () => {
    expect(normalizeLinkUrl('http://example.com/path')).toBe(
      'http://example.com/path'
    );
    expect(normalizeLinkUrl('https://example.com/path')).toBe(
      'https://example.com/path'
    );
    expect(normalizeLinkUrl('mailto:user@example.com')).toBe(
      'mailto:user@example.com'
    );
  });

  it.each([
    'javascript://alert(1)',
    'javascript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html,unsafe',
    'file:///tmp/secret',
    'ftp://example.com',
  ])('rejects a disallowed URL scheme: %s', (url) => {
    expect(normalizeLinkUrl(url)).toBeNull();
  });

  it('rejects empty and malformed URLs', () => {
    expect(normalizeLinkUrl('')).toBeNull();
    expect(normalizeLinkUrl('https://')).toBeNull();
  });
});

describe('findNextAutoLinkMatch', () => {
  it('requires a protocol in protocol mode', () => {
    expect(findNextAutoLinkMatch('Visit example.com')).toBeNull();
    expect(findNextAutoLinkMatch('Visit https://example.rs')?.url).toBe(
      'https://example.rs'
    );
  });

  it('matches common bare TLDs in common-tlds mode', () => {
    expect(findNextAutoLinkMatch('Visit example.com', 'common-tlds')?.url).toBe(
      'https://example.com'
    );
    expect(findNextAutoLinkMatch('Visit macro.co', 'common-tlds')?.url).toBe(
      'https://macro.co'
    );
    expect(findNextAutoLinkMatch('Visit example.org', 'common-tlds')?.url).toBe(
      'https://example.org'
    );
  });

  it('does not match file-like non-curated TLDs in common-tlds mode', () => {
    expect(findNextAutoLinkMatch('Open main.rs', 'common-tlds')).toBeNull();
    expect(findNextAutoLinkMatch('Open parser.ts', 'common-tlds')).toBeNull();
    expect(findNextAutoLinkMatch('Open types.d.ts', 'common-tlds')).toBeNull();
  });

  it('keeps fuzzy mode available for callers that want broader matching', () => {
    expect(findNextAutoLinkMatch('Visit example.rs', 'fuzzy')?.url).toBe(
      'https://example.rs'
    );
  });
});

it('routes trusted read-only links to the destination menu instead of navigating', () => {
  const url = 'https://www.openstreetmap.org/#map=14/56.8139/-5.0650&layers=C';
  const root = document.createElement('div');
  root.innerHTML = `<a href="${url}">map</a>`;
  let attachRoot:
    | ((root: HTMLElement | null, previousRoot: HTMLElement | null) => void)
    | undefined;
  const editor = {
    isEditable: () => false,
    registerRootListener: (listener: typeof attachRoot) => {
      attachRoot = listener;
      return () => {};
    },
    registerNodeTransform: () => () => {},
    registerCommand: () => () => {},
  } as unknown as LexicalEditor;
  const onClickLink = vi.fn();
  const cleanupPlugin = linksPlugin({ onClickLink })(editor);
  attachRoot?.(root, null);
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  root.querySelector('a')?.dispatchEvent(event);

  expect(event.defaultPrevented).toBe(true);
  expect(onClickLink).toHaveBeenCalledWith(
    expect.objectContaining({ editAccess: false, url, linkText: 'map' })
  );
  expect(open).not.toHaveBeenCalled();
  cleanupPlugin();
});

it('keeps ordinary read-only links directly openable', () => {
  const url = 'https://example.com/document';
  const root = document.createElement('div');
  root.innerHTML = `<a href="${url}">document</a>`;
  let attachRoot:
    | ((root: HTMLElement | null, previousRoot: HTMLElement | null) => void)
    | undefined;
  const editor = {
    isEditable: () => false,
    registerRootListener: (listener: typeof attachRoot) => {
      attachRoot = listener;
      return () => {};
    },
    registerNodeTransform: () => () => {},
    registerCommand: () => () => {},
  } as unknown as LexicalEditor;
  const onClickLink = vi.fn();
  const cleanupPlugin = linksPlugin({ onClickLink })(editor);
  attachRoot?.(root, null);
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  root.querySelector('a')?.dispatchEvent(event);

  expect(event.defaultPrevented).toBe(true);
  expect(onClickLink).not.toHaveBeenCalled();
  expect(open).toHaveBeenCalledWith(url);
  cleanupPlugin();
});

it.each([
  ['Meta', { metaKey: true }],
  ['Control', { ctrlKey: true }],
  ['Shift', { shiftKey: true }],
])(
  'opens a link directly on %s-click instead of showing the menu',
  (_, modifiers) => {
    const url =
      'https://www.openstreetmap.org/#map=14/56.8139/-5.0650&layers=C';
    const root = document.createElement('div');
    root.innerHTML = `<a href="${url}">map</a>`;
    let attachRoot:
      | ((root: HTMLElement | null, previousRoot: HTMLElement | null) => void)
      | undefined;
    const editor = {
      isEditable: () => false,
      registerRootListener: (listener: typeof attachRoot) => {
        attachRoot = listener;
        return () => {};
      },
      registerNodeTransform: () => () => {},
      registerCommand: () => () => {},
    } as unknown as LexicalEditor;
    const onClickLink = vi.fn();
    const cleanupPlugin = linksPlugin({ onClickLink })(editor);
    attachRoot?.(root, null);
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      ...modifiers,
    });
    root.querySelector('a')?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onClickLink).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(url);
    cleanupPlugin();
  }
);

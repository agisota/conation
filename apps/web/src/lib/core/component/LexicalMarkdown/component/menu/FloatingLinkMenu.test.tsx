import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library';
import type { ParentProps } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import type { LexicalWrapper } from '../../context/LexicalWrapperContext';

const open = vi.hoisted(() => vi.fn());
const registered = vi.hoisted(() => ({
  onClickLink: undefined as
    | ((link?: {
        editAccess: boolean;
        linkRef?: HTMLElement;
        url?: string;
        linkText?: string;
      }) => void)
    | undefined,
}));
vi.mock('@core/util/url', () => ({
  openExternalUrl: open,
}));
vi.mock('@core/component/ScopedPortal', () => ({
  ScopedPortal: (props: ParentProps) => props.children,
}));
vi.mock('@core/directive/clickOutside', () => ({ default: () => {} }));
vi.mock('../../directive/floatWithElement', () => ({
  floatWithElement: () => {},
}));
vi.mock('../../directive/floatWithSelection', () => ({
  floatWithSelection: () => {},
}));
vi.mock('@core/signal/unfurl', () => ({
  useUnfurl: () => [() => ({ type: 'failure' })],
}));
vi.mock('@ui', () => ({
  Button: (props: {
    children?: ParentProps['children'];
    onClick?: () => void;
    tabIndex?: number;
    disabled?: boolean;
    tooltip?: string;
  }) => (
    <button
      aria-label={props.tooltip}
      onClick={props.onClick}
      tabIndex={props.tabIndex}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  ),
  Surface: (props: ParentProps) => <div>{props.children}</div>,
  cn: (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' '),
}));
vi.mock('../../plugins', () => ({
  INSERT_LINK_COMMAND: {},
  UNLINK_COMMAND: {},
  UPDATE_LINK_COMMAND: {},
  UPDATE_LINK_URL_COMMAND: {},
  linksPlugin: (handlers: typeof registered) => {
    registered.onClickLink = handlers.onClickLink;
    return () => () => {};
  },
}));

import { FloatingLinkMenu } from './FloatingLinkMenu';
import { FloatingMenuGroup } from '../../context/FloatingMenuContext';
import { LexicalWrapperContext } from '../../context/LexicalWrapperContext';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  registered.onClickLink = undefined;
});

it('offers read-only destination actions without exposing link editing', () => {
  const editor = {
    dispatchCommand: vi.fn(),
    focus: vi.fn(),
    getRootElement: () => null,
    registerCommand: () => () => {},
  };
  const wrapper = {
    editor,
    plugins: { use: vi.fn() },
  } as unknown as LexicalWrapper;
  const url = 'https://www.openstreetmap.org/#map=14/56.8139/-5.0650&layers=C';

  render(() => (
    <LexicalWrapperContext.Provider value={wrapper}>
      <FloatingMenuGroup>
        <FloatingLinkMenu />
      </FloatingMenuGroup>
    </LexicalWrapperContext.Provider>
  ));

  registered.onClickLink?.({
    editAccess: false,
    linkRef: document.createElement('a'),
    linkText: 'map',
    url,
  });

  const action = screen.getByRole('button', { name: 'Open in Maps' });
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(action);
  expect(open).toHaveBeenCalledWith(url);
});

it('moves keyboard focus to the external action and does not submit read-only links on Enter', async () => {
  const editor = {
    dispatchCommand: vi.fn(),
    focus: vi.fn(),
    getRootElement: () => null,
    registerCommand: () => () => {},
  };
  const wrapper = {
    editor,
    plugins: { use: vi.fn() },
  } as unknown as LexicalWrapper;
  const url = 'https://www.openstreetmap.org/#map=14/56.8139/-5.0650&layers=C';

  render(() => (
    <LexicalWrapperContext.Provider value={wrapper}>
      <FloatingMenuGroup>
        <FloatingLinkMenu />
      </FloatingMenuGroup>
    </LexicalWrapperContext.Provider>
  ));

  registered.onClickLink?.({
    editAccess: false,
    linkRef: document.createElement('a'),
    linkText: 'map',
    url,
  });

  const action = screen.getByRole('button', { name: 'Open in Maps' });
  await waitFor(() => expect(document.activeElement).toBe(action));

  const enter = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Enter',
  });
  action.dispatchEvent(enter);

  expect(enter.defaultPrevented).toBe(false);
  expect(screen.getByRole('button', { name: 'Open in Maps' })).toBe(action);
  expect(editor.dispatchCommand).not.toHaveBeenCalled();
  fireEvent.click(action);
  expect(open).toHaveBeenCalledWith(url);
});

it('keeps clipped Apply controls out of keyboard tab order and hides read-only edit actions', () => {
  const editor = {
    dispatchCommand: vi.fn(),
    focus: vi.fn(),
    getRootElement: () => null,
    registerCommand: () => () => {},
  };
  const wrapper = {
    editor,
    plugins: { use: vi.fn() },
  } as unknown as LexicalWrapper;
  render(() => (
    <LexicalWrapperContext.Provider value={wrapper}>
      <FloatingMenuGroup>
        <FloatingLinkMenu />
      </FloatingMenuGroup>
    </LexicalWrapperContext.Provider>
  ));

  registered.onClickLink?.({
    editAccess: true,
    linkRef: document.createElement('a'),
    linkText: 'editable link',
    url: 'https://example.com',
  });

  const apply = screen.getByRole('button', { name: 'Apply link changes' });
  expect(apply.tabIndex).toBe(-1);
  fireEvent.click(screen.getByRole('button', { name: 'Edit link' }));
  expect(apply.tabIndex).toBe(0);

  cleanup();
  render(() => (
    <LexicalWrapperContext.Provider value={wrapper}>
      <FloatingMenuGroup>
        <FloatingLinkMenu />
      </FloatingMenuGroup>
    </LexicalWrapperContext.Provider>
  ));
  registered.onClickLink?.({
    editAccess: false,
    linkRef: document.createElement('a'),
    linkText: 'map',
    url: 'https://www.openstreetmap.org/#map=14/56.8139/-5.0650&layers=C',
  });

  expect(screen.queryByRole('button', { name: 'Apply link changes' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit link' })).toBeNull();
  expect(screen.queryByRole('textbox')).toBeNull();
});

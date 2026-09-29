import {
  cleanup,
  fireEvent,
  render,
  screen,
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
  Button: () => null,
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

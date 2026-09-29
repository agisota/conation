import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import type { JSX } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AutomationComposer,
  setAutomationComposerOpen,
} from './AutomationComposer';

const mocks = vi.hoisted(() => ({ create: vi.fn(), openWithSplit: vi.fn() }));

vi.mock('@components/app/split-layout/layout', () => ({
  useSplitLayout: () => ({ openWithSplit: mocks.openWithSplit }),
}));
vi.mock('@core/component/AI/constant', () => ({
  DEFAULT_MODEL: 'claude-sonnet-4-6',
}));
vi.mock('@core/constant/allBlocks', () => ({
  blockNameToDefaultFile: () => 'New automation',
}));
vi.mock('@core/component/Toast/Toast', () => ({
  toast: { alert: vi.fn(), success: vi.fn() },
}));
vi.mock('@core/directive/clickOutside', () => ({ default: () => {} }));
vi.mock('@queries/agent-schedule/schedules', () => ({
  useCreateScheduleMutation: () => ({ mutate: mocks.create, isPending: false }),
}));
vi.mock('@ui', () => {
  const Button = (props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  );
  const Dialog = Object.assign(
    (props: { children: JSX.Element }) => props.children,
    {
      Title: (props: { children: JSX.Element }) => <div>{props.children}</div>,
      CloseButton: (props: { children: JSX.Element; onClick?: () => void }) => (
        <button onClick={props.onClick}>{props.children}</button>
      ),
    }
  );
  return {
    Button,
    cn: (...classes: string[]) => classes.join(' '),
    Dialog,
    Surface: (props: { children: JSX.Element }) => <div>{props.children}</div>,
  };
});
vi.mock('./AutomationPromptEditor', () => ({
  AutomationPromptEditor: (props: {
    initialValue: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Instructions"
      value={props.initialValue}
      onInput={(event) => props.onChange(event.currentTarget.value)}
    />
  ),
}));

describe('AutomationComposer controlled time', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    setAutomationComposerOpen(false, false);
  });

  afterEach(() => {
    cleanup();
    setAutomationComposerOpen(false, false);
    localStorage.clear();
    vi.useRealTimers();
  });

  it('keeps the real picker controlled, persists canonical time, and creates the edited schedule', async () => {
    render(() => <AutomationComposer />);
    setAutomationComposerOpen(true, false);
    fireEvent.input(screen.getByRole('textbox', { name: 'Instructions' }), {
      target: { value: 'Summarize updates' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^9:00 AM$/i }));
    const minute = screen.getByRole('textbox', { name: 'Minute' });
    fireEvent.input(minute, { target: { value: '3' } });
    expect(minute).toHaveProperty('value', '3');
    fireEvent.input(minute, { target: { value: '30' } });
    expect(minute).toHaveProperty('value', '30');
    await vi.advanceTimersByTimeAsync(300);

    expect(
      JSON.parse(localStorage.getItem('automation-composer-draft')!).draft.time
    ).toBe('09:30');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({
          type: 'cron',
          schedule: '0 30 9 * * 2,3,4,5,6',
        }),
      })
    );
  });
});

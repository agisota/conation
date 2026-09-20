/**
 * @vitest-environment jsdom
 */

import {
  MODEL_PRETTYNAME,
  Model,
  type TModel,
} from '@core/component/AI/constant';
import { fireEvent, render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import { type ModelOption, ModelSelector } from './ModelSelector';

// Render the Kobalte dropdown as a transparent passthrough so the menu items
// are always in the DOM — we're testing ModelSelector's own logic (which models
// render, lock state, and select vs. unavailable routing), not the dropdown primitive.
vi.mock('@ui', () => {
  const cn = (...args: unknown[]) =>
    args.flat(Infinity).filter(Boolean).join(' ');
  const Dropdown: any = (p: any) => <div>{p.children}</div>;
  Dropdown.Trigger = (p: any) => (
    <button type="button" data-trigger class={p.class}>
      {p.children}
    </button>
  );
  Dropdown.Content = (p: any) => <div>{p.children}</div>;
  Dropdown.Group = (p: any) => <div>{p.children}</div>;
  Dropdown.Item = (p: any) => (
    <div role="menuitem" class={p.class} onClick={() => p.onSelect?.()}>
      {p.children}
    </div>
  );
  return { cn, Dropdown };
});

// Neutralize SVG imports; tag the lock so we can assert it renders.
vi.mock('@icon/wide-claude.svg', () => ({
  default: () => null,
}));
vi.mock('@core/component/AI/assets/openai.svg', () => ({
  default: () => null,
}));
vi.mock('@phosphor-icons/core/regular/caret-down.svg?component-solid', () => ({
  default: () => null,
}));
vi.mock('@phosphor-icons/core/regular/lock-simple.svg?component-solid', () => ({
  default: () => <span data-testid="lock-icon" />,
}));

const ALL_AVAILABLE: ModelOption[] = (Object.values(Model) as TModel[]).map(
  (id) => ({ id, available: true })
);

/** Find the menu item row for a model by its pretty name. */
function itemFor(container: HTMLElement, model: TModel): HTMLElement {
  const rows = Array.from(
    container.querySelectorAll('[role="menuitem"]')
  ) as HTMLElement[];
  const row = rows.find((r) =>
    r.textContent?.includes(MODEL_PRETTYNAME[model])
  );
  if (!row) throw new Error(`no menu item for ${model}`);
  return row;
}

describe('ModelSelector: availability', () => {
  it('lists every provided model', () => {
    const { container } = render(() => (
      <ModelSelector models={ALL_AVAILABLE} onSelect={() => {}} />
    ));
    expect(container.querySelectorAll('[role="menuitem"]')).toHaveLength(
      ALL_AVAILABLE.length
    );
  });

  it('grays out and locks inaccessible models, leaving accessible ones clean', () => {
    const options: ModelOption[] = (Object.values(Model) as TModel[]).map(
      (id) => ({ id, available: id !== Model.opus5 })
    );
    const { container } = render(() => (
      <ModelSelector models={options} onSelect={() => {}} />
    ));

    const available = itemFor(container, Model.haiku45);
    expect(available.className).not.toContain('opacity-50');
    expect(available.querySelector('[data-testid="lock-icon"]')).toBeNull();

    const locked = itemFor(container, Model.opus5);
    expect(locked.className).toContain('opacity-50');
    expect(locked.querySelector('[data-testid="lock-icon"]')).not.toBeNull();
  });
});

describe('ModelSelector: selection routing', () => {
  it('selecting an available model calls onSelect, not onLocked', () => {
    const onSelect = vi.fn();
    const onLocked = vi.fn();
    const { container } = render(() => (
      <ModelSelector
        models={ALL_AVAILABLE}
        onSelect={onSelect}
        onLocked={onLocked}
      />
    ));

    fireEvent.click(itemFor(container, Model.gpt56));
    expect(onSelect).toHaveBeenCalledWith(Model.gpt56);
    expect(onLocked).not.toHaveBeenCalled();
  });

  it('selecting an unavailable model calls onLocked, not onSelect', () => {
    const onSelect = vi.fn();
    const onLocked = vi.fn();
    const options: ModelOption[] = (Object.values(Model) as TModel[]).map(
      (id) => ({ id, available: id !== Model.opus5 })
    );
    const { container } = render(() => (
      <ModelSelector models={options} onSelect={onSelect} onLocked={onLocked} />
    ));

    fireEvent.click(itemFor(container, Model.opus5));
    expect(onLocked).toHaveBeenCalledWith(Model.opus5);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('ModelSelector: what is shown is what is sent', () => {
  // The selector's trigger and the message it would send both read the same
  // model accessor. Picking a model updates that single source, so the request
  // can never diverge from what the selector displays.
  function Harness() {
    const [model, setModel] = createSignal<TModel>(Model.opus5);
    return (
      <>
        {/* stand-in for the value sendMessage() reads */}
        <span data-testid="would-send">{model()}</span>
        <ModelSelector
          selectedModel={model()}
          models={ALL_AVAILABLE}
          onSelect={setModel}
        />
      </>
    );
  }

  it('reflects the selected model in the trigger and in the would-send value', () => {
    const { container, getByTestId } = render(() => <Harness />);

    // Initial state: trigger shows the selected model.
    const trigger = container.querySelector('[data-trigger]')!;
    expect(trigger.textContent).toContain(MODEL_PRETTYNAME[Model.opus5]);
    expect(getByTestId('would-send').textContent).toBe(Model.opus5);

    // Select a different model -> both the trigger and the would-send value move
    // together to exactly that model.
    fireEvent.click(itemFor(container, Model.sonnet5));
    expect(getByTestId('would-send').textContent).toBe(Model.sonnet5);
    expect(trigger.textContent).toContain(MODEL_PRETTYNAME[Model.sonnet5]);
  });

  it('an unavailable option cannot become the would-send value', () => {
    const onLocked = vi.fn();
    const options: ModelOption[] = (Object.values(Model) as TModel[]).map(
      (id) => ({ id, available: id !== Model.opus5 })
    );
    function AvailabilityHarness() {
      const [model, setModel] = createSignal<TModel>(Model.haiku45);
      return (
        <>
          <span data-testid="would-send">{model()}</span>
          <ModelSelector
            selectedModel={model()}
            models={options}
            onSelect={setModel}
            onLocked={onLocked}
          />
        </>
      );
    }
    const { container, getByTestId } = render(() => <AvailabilityHarness />);

    fireEvent.click(itemFor(container, Model.opus5)); // locked
    // The would-send value is unchanged; only the unavailable callback fired.
    expect(getByTestId('would-send').textContent).toBe(Model.haiku45);
    expect(onLocked).toHaveBeenCalledWith(Model.opus5);
  });
});

// GAP / out of unit scope: the on-mount reconcile that forces a *persisted or
// chat-provided* unknown model down to the universal default lives in
// ChatInput's effect (src/lib/core/.../input/ChatInput.tsx), and the
// stored-draft > chat-model > default precedence lives in Chat.tsx (block-chat,
// outside this test runner's projects). Both are exercised here only indirectly
// via the selector's availability contract. Cover them with a ChatInput-level
// render test (heavy: editor/markdown/upload mocks) when that harness exists.
it.todo(
  'ChatInput reconciles a persisted/chat unknown model down to the default on mount'
);

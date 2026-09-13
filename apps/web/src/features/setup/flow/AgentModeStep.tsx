import { t } from '@app/lib/i18n';
import { Button } from '@ui';
import { createEffect, createSignal, For } from 'solid-js';
import {
  AGENT_MODES,
  type AgentMode,
} from '../../block-agent/agent-mode-prefs';
import { useAgentModePrefs } from '../../block-agent/context/use-agent-mode-prefs';
import { ContinueButton } from './shared';

const MODE_COPY: Record<AgentMode, { title: string; hint: string }> = {
  yolo: {
    title: 'setup.agentMode.yolo.title',
    hint: 'setup.agentMode.yolo.hint',
  },
  task: {
    title: 'setup.agentMode.task.title',
    hint: 'setup.agentMode.task.hint',
  },
  control: {
    title: 'setup.agentMode.control.title',
    hint: 'setup.agentMode.control.hint',
  },
};

/** Default agent permission policy for new sessions. */
export function AgentModeStep(props: { onContinue: () => void }) {
  const prefs = useAgentModePrefs();
  const [mode, setMode] = createSignal<AgentMode>('yolo');
  const [hydrated, setHydrated] = createSignal(false);

  createEffect(() => {
    const loaded = prefs.loaded();
    if (loaded === undefined || hydrated()) return;
    setMode(loaded);
    setHydrated(true);
  });

  return (
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-2">
        <For each={AGENT_MODES}>
          {(option) => (
            <Button
              type="button"
              variant="ghost"
              class="flex h-auto flex-col items-start gap-1 rounded-xl border border-ink/20 px-4 py-3 text-left ring-1 ring-ink/10"
              classList={{
                'border-ink/60 ring-ink/40': mode() === option,
              }}
              onClick={() => setMode(option)}
            >
              <span class="text-sm font-medium text-ink">
                {t(MODE_COPY[option].title)}
              </span>
              <span class="text-xs text-ink-muted">
                {t(MODE_COPY[option].hint)}
              </span>
            </Button>
          )}
        </For>
      </div>
      <ContinueButton
        onClick={() => {
          prefs.persist(mode());
          props.onContinue();
        }}
      />
    </div>
  );
}

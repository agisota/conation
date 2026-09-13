import { t } from '@app/lib/i18n';
import CaretDown from '@phosphor-icons/core/regular/caret-down.svg?component-solid';
import { cn, Dropdown } from '@ui';
import { For, Show } from 'solid-js';
import { AGENT_MODES, type AgentMode } from '../agent-mode-prefs';

const MODE_LABEL: Record<AgentMode, string> = {
  yolo: 'agent.mode.yolo',
  task: 'agent.mode.task',
  control: 'agent.mode.control',
};

export function AgentModeSelector(props: {
  value: AgentMode;
  disabled?: boolean;
  onSelect: (mode: AgentMode) => void;
  onApplyToAll?: (mode: AgentMode) => void;
}) {
  return (
    <Dropdown placement="top-start">
      <Dropdown.Trigger
        variant="ghost"
        size="sm"
        class="h-6 gap-1 rounded-full bg-ink/5 px-2 text-xs text-ink-muted hover:bg-ink/10"
        disabled={props.disabled}
      >
        <span>{t(MODE_LABEL[props.value])}</span>
        <CaretDown />
      </Dropdown.Trigger>
      <Dropdown.Content>
        <Dropdown.Group>
          <For each={AGENT_MODES}>
            {(option) => (
              <Dropdown.Item
                class={cn(
                  'gap-2',
                  option === props.value && 'text-ink font-medium'
                )}
                onSelect={() => props.onSelect(option)}
              >
                <span class="flex-1 truncate text-xs">
                  {t(MODE_LABEL[option])}
                </span>
              </Dropdown.Item>
            )}
          </For>
        </Dropdown.Group>
        <ShowApply onApplyToAll={props.onApplyToAll} value={props.value} />
      </Dropdown.Content>
    </Dropdown>
  );
}

function ShowApply(props: {
  value: AgentMode;
  onApplyToAll?: (mode: AgentMode) => void;
}) {
  return (
    <Show when={props.onApplyToAll}>
      {(apply) => (
        <Dropdown.Group>
          <Dropdown.Item onSelect={() => apply()(props.value)}>
            <span class="flex-1 truncate text-xs">
              {t('agent.mode.applyToAll')}
            </span>
          </Dropdown.Item>
        </Dropdown.Group>
      )}
    </Show>
  );
}

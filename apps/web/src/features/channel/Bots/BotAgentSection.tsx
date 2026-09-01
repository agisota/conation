import { ToggleSwitch } from '@ui';
import { t } from '@app/lib/i18n';
import { Show } from 'solid-js';
import { useChatV3AgentsFlag } from '../use-chat-v3-agents-flag';
import { BotFormSection } from './BotFormSection';

/**
 * The "Coding agent" toggle. Hidden entirely unless the chat v3 agents flag is
 * on, so bots stay plain webhook bots for everyone else.
 */
export function BotAgentSection(props: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const agentsEnabled = useChatV3AgentsFlag();

  return (
    <Show when={agentsEnabled()}>
      <BotFormSection
        title="Agent"
        description="Turn this bot into a coding agent instead of a webhook responder."
      >
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <div class="text-sm font-medium text-ink">{t('auto.agent_harness')}</div>
            <p class="mt-0.5 text-xs text-ink-muted">{t('auto.this_bot_manages_an_agent_harn')}</p>
          </div>
          <ToggleSwitch
            size="md"
            checked={props.checked}
            disabled={props.disabled}
            onChange={props.onChange}
            label={<span>{t('auto.make_this_bot_a_coding_agent')}</span>}
            labelClass="sr-only"
          />
        </div>

        <Show when={props.checked}>
          <div class="mt-4 border-t border-edge-muted pt-3">
            <a
              class="inline-flex h-7 items-center rounded-md border border-edge-muted px-2 text-xs font-medium text-ink-muted hover:bg-hover hover:text-ink"
              href="https://docs.macro.com/AI/bring-your-own"
              target="_blank"
              rel="noopener noreferrer"
            >{t('auto.connecting_an_agent_view_setup')}</a>
          </div>
        </Show>
      </BotFormSection>
    </Show>
  );
}

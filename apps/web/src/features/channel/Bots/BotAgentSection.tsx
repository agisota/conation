import { t } from '@app/lib/i18n';
import { getConfiguredStandaloneOperatorOrigin } from '@core/constant/clientProfile';
import { ToggleSwitch } from '@ui';
import { Show } from 'solid-js';
import { useChatV3AgentsFlag } from '../use-chat-v3-agents-flag';
import { BotFormSection } from './BotFormSection';

export function agentSetupGuideUrl(): string {
  if (globalThis.__CONATION_HOSTED_LEGACY__) {
    return `${getConfiguredStandaloneOperatorOrigin()}/docs/AI/bring-your-own`;
  }
  return `${getConfiguredStandaloneOperatorOrigin()}/docs/AI/bring-your-own`;
}

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
        title={t('channel.bots.agent.title')}
        description={t('channel.bots.agent.description')}
      >
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <div class="text-sm font-medium text-ink">
              {t('channel.bots.agent.harness')}
            </div>
            <p class="mt-0.5 text-xs text-ink-muted">
              {t('channel.bots.agent.harnessDescription')}
            </p>
          </div>
          <ToggleSwitch
            size="md"
            checked={props.checked}
            disabled={props.disabled}
            onChange={props.onChange}
            label={<span>{t('channel.bots.agent.enable')}</span>}
            labelClass="sr-only"
          />
        </div>

        <Show when={props.checked}>
          <div class="mt-4 border-t border-edge-muted pt-3">
            <a
              class="inline-flex h-7 items-center rounded-md border border-edge-muted px-2 text-xs font-medium text-ink-muted hover:bg-hover hover:text-ink"
              href={agentSetupGuideUrl()}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('channel.bots.agent.setupGuide')}
            </a>
          </div>
        </Show>
      </BotFormSection>
    </Show>
  );
}

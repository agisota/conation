import { t } from '@app/lib/i18n';
import KeyIcon from '@phosphor/key.svg';
import { Button } from '@ui';
import { For, Show } from 'solid-js';
import { BotFormSection } from './BotFormSection';
import { CredentialField } from './CredentialField';
import { channelWebhookUrl } from './webhook';

type BotWebhookChannel = {
  id: string;
  name: string;
};

type BotWebhooksSectionProps = {
  channels: BotWebhookChannel[];
  onNewToken: () => void;
};

export function BotWebhooksSection(props: BotWebhooksSectionProps) {
  return (
    <BotFormSection
      title={t('channel.bots.webhooks.title')}
      description={t('channel.bots.webhooks.description')}
      action={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={props.onNewToken}
        >
          <KeyIcon />
          {t('channel.bots.webhooks.newToken')}
        </Button>
      }
    >
      <Show
        when={props.channels.length > 0}
        fallback={
          <p class="text-xs text-ink-muted">
            {t('channel.bots.webhooks.empty')}
          </p>
        }
      >
        <div class="flex flex-col gap-4">
          <For each={props.channels}>
            {(channel) => (
              <CredentialField
                label={channel.name}
                value={channelWebhookUrl(channel.id)}
                help={t('channel.bots.webhookUrl')}
              />
            )}
          </For>
        </div>
      </Show>
    </BotFormSection>
  );
}

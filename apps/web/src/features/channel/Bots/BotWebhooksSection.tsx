import KeyIcon from '@phosphor/key.svg';
import { t } from '@app/lib/i18n';
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
      title={t('auto.webhooks')}
      description="Copy a channel URL or generate another token."
      action={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={props.onNewToken}
        >
          <KeyIcon />{t('auto.new_token')}</Button>
      }
    >
      <Show
        when={props.channels.length > 0}
        fallback={
          <p class="text-xs text-ink-muted">{t('auto.add_this_bot_to_a_channel_to_g')}</p>
        }
      >
        <div class="flex flex-col gap-4">
          <For each={props.channels}>
            {(channel) => (
              <CredentialField
                label={channel.name}
                value={channelWebhookUrl(channel.id)}
                help="Webhook URL"
              />
            )}
          </For>
        </div>
      </Show>
    </BotFormSection>
  );
}

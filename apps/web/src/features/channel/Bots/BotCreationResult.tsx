import { t } from '@app/lib/i18n';
import HashIcon from '@phosphor/hash.svg';
import CheckCircleIcon from '@phosphor-icons/core/assets/fill/check-circle-fill.svg?component-solid';
import type { Bot } from '@service-storage/generated/schemas/bot';
import { Button, Surface } from '@ui';
import { For, Show } from 'solid-js';
import { BotAvatar } from './BotAvatar';
import type { BotChannelOption } from './botChannelOptions';
import { CredentialField } from './CredentialField';
import { channelWebhookUrl, webhookExample } from './webhook';

export function BotCreationResult(props: {
  bot: Bot;
  channels: BotChannelOption[];
  token?: string;
  tokenFailed: boolean;
  onDone: () => void;
}) {
  return (
    <div>
      <header class="flex items-center gap-3">
        <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-bg text-success">
          <CheckCircleIcon class="size-5" />
        </div>
        <div class="min-w-0">
          <h1 class="text-lg font-semibold tracking-[-0.01em]">
            {t('channel.bots.created.title')}
          </h1>
          <p class="mt-0.5 text-sm text-ink-muted">
            {t('channel.bots.created.credentialsWarning')}
          </p>
        </div>
      </header>

      <Surface
        depth={2}
        class="mt-7 flex items-center gap-3 rounded-xl border border-ink/[0.06] p-4"
      >
        <BotAvatar bot={props.bot} size="lg" />
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium">{props.bot.name}</div>
          <div class="truncate text-xs text-ink-muted">@{props.bot.handle}</div>
        </div>
        <Show when={props.channels.length > 0}>
          <div class="flex max-w-64 flex-wrap justify-end gap-1">
            <For each={props.channels}>
              {(channel) => (
                <div class="flex min-w-0 items-center gap-1.5 rounded-md bg-ink/[0.04] px-2 py-1 text-xs text-ink-muted">
                  <HashIcon class="size-3.5 shrink-0" />
                  <span class="max-w-32 truncate">{channel.name}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Surface>

      <div class="mt-7 flex flex-col gap-5">
        <For each={props.channels}>
          {(channel) => (
            <CredentialField
              label={t('channel.bots.webhookUrlForChannel', {
                channel: channel.name,
              })}
              value={channelWebhookUrl(channel.id)}
              help={t('channel.bots.created.webhookHelp')}
            />
          )}
        </For>

        <Show
          when={props.token}
          fallback={
            <div class="rounded-lg border border-alert/30 bg-alert-bg px-3 py-2.5 text-xs text-alert-ink">
              {props.tokenFailed
                ? t('channel.bots.created.tokenFailed')
                : t('channel.bots.created.noToken')}
            </div>
          }
        >
          {(token) => (
            <>
              <CredentialField
                label={t('channel.bots.webhookToken')}
                value={token()}
                help={t('channel.bots.created.tokenHeaderHelp')}
              />
              <Show when={props.channels[0]}>
                {(channel) => (
                  <CredentialField
                    label={t('channel.bots.created.exampleRequest')}
                    value={webhookExample(
                      channelWebhookUrl(channel().id),
                      token()
                    )}
                    help={t('channel.bots.created.copyAndRun')}
                  />
                )}
              </Show>
            </>
          )}
        </Show>

        <Show when={props.channels.length === 0}>
          <div class="rounded-lg border border-edge-muted bg-ink/[0.025] px-3 py-2.5 text-xs text-ink-muted">
            {t('channel.bots.created.inviteHelp')}
          </div>
        </Show>
      </div>

      <div class="mt-8 flex justify-end border-t border-edge-muted pt-4">
        <Button type="button" variant="cta" size="sm" onClick={props.onDone}>
          {t('channel.bots.done')}
        </Button>
      </div>
    </div>
  );
}

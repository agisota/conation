import { t } from '@app/lib/i18n';
import { BotAvatar } from '@channel/Bots/BotAvatar';
import { LoadingSpinner } from '@core/component/LoadingSpinner';
import CaretRightIcon from '@phosphor/caret-right.svg';
import PlusIcon from '@phosphor/plus.svg';
import BotIcon from '@phosphor/robot.svg';
import { useBotChannelsQuery } from '@queries/bots/bots';
import type { Bot } from '@service-storage/generated/schemas/bot';
import { Button } from '@ui';
import { For, Show } from 'solid-js';
import { SettingsCard, SettingsPage, SettingsSection } from './primitives';

function BotSettingsRow(props: { bot: Bot; onOpen: (botId: string) => void }) {
  const channelsQuery = useBotChannelsQuery(() => props.bot.id);
  const channels = () => channelsQuery.data ?? [];
  const ownerLabel = () =>
    props.bot.owner?.type === 'team'
      ? t('settings.bots.owner.team')
      : t('settings.bots.owner.personal');

  const channelSummary = () => {
    if (channelsQuery.isLoading) return t('settings.bots.channels.loading');
    if (channels().length === 0) return t('settings.bots.channels.none');
    if (channels().length === 1) {
      const channelName = channels()[0]?.name;
      return channelName
        ? t('settings.bots.channels.inNamed', { name: channelName })
        : t('settings.bots.channels.count', { count: 1 });
    }
    return t('settings.bots.channels.count', { count: channels().length });
  };

  return (
    <button
      type="button"
      class="flex w-full items-center gap-4 px-6 py-4 text-left outline-none hover:bg-hover focus-visible:bg-hover mobile:items-start touch:px-4"
      onClick={() => props.onOpen(props.bot.id)}
    >
      <BotAvatar bot={props.bot} size="lg" />
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate text-sm font-medium text-ink">
            {props.bot.name}
          </span>
          <span class="truncate text-xs text-ink-extra-muted">
            @{props.bot.handle}
          </span>
          <span class="shrink-0 rounded-full border border-edge-muted px-2 py-0.5 font-mono text-xxs font-medium uppercase text-ink-extra-muted">
            {ownerLabel()}
          </span>
        </div>
        <div class="mt-0.5 truncate text-xs text-ink-muted">
          {props.bot.description || channelSummary()}
        </div>
        <Show when={props.bot.description}>
          <div class="mt-1 text-xs text-ink-extra-muted">
            {channelSummary()}
          </div>
        </Show>
      </div>
      <CaretRightIcon class="size-4 shrink-0 text-ink-extra-muted" />
    </button>
  );
}

export function BotSettingsList(props: {
  bots?: Bot[];
  loading: boolean;
  onCreate: () => void;
  onOpen: (botId: string) => void;
}) {
  return (
    <SettingsPage
      title={t('settings.bots.title')}
      description={t('settings.bots.description')}
      actions={
        <Button variant="cta" size="sm" onClick={props.onCreate}>
          <PlusIcon />
          {t('settings.bots.create.action')}
        </Button>
      }
    >
      <SettingsSection
        title={t('settings.bots.list.title')}
        description={t('settings.bots.list.description')}
      >
        <SettingsCard>
          <Show
            when={!props.loading}
            fallback={
              <div class="flex min-h-36 items-center justify-center">
                <LoadingSpinner class="size-10 p-2" />
              </div>
            }
          >
            <Show
              when={(props.bots?.length ?? 0) > 0}
              fallback={
                <div class="flex min-h-52 flex-col items-center justify-center px-8 text-center">
                  <div class="flex size-11 items-center justify-center rounded-xl bg-accent-bg text-accent">
                    <BotIcon class="size-6" />
                  </div>
                  <div class="mt-3 text-sm font-medium text-ink">
                    {t('settings.bots.empty.title')}
                  </div>
                  <div class="mt-1 max-w-80 text-xs text-ink-muted">
                    {t('settings.bots.empty.description')}
                  </div>
                  <Button
                    class="mt-4"
                    variant="cta"
                    size="sm"
                    onClick={props.onCreate}
                  >
                    <PlusIcon />
                    {t('settings.bots.create.action')}
                  </Button>
                </div>
              }
            >
              <For each={props.bots}>
                {(bot) => <BotSettingsRow bot={bot} onOpen={props.onOpen} />}
              </For>
            </Show>
          </Show>
        </SettingsCard>
      </SettingsSection>
    </SettingsPage>
  );
}

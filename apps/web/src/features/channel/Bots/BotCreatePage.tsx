import { t } from '@app/lib/i18n';
import { LoadingSpinner } from '@core/component/LoadingSpinner';
import { toast } from '@core/component/Toast/Toast';
import { useChannelsContext } from '@core/context/channels';
import CaretLeftIcon from '@phosphor/caret-left.svg';
import RobotIcon from '@phosphor/robot.svg';
import {
  useCreateBotMutation,
  useCreateBotTokenMutation,
} from '@queries/bots/bots';
import {
  useAddBotToChannelsMutation,
  useCreateChannelScopedBotMutation,
} from '@queries/channel/channel-bots';
import { useCurrentTeamQuery, useIsTeamAdmin } from '@queries/team/teams';
import type { Bot } from '@service-storage/generated/schemas/bot';
import { Button, ToggleSwitch } from '@ui';
import { createMemo, createSignal, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { BotAgentSection } from './BotAgentSection';
import { BotCreationResult } from './BotCreationResult';
import { BotFormSection } from './BotFormSection';
import { BotProfileFields } from './BotProfileFields';
import { botAssignableChannelOptions } from './botChannelOptions';
import {
  type BotFormErrors,
  EMPTY_BOT_FORM,
  slugBotHandle,
  validateBotForm,
} from './botForm';
import { ChannelMultiSelect } from './ChannelMultiSelect';
import { createBotAvatarUpload } from './createBotAvatarUpload';

type Stage = 'form' | 'creating' | 'ready';

export function BotCreate(props: { channelId?: string; onBack: () => void }) {
  const channelsContext = useChannelsContext();
  const currentTeamQuery = useCurrentTeamQuery();
  const isTeamAdmin = useIsTeamAdmin();
  const createBotMutation = useCreateBotMutation();
  const createTokenMutation = useCreateBotTokenMutation();
  const createScopedBotMutation = useCreateChannelScopedBotMutation();
  const addBotToChannelsMutation = useAddBotToChannelsMutation();
  const [stage, setStage] = createSignal<Stage>('form');
  const [teamOwned, setTeamOwned] = createSignal(false);
  const [handleEdited, setHandleEdited] = createSignal(false);
  const [errors, setErrors] = createSignal<BotFormErrors>({});
  const [createdBot, setCreatedBot] = createSignal<Bot>();
  const [createdChannelIds, setCreatedChannelIds] = createSignal<string[]>([]);
  const [rawToken, setRawToken] = createSignal<string>();
  const [tokenFailed, setTokenFailed] = createSignal(false);
  const [selectedChannelIds, setSelectedChannelIds] = createSignal<string[]>(
    props.channelId ? [props.channelId] : []
  );
  const [form, setForm] = createStore({ ...EMPTY_BOT_FORM });
  const avatarUpload = createBotAvatarUpload((url) =>
    setForm('avatarUrl', url)
  );

  const channelOptions = createMemo(() =>
    botAssignableChannelOptions(channelsContext.channels())
  );
  const currentTeam = createMemo(() => currentTeamQuery.data?.team);
  const canCreateTeamBot = createMemo(
    () => currentTeam() !== undefined && isTeamAdmin()
  );
  const resultChannels = createMemo(() => {
    const selected = new Set(createdChannelIds());
    return channelOptions().filter((channel) => selected.has(channel.id));
  });
  const pending = () => stage() === 'creating' || avatarUpload.uploading();

  const leave = () => {
    if (pending()) return;
    props.onBack();
  };

  const finish = (bot: Bot, token?: string) => {
    setCreatedBot(bot);
    setRawToken(token);
    setStage('ready');
  };

  const submit = () => {
    const teamId = teamOwned() ? currentTeam()?.id : undefined;
    if (teamOwned() && (!teamId || !canCreateTeamBot())) {
      toast.failure(t('channel.bots.team.permissionRequired'));
      return;
    }

    const parsed = validateBotForm({
      ...form,
      handle: form.handle || slugBotHandle(form.name),
    });
    if (!parsed.success) {
      setErrors(parsed.errors);
      return;
    }

    const values = parsed.data;
    const channelIds = selectedChannelIds();
    const [firstChannelId, ...remainingChannelIds] = channelIds;
    setErrors({});
    setCreatedChannelIds(channelIds);
    setStage('creating');

    if (firstChannelId) {
      createScopedBotMutation.mutate(
        {
          channelId: firstChannelId,
          team_id: teamId,
          name: values.name,
          handle: values.handle,
          description: values.description || undefined,
          avatar_url: values.avatarUrl || undefined,
          token_label: 'webhook',
          has_agent: values.hasAgent,
        },
        {
          onSuccess: async ({ bot, bot_token }) => {
            if (remainingChannelIds.length > 0) {
              const result = await addBotToChannelsMutation.mutateAsync({
                botId: bot.id,
                channelIds: remainingChannelIds,
              });
              setCreatedChannelIds([firstChannelId, ...result.addedChannelIds]);
              if (result.failedCount > 0) {
                toast.failure(
                  t('channel.bots.create.assignmentFailed', {
                    count: result.failedCount,
                  })
                );
              }
            }
            finish(bot, bot_token);
          },
          onError: () => {
            setStage('form');
            toast.failure(t('channel.bots.create.failed'));
          },
        }
      );
      return;
    }

    createBotMutation.mutate(
      {
        teamId,
        name: values.name,
        handle: values.handle,
        description: values.description || undefined,
        avatarUrl: values.avatarUrl || undefined,
        hasAgent: values.hasAgent,
      },
      {
        onSuccess: (bot) => {
          setCreatedBot(bot);
          createTokenMutation.mutate(
            { botId: bot.id, label: 'webhook' },
            {
              onSuccess: ({ bearer_token }) => finish(bot, bearer_token),
              onError: () => {
                setTokenFailed(true);
                finish(bot);
              },
            }
          );
        },
        onError: () => {
          setStage('form');
          toast.failure(t('channel.bots.create.failed'));
        },
      }
    );
  };

  return (
    <div class="size-full overflow-y-auto bg-surface text-ink">
      {/* Mobile chrome insets live inside the scroll content so the page is
          full-frame, matching SettingsPage (this create view only renders
          inside the settings panel). */}
      <main class="mx-auto w-full max-w-[560px] px-8 pt-14 pb-24 touch:px-5 touch:pt-[calc(var(--mobile-content-inset-top,0px)+2rem)] touch:pb-[calc(var(--mobile-content-inset-bottom,0px)+3rem)]">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="-ml-2 mb-7"
          disabled={pending()}
          onClick={leave}
        >
          <CaretLeftIcon />
          {t('channel.bots.backToBots')}
        </Button>
        <Show when={stage() !== 'ready'}>
          <header class="flex items-center gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-edge-muted bg-ink/[0.025] text-ink-muted">
              <RobotIcon class="size-5" />
            </div>
            <div class="min-w-0">
              <h1 class="text-lg font-semibold tracking-[-0.01em]">
                {t('channel.bots.create.title')}
              </h1>
              <p class="mt-0.5 text-sm text-ink-muted">
                {t('channel.bots.create.subtitle')}
              </p>
            </div>
          </header>
        </Show>

        <Show when={stage() === 'form'}>
          <form
            class="mt-8 flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <BotFormSection
              title={t('channel.bots.profile.title')}
              description={t('channel.bots.profile.createDescription')}
            >
              <BotProfileFields
                value={form}
                errors={errors()}
                uploadingAvatar={avatarUpload.uploading()}
                onUploadAvatar={avatarUpload.open}
                onNameChange={(value) => {
                  setForm('name', value);
                  setErrors((current) => ({
                    ...current,
                    name: undefined,
                  }));
                  if (!handleEdited()) {
                    setForm('handle', slugBotHandle(value));
                  }
                }}
                onHandleChange={(value) => {
                  setHandleEdited(true);
                  setForm('handle', slugBotHandle(value));
                  setErrors((current) => ({
                    ...current,
                    handle: undefined,
                  }));
                }}
                onDescriptionChange={(value) => setForm('description', value)}
              />
            </BotFormSection>

            <BotAgentSection
              checked={form.hasAgent}
              disabled={pending()}
              onChange={(checked) => setForm('hasAgent', checked)}
            />

            <BotFormSection
              title={t('channel.bots.ownership.title')}
              description={t('channel.bots.ownership.description')}
            >
              <div class="flex items-center justify-between gap-4">
                <div class="min-w-0">
                  <div class="text-sm font-medium text-ink">
                    {t('channel.bots.team.title')}
                  </div>
                  <p class="mt-0.5 text-xs text-ink-muted">
                    {t('channel.bots.team.description')}
                  </p>
                </div>
                <ToggleSwitch
                  size="md"
                  checked={teamOwned()}
                  disabled={currentTeamQuery.isLoading || !canCreateTeamBot()}
                  onChange={setTeamOwned}
                  label={<span>{t('channel.bots.team.createToggle')}</span>}
                  labelClass="sr-only"
                />
              </div>
              <Show when={!currentTeamQuery.isLoading && !canCreateTeamBot()}>
                <p class="mt-3 border-t border-edge-muted pt-3 text-xs text-ink-extra-muted">
                  {currentTeam()
                    ? t('channel.bots.team.permissionRequired')
                    : t('channel.bots.team.joinRequired')}
                </p>
              </Show>
            </BotFormSection>

            <BotFormSection
              title={t('channel.bots.channels.title')}
              description={t('channel.bots.channels.createDescription')}
            >
              <label class="mb-1.5 block text-xs font-medium">
                {t('channel.bots.channels.add')}{' '}
                <span class="text-ink-muted">
                  · {t('channel.bots.optional')}
                </span>
              </label>
              <ChannelMultiSelect
                channelIds={selectedChannelIds()}
                onChange={setSelectedChannelIds}
              />
              <p class="mt-2 text-xs text-ink-muted">
                {t('channel.bots.channels.assignmentHelp')}
              </p>
            </BotFormSection>

            <div class="flex items-center justify-between gap-4 pt-1">
              <p class="text-xs text-ink-muted">
                {t('channel.bots.create.tokenGenerated')}
              </p>
              <div class="flex shrink-0 gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={leave}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" variant="cta" size="sm">
                  {t('channel.bots.create.submit')}
                </Button>
              </div>
            </div>
          </form>
        </Show>

        <Show when={stage() === 'creating'}>
          <div class="flex min-h-96 flex-col items-center justify-center gap-4 text-center">
            <LoadingSpinner class="size-16 p-4" />
            <div>
              <div class="text-sm font-medium">
                {t('channel.bots.create.creating')}
              </div>
              <div class="mt-1 text-xs text-ink-muted">
                {t('channel.bots.create.creatingDescription')}
              </div>
            </div>
          </div>
        </Show>

        <Show when={stage() === 'ready' && createdBot()}>
          {(bot) => (
            <BotCreationResult
              bot={bot()}
              channels={resultChannels()}
              token={rawToken()}
              tokenFailed={tokenFailed()}
              onDone={leave}
            />
          )}
        </Show>
      </main>
    </div>
  );
}

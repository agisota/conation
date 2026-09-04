import { t } from '@app/lib/i18n';
import { toast } from '@core/component/Toast/Toast';
import { thrownResultErrorHasCode } from '@core/util/result';
import { SERVER_HOSTS } from '@core/constant/servers';
import GithubIcon from '@icon/mcp-github.svg';
import ArrowUpRightIcon from '@phosphor/arrow-up-right.svg';
import {
  useDeleteGithubLinkMutation,
  useGithubLinkStatusQuery,
  useInitGithubLinkMutation,
  useReauthenticateGithubMutation,
} from '@queries/auth';
import { Match, Show, Switch } from 'solid-js';
import {
  ConnectAction,
  type ConnectionState,
  StatusDot,
} from './integration-ui';
import { IntegrationRow, SettingsCard, SettingsRow } from './primitives';

/** GitHub integration as a Connected-accounts card. */
export function GitHubCard() {
  const githubLink = useGithubLinkStatusQuery();
  const initGithubLink = useInitGithubLinkMutation();
  const deleteGithubLink = useDeleteGithubLinkMutation();
  const reauthenticateGithub = useReauthenticateGithubMutation();

  const status = () => githubLink.data?.status;
  const username = () => githubLink.data?.username;

  // Drives the account connection dot.
  const connectionState = (): ConnectionState | undefined =>
    status() === 'linked'
      ? 'connected'
      : status() === 'reauthentication_required'
        ? 'attention'
        : undefined;
  const connectionLabel = () =>
    connectionState() === 'attention'
      ? t('settings.github.status.reconnectRequired')
      : t('settings.github.status.connected');

  const handleGithubEnable = async () => {
    try {
      window.location.href = await initGithubLink.mutateAsync(
        window.location.href
      );
    } catch (error) {
      toast.failure(
        thrownResultErrorHasCode(error, 'SERVER_ERROR') ||
          thrownResultErrorHasCode(error, 'SERVICE_UNAVAILABLE')
          ? t('settings.github.errors.notConfigured')
          : t('settings.github.errors.connect')
      );
    }
  };

  const handleGithubDisable = async () => {
    try {
      await deleteGithubLink.mutateAsync();
    } catch {
      toast.failure(t('settings.github.errors.disconnect'));
    }
  };

  const handleGithubReconnect = async () => {
    try {
      window.location.href = await reauthenticateGithub.mutateAsync(
        window.location.href
      );
    } catch {
      toast.failure(t('settings.github.errors.reconnect'));
    }
  };

  return (
    <SettingsCard>
      <IntegrationRow
        icon={<GithubIcon />}
        title={t('settings.github.title')}
        description={t('settings.github.description')}
      />

      <SettingsRow
        label={
          <span class="flex items-center gap-2">
            <span>{t('settings.github.account.label')}</span>
            <Show when={connectionState()}>
              {(state) => (
                <StatusDot state={state()} label={connectionLabel()} />
              )}
            </Show>
          </span>
        }
        description={t('settings.github.account.description')}
      >
        <Show
          when={!githubLink.isLoading}
          fallback={
            <span class="text-xs text-ink-muted">{t('common.loading')}</span>
          }
        >
          <Switch
            fallback={
              <ConnectAction
                label={t('settings.github.actions.connect')}
                onClick={handleGithubEnable}
                disabled={initGithubLink.isPending}
              />
            }
          >
            <Match when={status() === 'linked'}>
              <Show when={username()}>
                {(name) => (
                  <span class="ph-no-capture text-xs text-ink-muted">
                    @{name()}
                  </span>
                )}
              </Show>
              <ConnectAction
                label={t('settings.github.actions.disconnect')}
                variant="danger"
                onClick={handleGithubDisable}
                disabled={deleteGithubLink.isPending}
              />
            </Match>
            <Match when={status() === 'reauthentication_required'}>
              <ConnectAction
                label={t('settings.github.actions.reconnect')}
                onClick={handleGithubReconnect}
                disabled={reauthenticateGithub.isPending}
              />
            </Match>
          </Switch>
        </Show>
      </SettingsRow>

      <SettingsRow
        label={t('settings.github.app.label')}
        description={t('settings.github.app.description')}
      >
        {/* The install callback rejects users without a linked account, so
            don't offer the flow until the account above is connected. */}
        <Show
          when={status() === 'linked'}
          fallback={
            <span class="text-xs text-ink-muted">
              {githubLink.isLoading
                ? t('common.loading')
                : t('settings.github.app.connectFirst')}
            </span>
          }
        >
          <a
            href={`${SERVER_HOSTS['document-storage-service']}/github/install-sync`}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-ink-muted outline-none transition-colors hover:bg-ink/4 hover:text-ink focus-visible:bg-ink/6"
          >
            {t('settings.github.app.configure')}
            <ArrowUpRightIcon class="size-3.5 opacity-70" />
          </a>
        </Show>
      </SettingsRow>
    </SettingsCard>
  );
}

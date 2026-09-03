import { t } from '@app/lib/i18n';
import { PIPEDREAM_ICON_MAP } from '@core/component/AI/constant/mcpServers';
import { toast } from '@core/component/Toast/Toast';
import { PipedreamConnectorIcon } from '@core/pipedream/ConnectorIcon';
import {
  createPipedreamCatalogConnect,
  createPipedreamCatalogSearch,
} from '@core/pipedream/catalog';
import PlugIcon from '@phosphor-icons/core/regular/plug.svg?component-solid';
import XIcon from '@phosphor-icons/core/regular/x.svg?component-solid';
import {
  useDeletePipedreamConnectionMutation,
  usePipedreamConnectionsQuery,
  useUpdatePipedreamConnectionMutation,
} from '@queries/pipedream-connectors';
import type {
  PipedreamCatalogEntryResponse,
  PipedreamConnectionResponse,
} from '@service-cognition/client';
import { Button, ToggleSwitch } from '@ui';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { ConnectAction } from './integration-ui';
import { IntegrationRow, SettingsCard, SettingsSection } from './primitives';

/** A connected app: enable/disable for tool use, or disconnect. */
function ServerRow(props: { server: PipedreamConnectionResponse }) {
  const updateMutation = useUpdatePipedreamConnectionMutation();
  const deleteMutation = useDeletePipedreamConnectionMutation();
  const [confirmDelete, setConfirmDelete] = createSignal(false);

  const handleToggleEnabled = () => {
    updateMutation.mutate(
      { app_slug: props.server.app_slug, enabled: !props.server.enabled },
      {
        onError: () => {
          toast.failure(
            t('settings.pipedream.toast.updateFailed')
          );
        },
      }
    );
  };

  const handleDelete = () => {
    deleteMutation.mutate(
      { app_slug: props.server.app_slug },
      {
        onSuccess: () => {
          toast.success(t('settings.pipedream.toast.removed'));
          setConfirmDelete(false);
        },
        onError: () => {
          toast.failure(
            t('settings.pipedream.toast.removeFailed')
          );
          setConfirmDelete(false);
        },
      }
    );
  };

  const Icon = () => PIPEDREAM_ICON_MAP.get(props.server.app_slug) ?? PlugIcon;

  return (
    <IntegrationRow
      icon={(() => {
        const C = Icon();
        return <C class="size-5" />;
      })()}
      title={props.server.server_name}
      description={props.server.app_slug}
    >
      <ToggleSwitch
        size="md"
        checked={props.server.enabled}
        disabled={updateMutation.isPending}
        onChange={handleToggleEnabled}
        label={
          props.server.enabled
            ? t('settings.pipedream.status.enabled')
            : t('settings.pipedream.status.disabled')
        }
        labelClass="inline-block w-14 text-left text-xs text-ink-muted whitespace-nowrap"
      />

      <Show
        when={!confirmDelete()}
        fallback={
          <div class="flex items-center gap-1">
            <Button
              variant="danger"
              size="sm"
              depth={3}
              disabled={deleteMutation.isPending}
              onClick={handleDelete}
            >
              {deleteMutation.isPending
                ? t('settings.pipedream.actions.removing')
                : t('settings.pipedream.actions.confirm')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              depth={3}
              onClick={() => setConfirmDelete(false)}
            >
              {t('common.cancel')}
            </Button>
          </div>
        }
      >
        <Button
          variant="outline"
          size="sm"
          depth={3}
          tooltip={t('common.remove')}
          onClick={() => setConfirmDelete(true)}
        >
          <XIcon class="size-4" />
        </Button>
      </Show>
    </IntegrationRow>
  );
}

/**
 * A connectable app from the catalog the user hasn't connected yet, shown
 * inline in the integrations list to make connecting a one-click affair.
 * Once connected, the app shows up as a regular {@link ServerRow} instead.
 */
function CatalogRow(props: { entry: PipedreamCatalogEntryResponse }) {
  const { connect, busy } = createPipedreamCatalogConnect({
    entry: () => props.entry,
    onConnected: (entry) =>
      toast.success(
        t('settings.pipedream.toast.connected', {
          name: entry.display_name,
        })
      ),
  });

  return (
    <IntegrationRow
      icon={
        <PipedreamConnectorIcon
          appSlug={props.entry.app_slug}
          iconUrl={props.entry.icon_url}
        />
      }
      title={props.entry.display_name}
      description={props.entry.description ?? props.entry.app_slug}
    >
      <ConnectAction
        label={t('settings.pipedream.actions.connect')}
        onClick={() => void connect()}
        loading={busy()}
      />
    </IntegrationRow>
  );
}

/**
 * The "MCP integrations" section of the Connections page: apps the user has
 * connected, then a searchable catalog of every connectable app, ranked by
 * popularity — all connecting through Pipedream, the single connect path.
 */
export function PipedreamIntegrationsSection() {
  const serversQuery = usePipedreamConnectionsQuery();

  const servers = () => serversQuery.data ?? [];
  const connectedSlugs = createMemo(
    () => new Set(servers().map((s) => s.app_slug))
  );

  const catalog = createPipedreamCatalogSearch(connectedSlugs);
  const catalogQuery = catalog.query;
  const browseResults = catalog.entries;

  return (
    <SettingsSection
      title={t('settings.pipedream.title')}
      description={t('settings.pipedream.catalog.description')}
    >
      <Show when={serversQuery.isError}>
        <SettingsCard>
          <div class="px-6 py-8 text-center text-sm text-ink-muted">
            {t('settings.pipedream.loadFailed')}
            <Button
              variant="outline"
              size="sm"
              depth={3}
              onClick={() => serversQuery.refetch()}
              class="ml-2"
            >
              {t('common.retry')}
            </Button>
          </div>
        </SettingsCard>
      </Show>

      <Show when={!serversQuery.isError && servers().length > 0}>
        <SettingsCard>
          <For each={servers()}>
            {(server) => <ServerRow server={server} />}
          </For>
        </SettingsCard>
      </Show>

      <SettingsCard>
        <div class="px-4 py-3">
          <input
            type="search"
            class="settings-input w-full"
            placeholder={t('settings.pipedream.catalog.searchPlaceholder')}
            value={catalog.searchInput()}
            onInput={(e) => catalog.onSearchInput(e.currentTarget.value)}
          />
        </div>

        <Show when={catalogQuery.isError}>
          <div class="px-6 py-6 text-center text-sm text-ink-muted">
            {t('settings.pipedream.catalog.loadFailed')}
            <Button
              variant="outline"
              size="sm"
              depth={3}
              onClick={() => catalogQuery.refetch()}
              class="ml-2"
            >
              {t('common.retry')}
            </Button>
          </div>
        </Show>

        <Show when={!catalogQuery.isError}>
          <For each={browseResults()}>
            {(entry) => <CatalogRow entry={entry} />}
          </For>

          <Show when={catalogQuery.isFetching && browseResults().length === 0}>
            <div class="px-6 py-6 text-center text-sm text-ink-muted">
              {t('settings.pipedream.catalog.loading')}
            </div>
          </Show>

          <Show
            when={
              !catalogQuery.isFetching &&
              browseResults().length === 0 &&
              catalog.search().trim()
            }
          >
            <div class="px-6 py-6 text-center text-sm text-ink-muted">
              {t('settings.pipedream.catalog.noResults', {
                query: catalog.search().trim(),
              })}
            </div>
          </Show>

          <Show when={catalogQuery.hasNextPage}>
            <div class="px-4 py-3 text-center">
              <Button
                variant="outline"
                size="sm"
                depth={3}
                disabled={catalogQuery.isFetchingNextPage}
                onClick={() => void catalogQuery.fetchNextPage()}
              >
                {catalogQuery.isFetchingNextPage
                  ? t('common.loading')
                  : t('settings.pipedream.catalog.loadMore')}
              </Button>
            </div>
          </Show>
        </Show>
      </SettingsCard>
    </SettingsSection>
  );
}

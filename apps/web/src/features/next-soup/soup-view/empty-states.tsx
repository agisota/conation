import { DOCS_BASE } from '@app/constants/docs-links';
import type { ListView } from '@app/constants/list-views';
import {
  type CreatableName,
  runCreateAction,
  useCreatableEnabled,
} from '@app/features/command/Launcher';
import { t } from '@app/lib/i18n';
import { openNewChannelModal } from '@channel/CreateChannelModal';
import { toast } from '@core/component/Toast/Toast';
import { useSettingsState } from '@core/constant/SettingsState';
import { useEmail } from '@core/context/user';
import {
  hasStalwartMailbox,
  useEmailLinks,
  useEmailLinksStatus,
} from '@core/email-link';
import EmptyStateAiGraphic from '@design/empty-state-ai.svg';
import EmptyStateAutomationsGraphic from '@design/empty-state-automations.svg';
import EmptyStateCallsGraphic from '@design/empty-state-calls.svg';
import EmptyStateChannelsGraphic from '@design/empty-state-channels.svg';
import EmptyStateCompaniesGraphic from '@design/empty-state-companies.svg';
import EmptyStateDocGraphic from '@design/empty-state-doc.svg';
import EmptyStateEmailGraphic from '@design/empty-state-email.svg';
import EmptyStateFolderGraphic from '@design/empty-state-folder.svg';
import EmptyStateInboxTrayGraphic from '@design/empty-state-inbox-tray.svg';
import EmptyStateInboxZeroGraphic from '@design/empty-state-inbox-zero.svg';
import EmptyStateNoFilterMatchGraphic from '@design/empty-state-no-filter-match.svg';
import EmptyStateNoSearchMatchGraphic from '@design/empty-state-no-search-match.svg';
import EmptyStateTasksGraphic from '@design/empty-state-tasks.svg';
import PlusIcon from '@phosphor/plus.svg';
import { useCurrentTeamQuery, useIsTeamAdmin } from '@queries/team/teams';
import { EmptyStatePanel, FilteredHiddenBanner } from '@ui';
import { type Component, type JSXElement, Match, Switch } from 'solid-js';
import { FolderDropZone } from './FolderDropZone';
import { useSoupView } from './soup-view-context';

/** A single key, sized to sit inline in a sentence rather than on its own row. */
function HotkeyCap(props: { children: JSXElement }) {
  return (
    <kbd class="rounded border border-edge-muted px-1 py-px font-mono text-xs">
      {props.children}
    </kbd>
  );
}

type FallbackContent = {
  title: string;
  graphic?: Component<{ class?: string }>;
  description?: JSXElement;
  create?: { label: string; blockName: CreatableName };
  documentationUrl?: string;
};

/** Whether a failed request has no trustworthy local result to render. */
export function shouldShowLoadError(options: {
  hasData: boolean;
  forceEmptyState: boolean;
}): boolean {
  return !options.hasData && !options.forceEmptyState;
}

const fallbackContent = (): Partial<Record<ListView, FallbackContent>> => ({
  documents: {
    title: t('soup.empty.documents.title'),
    graphic: EmptyStateDocGraphic,
    description: t('soup.empty.documents.description'),
    create: { label: t('soup.empty.documents.create'), blockName: 'md' },
    documentationUrl: `${DOCS_BASE}/product/docs`,
  },
  channels: {
    title: t('soup.empty.channels.title'),
    graphic: EmptyStateChannelsGraphic,
    description: t('soup.empty.channels.description'),
    create: { label: t('soup.empty.channels.create'), blockName: 'channel' },
    documentationUrl: `${DOCS_BASE}/product/channels`,
  },
  reminders: {
    title: t('soup.empty.reminders.fallbackTitle'),
    description: (
      <>
        {t('soup.empty.reminders.hotkeyPrefix')}
        <HotkeyCap>h</HotkeyCap>
        {t('soup.empty.reminders.createMenuSuffix')}
      </>
    ),
    create: {
      label: t('soup.empty.reminders.create'),
      blockName: 'reminder',
    },
  },
  calls: {
    title: t('soup.empty.calls.title'),
    graphic: EmptyStateCallsGraphic,
    description: (
      <>
        {t('soup.empty.calls.description')}
        <br />
        {t('soup.empty.calls.agentsAvailable')}
      </>
    ),
    documentationUrl: `${DOCS_BASE}/product/calls`,
  },
});

export function EmptyState(props: {
  listView?: ListView;
  search?: boolean;
  hasRefinementsFromBase?: boolean;
  hasHiddenItems?: boolean;
  onClearFilters?: () => void;
}) {
  const emailActive = useEmailLinksStatus();
  const { query: emailLinksQuery, initEmailLink } = useEmailLinks();
  const userEmail = useEmail();
  const soup = useSoupView();
  const teamQuery = useCurrentTeamQuery();
  const isCreatableEnabled = useCreatableEnabled();
  const isTeamAdmin = useIsTeamAdmin();
  const { openSettings } = useSettingsState();

  // CRM is disabled by default per team; the companies list has a dedicated
  // empty state that points admins to the toggle in Settings › CRM. A user
  // with no team at all (data resolves to null) is pointed to team settings
  // instead, since CRM can only be enabled on a team. Branches wait for the
  // query to resolve so enabled teams don't flash the disabled copy.
  const teamResolved = () => teamQuery.data !== undefined;
  const crmEnabled = () => teamQuery.data?.team.crm_enabled ?? false;
  const hasNoTeam = () => teamQuery.data === null;

  // Signup may already have a Stalwart mailbox. Never treat Gmail as required.
  const mailConnected = () =>
    emailActive() || hasStalwartMailbox(emailLinksQuery.data?.links);
  const documentationLabel = t('soup.empty.documentation');

  const onCreateMailbox = () => {
    void initEmailLink().match(
      () => undefined,
      (err) => {
        if (err.tag !== 'AlreadyInitialized') {
          toast.failure(t('auth.errors.mailboxCreateFailed'));
        }
      }
    );
  };

  return (
    <Switch>
      <Match when={props.search}>
        <EmptyStatePanel
          centered
          graphic={EmptyStateNoSearchMatchGraphic}
          title={
            soup.searchText().trim().length > 0
              ? t('soup.empty.search.noResultsFor', {
                  query: soup.searchText(),
                })
              : t('soup.empty.search.noResults')
          }
          description={t('soup.empty.search.queryDescription')}
          documentationUrl={`${DOCS_BASE}/product/search`}
          documentationLabel={documentationLabel}
        />
      </Match>

      <Match when={props.hasRefinementsFromBase}>
        <EmptyStatePanel
          centered
          graphic={EmptyStateNoFilterMatchGraphic}
          title={t('soup.empty.filters.noMatchTitle')}
          description={t('soup.empty.filters.noMatchDescription')}
        >
          {props.onClearFilters && (
            <FilteredHiddenBanner
              hasHiddenItems={false}
              onClearFilters={props.onClearFilters}
            />
          )}
        </EmptyStatePanel>
      </Match>

      {/* The Reminders tab is not an email surface, so it sits above the
          connect-email gate — its empty copy is the same with or without a
          linked inbox. */}
      <Match
        when={props.listView === 'inbox' && soup.activeTab() === 'reminders'}
      >
        <EmptyStatePanel
          graphic={EmptyStateInboxTrayGraphic}
          title={t('soup.empty.reminders.title')}
          description={
            <>
              {t('soup.empty.reminders.signalPrefix')}
              <HotkeyCap>h</HotkeyCap>
              {t('soup.empty.reminders.genericSuffix')}
            </>
          }
          // Gated like every other reminder affordance. The tab itself is
          // already hidden when the flag is off, so this is belt and braces
          // rather than the only thing standing in the way.
          primaryAction={
            isCreatableEnabled('reminder')
              ? {
                  label: t('soup.empty.reminders.create'),
                  onClick: () => runCreateAction('reminder'),
                }
              : undefined
          }
          documentationUrl={`${DOCS_BASE}/product/inbox`}
          documentationLabel={documentationLabel}
        />
      </Match>

      <Match when={props.listView === 'inbox' && !mailConnected()}>
        <EmptyStatePanel
          graphic={EmptyStateInboxTrayGraphic}
          title={t('soup.empty.mail.createTitle')}
          description={t('soup.empty.mail.createDescription', {
            local: userEmail()?.split('@')[0] || 'you',
          })}
          primaryAction={{
            label: t('soup.empty.mail.createAction'),
            onClick: onCreateMailbox,
          }}
          documentationUrl={`${DOCS_BASE}/product/inbox`}
          documentationLabel={documentationLabel}
        />
      </Match>

      <Match when={props.listView === 'mail' && !mailConnected()}>
        <EmptyStatePanel
          graphic={EmptyStateEmailGraphic}
          title={t('soup.empty.mail.createTitle')}
          description={t('soup.empty.mail.createDescription', {
            local: userEmail()?.split('@')[0] || 'you',
          })}
          primaryAction={{
            label: t('soup.empty.mail.createAction'),
            onClick: onCreateMailbox,
          }}
          documentationUrl={`${DOCS_BASE}/product/email`}
          documentationLabel={documentationLabel}
        />
      </Match>

      <Match when={props.listView === 'inbox' && mailConnected()}>
        {(() => {
          // Each inbox tab filters to a different slice, so the empty copy
          // should match: Signal is the important stuff, Noise is explicitly
          // the low-priority stuff, and All spans everything.
          const tab = soup.activeTab();
          const { title, description } =
            tab === 'noise'
              ? {
                  title: t('soup.empty.inbox.noNoiseTitle'),
                  description: (
                    <>
                      {t('soup.empty.inbox.noNoisePrefix')}
                      <br />
                      {t('soup.empty.inbox.noNoiseDescription')}
                    </>
                  ),
                }
              : tab === 'all'
                ? {
                    title: t('soup.empty.inbox.zeroTitle'),
                    description: t('soup.empty.inbox.allCaughtUp'),
                  }
                : {
                    title: t('soup.empty.inbox.zeroTitle'),
                    description: t('soup.empty.inbox.signalCaughtUp'),
                  };
          return (
            <EmptyStatePanel
              graphic={EmptyStateInboxTrayGraphic}
              title={title}
              description={description}
              documentationUrl={`${DOCS_BASE}/product/inbox`}
              documentationLabel={documentationLabel}
            />
          );
        })()}
      </Match>

      <Match when={props.listView === 'mail' && mailConnected()}>
        <EmptyStatePanel
          graphic={EmptyStateInboxTrayGraphic}
          title={t('soup.empty.mail.zeroTitle')}
          description={t('soup.empty.mail.zeroDescription')}
          documentationUrl={`${DOCS_BASE}/product/email`}
          documentationLabel={documentationLabel}
        />
      </Match>

      <Match when={props.listView === 'tasks'}>
        <EmptyStatePanel
          graphic={EmptyStateTasksGraphic}
          title={t('soup.empty.tasks.title')}
          description={t('soup.empty.tasks.description')}
          primaryAction={{
            label: t('soup.empty.tasks.create'),
            icon: PlusIcon,
            onClick: () => runCreateAction('task'),
          }}
          documentationUrl={`${DOCS_BASE}/product/tasks`}
          documentationLabel={documentationLabel}
        />
      </Match>

      <Match
        when={props.listView === 'agents' && soup.activeTab() === 'automations'}
      >
        <EmptyStatePanel
          graphic={EmptyStateAutomationsGraphic}
          title={t('soup.empty.automations.title')}
          description={t('soup.empty.automations.description')}
          primaryAction={{
            label: t('soup.empty.automations.create'),
            icon: PlusIcon,
            onClick: () => runCreateAction('automation'),
          }}
          documentationUrl={`${DOCS_BASE}/product/agents`}
          documentationLabel={documentationLabel}
        />
      </Match>

      <Match
        when={props.listView === 'agents' && soup.activeTab() === 'skills'}
      >
        <EmptyStatePanel
          graphic={EmptyStateAiGraphic}
          title={t('soup.empty.skills.title')}
          description={t('soup.empty.skills.description')}
          primaryAction={{
            label: t('soup.empty.skills.create'),
            icon: PlusIcon,
            onClick: () => runCreateAction('skill'),
          }}
          documentationUrl={`${DOCS_BASE}/product/agents`}
          documentationLabel={documentationLabel}
        />
      </Match>

      <Match when={props.listView === 'agents'}>
        <EmptyStatePanel
          graphic={EmptyStateAiGraphic}
          title={t('soup.empty.agents.title')}
          description={t('soup.empty.agents.description')}
          primaryAction={{
            label: t('soup.empty.agents.create'),
            icon: PlusIcon,
            onClick: () => runCreateAction('chat'),
          }}
          documentationUrl={`${DOCS_BASE}/product/agents`}
          documentationLabel={documentationLabel}
        />
      </Match>

      <Match when={props.listView === 'companies'}>
        <Switch>
          {/* Render nothing until the team query resolves — showing a wrong
              panel for a moment is worse than a brief blank. */}
          <Match when={!teamResolved()}>{null}</Match>
          <Match when={hasNoTeam()}>
            <EmptyStatePanel
              centered
              graphic={EmptyStateCompaniesGraphic}
              title={t('soup.empty.crm.joinTeamTitle')}
              description={t('soup.empty.crm.joinTeamDescription')}
              primaryAction={{
                label: t('soup.empty.crm.openTeamSettings'),
                onClick: () => openSettings('Team'),
              }}
            />
          </Match>
          <Match when={!crmEnabled()}>
            <EmptyStatePanel
              centered
              graphic={EmptyStateCompaniesGraphic}
              title={t('soup.empty.crm.disabledTitle')}
              description={
                isTeamAdmin()
                  ? t('soup.empty.crm.enableAdminDescription')
                  : t('soup.empty.crm.enableMemberDescription')
              }
              primaryAction={
                isTeamAdmin()
                  ? {
                      label: t('soup.empty.crm.openCrmSettings'),
                      onClick: () => openSettings('CRM'),
                    }
                  : undefined
              }
            />
          </Match>
          <Match when={true}>
            <EmptyStatePanel
              graphic={EmptyStateCompaniesGraphic}
              title={t('soup.empty.companies.title')}
              description={t('soup.empty.companies.description')}
            />
          </Match>
        </Switch>
      </Match>

      <Match
        when={
          props.listView === 'folders' ||
          // The Files split (the `documents` list view) surfaces folders under
          // its own Folders tab, so honor that tab here too — otherwise it
          // would fall through to the generic "No documents" fallback.
          (props.listView === 'documents' && soup.activeTab() === 'folders')
        }
      >
        <EmptyStatePanel
          graphic={EmptyStateFolderGraphic}
          title={t('soup.empty.folders.title')}
          description={t('soup.empty.folders.description')}
          primaryAction={{
            label: t('soup.empty.folders.create'),
            icon: PlusIcon,
            onClick: () => runCreateAction('project'),
          }}
          documentationUrl={`${DOCS_BASE}/product/folders`}
          documentationLabel={documentationLabel}
        >
          <FolderDropZone />
        </EmptyStatePanel>
      </Match>

      <Match when={props.listView === 'search'}>
        <EmptyStatePanel
          centered
          graphic={EmptyStateNoSearchMatchGraphic}
          title={t('soup.empty.search.title')}
          description={t('soup.empty.search.description')}
          documentationUrl={`${DOCS_BASE}/product/search`}
          documentationLabel={documentationLabel}
        />
      </Match>

      <Match when={true}>
        {(() => {
          const fallback = (props.listView &&
            fallbackContent()[props.listView]) ?? {
            title: t('soup.empty.generic.title'),
          };
          // A gated creatable is not offered here either. Nothing else stops
          // this button: a view can be reachable while the thing it creates is
          // flagged off, and `runCreateAction` would then decline the click.
          const createAction = () => {
            const create = fallback.create;
            if (!create || !isCreatableEnabled(create.blockName)) {
              return undefined;
            }
            return {
              label: create.label,
              icon: PlusIcon,
              onClick: () => {
                if (props.listView === 'channels') {
                  openNewChannelModal();
                  return;
                }
                runCreateAction(create.blockName);
              },
            };
          };
          return (
            <EmptyStatePanel
              graphic={fallback.graphic ?? EmptyStateInboxZeroGraphic}
              title={fallback.title}
              description={fallback.description}
              primaryAction={createAction()}
              documentationUrl={fallback.documentationUrl}
              documentationLabel={documentationLabel}
            />
          );
        })()}
      </Match>
    </Switch>
  );
}

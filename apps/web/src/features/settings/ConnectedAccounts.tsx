import { t } from '@app/lib/i18n';
import { ENABLE_EMAIL } from '@core/constant/featureFlags';
import { useCursorAgentsAccess } from '@core/cursor/flag';
import { usePipedreamMcpFlag } from '@core/pipedream/flag';
import { Show, Suspense } from 'solid-js';
import { CursorCard } from './Cursor';
import { EmailCard } from './Email';
import { GitHubCard } from './GitHub';
import { IntegrationsSection } from './Integrations';
import { PipedreamIntegrationsSection } from './PipedreamIntegrations';
import { SettingsPage, SettingsSection } from './primitives';

/**
 * Consolidated "Connections" page: one card per external account the user can
 * link (Gmail, GitHub), then the agent's MCP integrations, then the coding
 * agents — so everything Conation is connected to lives in one place.
 */
export function ConnectedAccounts() {
  const pipedreamMcp = usePipedreamMcpFlag();
  const canUseCursor = useCursorAgentsAccess();
  return (
    <SettingsPage
      title={t('settings.connections.title')}
      description={t('settings.connections.description')}
    >
      <SettingsSection title={t('settings.connections.accounts.title')}>
        <div class="flex flex-col gap-3">
          <Show when={ENABLE_EMAIL}>
            <Suspense>
              <EmailCard />
            </Suspense>
          </Show>
          <Suspense>
            <GitHubCard />
          </Suspense>
        </div>
      </SettingsSection>
      <Suspense>
        <Show when={pipedreamMcp()} fallback={<IntegrationsSection />}>
          <PipedreamIntegrationsSection />
        </Show>
      </Suspense>
      <Show when={canUseCursor()}>
        <SettingsSection
          title={t('settings.connections.codingSessions.title')}
          description={t('settings.connections.codingSessions.description')}
        >
          <Suspense>
            <CursorCard />
          </Suspense>
        </SettingsSection>
      </Show>
    </SettingsPage>
  );
}

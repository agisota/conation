import { ENABLE_EMAIL } from '@core/constant/featureFlags';
import { t } from '@app/lib/i18n';
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
 * agents — so everything Macro is connected to lives in one place.
 */
export function ConnectedAccounts() {
  const pipedreamMcp = usePipedreamMcpFlag();
  const canUseCursor = useCursorAgentsAccess();
  return (
    <SettingsPage
      title={t('auto.connections')}
      description="Connect your accounts so Macro can work across the tools you already use."
    >
      <SettingsSection title={t('auto.accounts')}>
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
          title={t('auto.coding_sessions')}
          description="Connect a coding agent so Macro can run sessions on your own account."
        >
          <Suspense>
            <CursorCard />
          </Suspense>
        </SettingsSection>
      </Show>
    </SettingsPage>
  );
}

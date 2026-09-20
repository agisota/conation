import { t } from '@app/lib/i18n';
import { McpSetupCards } from '@core/component/AI/component/McpSetupCards';
import { SettingsPage } from './primitives';

/**
 * The "MCP server" tab: setup instructions for pointing other agents and MCP
 * clients (Claude Code, Codex, IDEs, ...) at Conation's own MCP server. Managing
 * Conation's outbound connectors lives on the Integrations tab (see
 * `Integrations.tsx`).
 */
export function Agent() {
  return (
    <SettingsPage
      title={t('settings.agent.title')}
      description={t('settings.agent.description')}
    >
      <McpSetupCards class="max-w-none" />
    </SettingsPage>
  );
}

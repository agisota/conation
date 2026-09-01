import { McpSetupCards } from '@core/component/AI/component/McpSetupCards';
import { t } from '@app/lib/i18n';
import { SettingsPage } from './primitives';

/**
 * The "MCP server" tab: setup instructions for pointing other agents and MCP
 * clients (Claude Code, Codex, IDEs, ...) at Macro's own MCP server. Managing
 * Macro's outbound connectors lives on the Connections tab (see
 * `Integrations.tsx`).
 */
export function Agent() {
  return (
    <SettingsPage
      title={t('auto.macro_mcp_server')}
      description="Connect other agents and tools to your Macro workspace."
    >
      <McpSetupCards class="max-w-none" />
    </SettingsPage>
  );
}

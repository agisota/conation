import { getConfiguredStandaloneOperatorOrigin } from '@core/constant/clientProfile';

const mcpServerName = 'conation';

export const CONATION_MCP_URL = `${getConfiguredStandaloneOperatorOrigin()}/mcp`;

export const CONATION_MCP_CONFIG = JSON.stringify(
  {
    mcpServers: {
      [mcpServerName]: {
        type: 'http',
        url: CONATION_MCP_URL,
      },
    },
  },
  null,
  2
);

export const CLI_COMMANDS = [
  {
    key: 'claude-cli',
    labelKey: 'settings.agent.cli.claudeCode',
    command: `claude mcp add --transport http ${mcpServerName} ${CONATION_MCP_URL}`,
  },
  {
    key: 'codex-cli',
    labelKey: 'settings.agent.cli.codex',
    command: `codex mcp add ${mcpServerName} --url ${CONATION_MCP_URL}`,
  },
] as const;

export const WEB_CLIENTS = [
  {
    key: 'claude-web',
    labelKey: 'settings.agent.web.claude.label',
    hintKey: 'settings.agent.web.claude.hint',
  },
  {
    key: 'chatgpt-web',
    labelKey: 'settings.agent.web.chatgpt.label',
    hintKey: 'settings.agent.web.chatgpt.hint',
  },
] as const;

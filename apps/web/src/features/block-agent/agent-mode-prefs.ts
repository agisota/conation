export const AGENT_MODES = ['yolo', 'task', 'control'] as const;

export type AgentMode = (typeof AGENT_MODES)[number];

export type AgentModePrefsConfig = {
  kind: 'agent-mode-prefs';
  defaultMode: AgentMode;
};

export const AGENT_MODE_VIEW_NAME = 'agent-mode-prefs';

const MODE_SET = new Set<AgentMode>(AGENT_MODES);

export function isAgentMode(value: unknown): value is AgentMode {
  return typeof value === 'string' && MODE_SET.has(value as AgentMode);
}

export function isAgentModePrefsConfig(
  value: unknown
): value is AgentModePrefsConfig {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.kind === 'agent-mode-prefs';
}

export function parseAgentMode(value: unknown): AgentMode {
  if (isAgentModePrefsConfig(value) && isAgentMode(value.defaultMode)) {
    return value.defaultMode;
  }
  if (isAgentMode(value)) return value;
  return 'yolo';
}

export function toAgentModePrefsConfig(mode: AgentMode): AgentModePrefsConfig {
  return { kind: 'agent-mode-prefs', defaultMode: mode };
}

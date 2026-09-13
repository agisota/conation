import { describe, expect, it } from 'vitest';
import {
  isAgentModePrefsConfig,
  parseAgentMode,
  toAgentModePrefsConfig,
} from './agent-mode-prefs';

describe('parseAgentMode', () => {
  it('defaults to yolo', () => {
    expect(parseAgentMode(null)).toBe('yolo');
    expect(parseAgentMode({ kind: 'crm' })).toBe('yolo');
  });

  it('reads the stored default', () => {
    expect(
      parseAgentMode({ kind: 'agent-mode-prefs', defaultMode: 'task' })
    ).toBe('task');
    expect(
      parseAgentMode({ kind: 'agent-mode-prefs', defaultMode: 'control' })
    ).toBe('control');
  });
});

describe('isAgentModePrefsConfig', () => {
  it('accepts the prefs kind even before a mode is set', () => {
    expect(isAgentModePrefsConfig({ kind: 'agent-mode-prefs' })).toBe(true);
    expect(isAgentModePrefsConfig({ kind: 'activity-prefs' })).toBe(false);
  });
});

describe('toAgentModePrefsConfig', () => {
  it('wraps a mode for saved views', () => {
    expect(toAgentModePrefsConfig('control')).toEqual({
      kind: 'agent-mode-prefs',
      defaultMode: 'control',
    });
  });
});

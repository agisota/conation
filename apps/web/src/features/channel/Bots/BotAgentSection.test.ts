import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentSetupGuideUrl } from './BotAgentSection';

afterEach(() => vi.unstubAllEnvs());

describe('agentSetupGuideUrl', () => {
  it('uses the standalone operator documentation path', () => {
    vi.stubEnv('VITE_CONATION_CLIENT_PROFILE', 'standalone');
    vi.stubEnv(
      'VITE_CONATION_OPERATOR_ORIGIN',
      'https://operator.example.test'
    );

    expect(agentSetupGuideUrl()).toBe(
      'https://operator.example.test/docs/AI/bring-your-own'
    );
  });
});

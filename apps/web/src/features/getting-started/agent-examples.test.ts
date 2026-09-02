import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

async function prompts() {
  vi.resetModules();
  return (await import('./agent-examples')).AGENT_EXAMPLES.map(
    (example) => example.prompt
  );
}

describe('agent examples', () => {
  it('uses the standalone operator origin in prompts', async () => {
    vi.stubEnv('VITE_CONATION_CLIENT_PROFILE', 'standalone');
    vi.stubEnv(
      'VITE_CONATION_OPERATOR_ORIGIN',
      'https://operator.example.test'
    );

    expect(await prompts()).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'https://operator.example.test/app/settings/tags'
        ),
        expect.stringContaining(
          'https://operator.example.test/app/component/tasks'
        ),
      ])
    );
  });
});

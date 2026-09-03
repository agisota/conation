import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

async function promptLinks() {
  vi.resetModules();
  return (await import('./agent-examples')).AGENT_EXAMPLES.flatMap(
    (example) => (example.promptValues?.link ? [example.promptValues.link] : [])
  );
}

describe('agent examples', () => {
  it('uses the standalone operator origin in prompts', async () => {
    vi.stubEnv('VITE_CONATION_CLIENT_PROFILE', 'standalone');
    vi.stubEnv(
      'VITE_CONATION_OPERATOR_ORIGIN',
      'https://operator.example.test'
    );

    expect(await promptLinks()).toEqual(
      expect.arrayContaining([
        'https://operator.example.test/app/settings/tags',
        'https://operator.example.test/app/component/tasks',
      ])
    );
  });
});

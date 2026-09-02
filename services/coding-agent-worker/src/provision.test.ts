import { expect, test } from 'bun:test';
import type { CommandRunner } from './interfaces';
import {
  assertSafeRepoUrl,
  ENSURE_TIMEOUT_S,
  ensureReady,
  ensureReadyCommand,
} from './provision';

const dockerfile = await Bun.file(
  new URL('../container/Dockerfile', import.meta.url)
).text();
const openCodeConfig = await Bun.file(
  new URL('../container/opencode.json', import.meta.url)
).json();
const sidecarProxy = await Bun.file(
  new URL('../container/sidecar/src/server.rs', import.meta.url)
).text();

test('accepts a plain https repo url', () => {
  expect(() =>
    assertSafeRepoUrl('https://github.com/agisota/conation.git')
  ).not.toThrow();
});

test.each([
  ['not a url', 'nonsense'],
  ['non-https', 'http://github.com/agisota/conation.git'],
  ['non-GitHub host', 'https://example.com/agisota/conation.git'],
  ['embedded credential', 'https://token@github.com/agisota/conation.git'],
  ['query string', 'https://github.com/agisota/conation.git?token=unsafe'],
  ['non-repository path', 'https://github.com/agisota/conation/tree/main'],
  ['shell metacharacters', 'https://github.com/agisota/conation.git;rm -rf /'],
  ['command substitution', 'https://github.com/$(whoami)/conation.git'],
])('rejects %s', (_label, url) => {
  expect(() => assertSafeRepoUrl(url)).toThrow();
});

test('every stage guards itself so the script is idempotent', () => {
  const cmd = ensureReadyCommand();
  expect(cmd).toContain('if [ ! -d /workspace/.git ]');
  expect(cmd).toContain('if ! curl -sf localhost:8700/ping');
});

test('secrets come from the environment, not interpolation', () => {
  const cmd = ensureReadyCommand();
  expect(cmd).toContain('clone --depth 1 "$REPO_URL"');
  expect(cmd).toContain('gh auth setup-git --hostname github.com --force');
  expect(cmd).not.toContain('GITHUB_TOKEN');
  expect(cmd).not.toContain('http.extraHeader');
});

test('sidecar starts detached sourcing the baked repo env when present', () => {
  const cmd = ensureReadyCommand();
  expect(cmd).toContain('if [ -f /env/repo-dev-env.sh ]');
  expect(cmd).toContain('baked_path="$PATH"');
  expect(cmd).toContain('export PATH="$PATH:$baked_path"');
  expect(cmd).toContain('nohup /opt/acp-sidecar');
});

test('ensureReady runs the script with the ensure timeout', async () => {
  const calls: { command: string; timeoutS?: number }[] = [];
  const runner: CommandRunner = {
    async run(command, opts) {
      calls.push({ command, timeoutS: opts?.timeoutS });
    },
  };
  await ensureReady(runner);
  expect(calls).toEqual([
    { command: ensureReadyCommand(), timeoutS: ENSURE_TIMEOUT_S },
  ]);
});

test('image bake authenticates the private Conation clone only through BuildKit', () => {
  expect(dockerfile).toContain('--mount=type=secret,id=github_token');
  expect(dockerfile).toContain('GIT_ASKPASS');
  expect(dockerfile).toContain('https://github.com/agisota/conation.git');
  expect(dockerfile).not.toContain('ARG GITHUB_TOKEN');
  expect(dockerfile).not.toContain('github.com/macro-inc/macro');

  const secretStep = dockerfile
    .split("RUN --mount=type=secret,id=github_token bash <<'EOF'\n")[1]
    ?.split('\nEOF\n')[0];
  expect(secretStep).toContain('git -c credential.helper= clone');
  expect(secretStep).not.toContain('nix develop');
});

test('OpenCode exposes only the configured OmniRoute models', () => {
  expect(openCodeConfig.enabled_providers).toEqual(['rox']);
  expect(openCodeConfig.model).toBe('rox/gemini-2.5-flash');
  expect(openCodeConfig.provider.rox.options).toEqual({
    baseURL: 'http://127.0.0.1:8701/v1',
    apiKey: 'conation-local-proxy',
  });
  expect(JSON.stringify(openCodeConfig)).not.toContain('ROX_API_KEY');
  expect(sidecarProxy).not.toContain('ROX_API_KEY');
  expect(sidecarProxy).not.toContain('ROX_API_BASE_URL');
  expect(sidecarProxy).not.toContain('https://api.rox.one');
  expect(sidecarProxy).toContain('CONATION_MODEL_PROXY_URL');
  expect(sidecarProxy).toContain('CONATION_MODEL_SESSION_TOKEN');
  expect(sidecarProxy).toContain('/conation-model-proxy/v1');
  expect(sidecarProxy).toContain(
    'gemini-2.5-flash,nemotron-3-ultra,gpt-5.6-luna'
  );
  expect(sidecarProxy).not.toContain('ROX_FALLBACK_MODELS');
  expect(Object.keys(openCodeConfig.provider.rox.models)).toEqual([
    'gemini-2.5-flash',
    'nemotron-3-ultra',
    'gpt-5.6-luna',
  ]);
});

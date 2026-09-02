import { expect, test } from 'bun:test';
import type { CommandRunner } from './interfaces';
import {
  assertSafeRepoUrl,
  ENSURE_TIMEOUT_S,
  ensureReady,
  ensureReadyCommand,
} from './provision';

const dockerfile = await Bun.file(
  new URL('../container/Dockerfile', import.meta.url),
).text();
const openCodeConfig = await Bun.file(
  new URL('../container/opencode.json', import.meta.url),
).json();
const sidecarProxy = await Bun.file(
  new URL('../container/sidecar/src/server.rs', import.meta.url),
).text();
const sessionWorker = await Bun.file(
  new URL('./session.ts', import.meta.url),
).text();
const daytonaProvider = await Bun.file(
  new URL('./providers/daytona.ts', import.meta.url),
).text();

test('accepts a plain https repo url', () => {
  expect(() =>
    assertSafeRepoUrl('https://github.com/agisota/conation.git'),
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

test('sandbox clones only through its scoped egress capability', () => {
  const cmd = ensureReadyCommand();
  expect(cmd).toContain('egress_git_url="${CONATION_EGRESS_URL%/}/git"');
  expect(cmd).toContain('clone --depth 1 "$egress_git_url"');
  expect(cmd).toContain(
    'credential.$egress_git_url.helper=$git_credential_helper',
  );
  expect(cmd).toContain('CONATION_SESSION_TOKEN');
  expect(cmd).not.toContain('REPO_URL');
  expect(cmd).not.toContain('GITHUB_TOKEN');
  expect(cmd).not.toContain('gh auth');
  expect(cmd).not.toContain('http.extraHeader');
});

test('worker injects egress and model capabilities, never GitHub credentials', () => {
  expect(sessionWorker).toContain('CONATION_EGRESS_URL: opts.egress.baseUrl');
  expect(sessionWorker).toContain(
    'CONATION_SESSION_TOKEN: opts.egress.sessionToken',
  );
  expect(sessionWorker).toContain('CONATION_MODEL_SESSION_TOKEN');
  expect(sessionWorker).not.toContain('GITHUB_TOKEN');
  expect(sessionWorker).not.toContain('REPO_URL');
  expect(daytonaProvider).not.toContain('REPO_URL');
  expect(daytonaProvider).not.toContain('GITHUB_TOKEN');
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

test('image contains no GitHub credential or repository bake path', () => {
  expect(dockerfile).not.toContain('github_token');
  expect(dockerfile).not.toContain('GIT_ASKPASS');
  expect(dockerfile).not.toContain('https://github.com/agisota/conation.git');
  expect(dockerfile).not.toContain('GITHUB_TOKEN');
  expect(dockerfile).not.toContain('github.com/macro-inc/macro');
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
    'gemini-2.5-flash,nemotron-3-ultra,gpt-5.6-luna',
  );
  expect(sidecarProxy).not.toContain('ROX_FALLBACK_MODELS');
  expect(Object.keys(openCodeConfig.provider.rox.models)).toEqual([
    'gemini-2.5-flash',
    'nemotron-3-ultra',
    'gpt-5.6-luna',
  ]);
  expect(JSON.stringify(openCodeConfig)).not.toContain('github-mcp-server');
  expect(JSON.stringify(openCodeConfig)).not.toContain('GITHUB_TOKEN');
});

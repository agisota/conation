import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';

const cli = join(import.meta.dir, 'source-baseline.mjs');
const temporaryDirectories: string[] = [];
const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);

function put(root: string, path: string, bytes: string | Buffer) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}

function git(root: string, ...args: string[]) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

interface Fixture {
  directory: string;
  root: string;
  expected: string;
  sourceSha: string;
  dist: string;
  cache: string;
  fold: string;
  binaries: { serviceName: string; packageName: string; binary: string; path: string }[];
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'rus-1447-baseline-'));
  temporaryDirectories.push(directory);
  const root = join(directory, 'checkout');
  mkdirSync(root);
  const definitions = [
    { serviceName: 'auth', packageName: 'auth_pkg', binaries: ['auth'] },
    { serviceName: 'email', packageName: 'email_pkg', binaries: ['email', 'workers'] },
  ];
  put(root, 'nix/cloud-storage.nix', `deployServiceBinaryDefinitions = [\n${definitions.map(({ serviceName, packageName, binaries }) => `  { serviceName = "${serviceName}"; packageName = "${packageName}"; binaries = [ ${binaries.map((binary) => `"${binary}"`).join(' ')} ]; }`).join('\n')}\n];\n`);
  for (const path of [
    'flake.lock', 'bun.lock', 'Cargo.lock', 'rust-toolchain.toml',
    'nix-support/root-cargo-output-hashes.nix',
    'nix-support/bun-pinned.nix',
    'nix-support/node_modules-hashes.json',
    'nix-support/node_modules.nix',
    'apps/web/patches/dependency.patch',
    'packages/sdk/bun.lock',
    'apps/web/src/lib/service-clients/service-auth/openapi.json',
    'apps/web/src/lib/service-clients/service-auth/generated/client.ts',
    'apps/web/src/lib/service-clients/service-auth/graphql/generated/graphql.ts',
    'packages/sdk/specs/auth.json',
    'packages/sdk/generated/auth/client.ts',
  ]) put(root, path, `pinned: ${path}\n`);
  put(root, 'apps/web/package.json', '{"version":"2.5.0"}\n');
  git(root, 'init', '-q');
  git(root, 'add', '.');
  git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'pinned fixture');
  const sourceSha = git(root, 'rev-parse', 'HEAD');
  const shortSha = git(root, 'rev-parse', '--short', 'HEAD');
  const cache = 'apps/web/src/lib/graphql-cache/wasm';
  const fold = 'apps/web/src/lib/core/agent-fold/wasm';
  put(root, `${cache}/cache_wasm_bg.wasm`, wasm);
  put(root, `${cache}/cache_wasm.js`, 'export default function init() {}\n');
  put(root, `${fold}/agent_fold_bg.wasm`, wasm);
  put(root, `${fold}/agent_fold.js`, 'export default function init() {}\n');
  const dist = 'apps/web/dist';
  put(root, `${dist}/index.html`, '<html><meta name="macro-bundle-build" content="1"><script type="module" src="/app/assets/index-hash.js"></script></html>');
  put(root, `${dist}/assets/index-hash.js`, 'export const built = true;\n');
  put(root, `${dist}/semver.txt`, `2.5.0+${shortSha}\n`);
  put(root, `${dist}/bundle-manifest.json`, `${JSON.stringify({ schemaVersion: 2, bundleBuild: 1, minNativeBuild: 0, gitSha: shortSha, appVersion: '2.5.0' })}\n`);
  for (const [name, source] of [['cache_wasm', cache], ['agent_fold', fold]]) {
    put(root, `${dist}/assets/${name}_bg-hash.wasm`, readFileSync(join(root, source, `${name}_bg.wasm`)));
    put(root, `${dist}/assets/${name}-hash.js`, `export { built } from './index-hash.js';\n`);
  }
  put(root, `${dist}/assets/cache_wasm_bg-hash.wasm.br`, brotliCompressSync(wasm));
  const binaries = definitions.flatMap(({ serviceName, packageName, binaries }) => binaries.map((binary) => ({
    serviceName, packageName, binary, path: `${serviceName}/bin/${binary}`,
  })));
  for (const entry of binaries) {
    put(root, `release/${entry.path}`, Buffer.from(`release-${entry.binary}`));
    chmodSync(join(root, `release/${entry.path}`), 0o755);
  }
  const expected = join(directory, 'expected.json');
  writeFileSync(expected, JSON.stringify({ sourceSha, binaries }));
  return { directory, root, expected, sourceSha, dist, cache, fold, binaries };
}


function run(f: Fixture, extras: string[] = []) {
  return spawnSync(process.execPath, [cli,
    '--checkout', f.root, '--expected', f.expected,
    '--cache-wasm', join(f.root, f.cache), '--agent-wasm', join(f.root, f.fold),
    '--dist', join(f.root, f.dist), '--binaries', join(f.root, 'release'),
    ...extras,
  ], { encoding: 'utf8' });
}

function rejected(f: Fixture, pattern: RegExp, extras: string[] = []) {
  const result = run(f, extras);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(pattern);
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('source-baseline public CLI', () => {
  test('inventories every source, dist and declared binary reproducibly', () => {
    const f = fixture();
    const first = run(f);
    expect(first.status).toBe(0);
    const second = run(f);
    expect(second.status).toBe(0);
    expect(second.stdout).toBe(first.stdout);
    const manifest = JSON.parse(first.stdout);
    expect(manifest.sourceSha).toBe(f.sourceSha);
    expect(manifest.binaries.map((entry: { binary: string }) => entry.binary)).toEqual(['auth', 'email', 'workers']);
    expect(manifest.files.map((entry: { path: string }) => entry.path)).toContain('dist/assets/cache_wasm_bg-hash.wasm.br');
    expect(manifest.files.map((entry: { path: string }) => entry.path)).toContain('source/packages/sdk/generated/auth/client.ts');
    expect(manifest.files.map((entry: { path: string }) => entry.path)).toContain('source/apps/web/src/lib/service-clients/service-auth/graphql/generated/graphql.ts');
    expect(manifest.files.map((entry: { path: string }) => entry.path)).toEqual([...manifest.files.map((entry: { path: string }) => entry.path)].sort());
    expect(manifest.digest).toMatch(/^[a-f0-9]{64}$/);
    const entry = manifest.files.find((file: { path: string }) => file.path === 'binaries/email/bin/workers');
    expect(entry.sha256).toBe(createHash('sha256').update('release-workers').digest('hex'));
    expect(entry.size).toBe(15);
    const previous = join(f.directory, 'previous.json');
    writeFileSync(previous, first.stdout);
    expect(run(f, ['--verify', previous]).status).toBe(0);
    put(f.root, 'release/email/bin/workers', 'different-output');
    rejected(f, /verify.*mismatch|mismatch.*verify/i, ['--verify', previous]);
  });

  test('rejects an untracked nested generated service-client file', () => {
    const f = fixture();
    put(f.root, 'apps/web/src/lib/service-clients/service-auth/graphql/generated/rogue.ts', 'untracked');
    rejected(f, /unexpected untracked generated.*rogue\.ts/i);
  });

  test('rejects a changed tracked lock against the pinned commit', () => {
    const f = fixture();
    put(f.root, 'bun.lock', 'changed\n');
    rejected(f, /bun\.lock.*(modified|mismatch)/i);
  });

  test('rejects a dirty pinned Bun source expression', () => {
    const f = fixture();
    put(f.root, 'nix-support/bun-pinned.nix', 'changed\n');
    rejected(f, /bun-pinned\.nix.*(modified|mismatch)/i);
  });

  test('rejects missing or unexpected generated WASM', () => {
    const f = fixture();
    rmSync(join(f.root, f.fold, 'agent_fold_bg.wasm'));
    rejected(f, /agent_fold_bg\.wasm.*missing/i);
    put(f.root, `${f.fold}/agent_fold_bg.wasm`, wasm);
    put(f.root, `${f.cache}/extra.wasm`, wasm);
    rejected(f, /cache.*(unexpected|duplicate)|unexpected.*cache/i);
  });

  test('rejects duplicate emitted WASM, missing bin and wrong declaration set', () => {
    const f = fixture();
    put(f.root, `${f.dist}/assets/cache_wasm_bg-other.wasm`, wasm);
    rejected(f, /cache.*(duplicate|exactly one)/i);
    rmSync(join(f.root, f.dist, 'assets/cache_wasm_bg-other.wasm'));
    rmSync(join(f.root, 'release/email/bin/workers'));
    rejected(f, /workers.*missing/i);
    put(f.root, 'release/email/bin/workers', 'release-workers');
    writeFileSync(f.expected, JSON.stringify({ sourceSha: f.sourceSha, binaries: f.binaries.slice(0, -1) }));
    rejected(f, /binary.*set|set.*binary/i);
  });

  test('rejects symlink, traversal, empty and mismatched binary outputs', () => {
    const f = fixture();
    rmSync(join(f.root, 'release/auth/bin/auth'));
    symlinkSync('/etc/hosts', join(f.root, 'release/auth/bin/auth'));
    rejected(f, /symlink/i);
    rmSync(join(f.root, 'release/auth/bin/auth'));
    put(f.root, 'release/auth/bin/auth', '');
    rejected(f, /empty.*auth|auth.*empty/i);
    put(f.root, 'release/auth/bin/auth', 'release-auth');
    put(f.root, 'release/auth/bin/rogue', 'rogue');
    rejected(f, /unexpected.*rogue|rogue.*unexpected/i);
    rmSync(join(f.root, 'release/auth/bin/rogue'));
    writeFileSync(f.expected, JSON.stringify({ sourceSha: f.sourceSha, binaries: f.binaries.map((entry) => ({ ...entry, path: '../escape' })) }));
    rejected(f, /escaping|traversal|invalid.*path/i);
  });

  test('rejects invalid Brotli and generated-versus-emitted WASM mismatch', () => {
    const f = fixture();
    put(f.root, `${f.dist}/assets/cache_wasm_bg-hash.wasm.br`, 'not brotli');
    rejected(f, /brotli/i);
    put(f.root, `${f.dist}/assets/cache_wasm_bg-hash.wasm.br`, brotliCompressSync(wasm));
    put(f.root, `${f.dist}/assets/agent_fold_bg-hash.wasm`, Buffer.concat([wasm, Buffer.from([0])]));
    rejected(f, /agent.*mismatch/i);
  });

  test('rejects wrong source SHA, malformed bundle metadata and mismatched semver', () => {
    const f = fixture();
    writeFileSync(f.expected, JSON.stringify({ sourceSha: '0'.repeat(40), binaries: f.binaries }));
    rejected(f, /source.*SHA.*mismatch/i);
    writeFileSync(f.expected, JSON.stringify({ sourceSha: f.sourceSha, binaries: f.binaries }));
    put(f.root, `${f.dist}/bundle-manifest.json`, '{"schemaVersion":1,"bundleBuild":0,"minNativeBuild":0,"gitSha":"bad","appVersion":"2.5.0"}');
    rejected(f, /bundle-manifest.*(schemaVersion|invalid)/i);
    put(f.root, `${f.dist}/bundle-manifest.json`, JSON.stringify({ schemaVersion: 2, bundleBuild: 1, minNativeBuild: 0, gitSha: git(f.root, 'rev-parse', '--short', 'HEAD'), appVersion: '2.5.0' }));
    put(f.root, `${f.dist}/semver.txt`, '2.5.0+wrong\n');
    rejected(f, /semver.*mismatch/i);
  });
  test('rejects a missing production entry chunk even when WASM glue remains', () => {
    const f = fixture();
    rmSync(join(f.root, f.dist, 'assets/index-hash.js'));
    rejected(f, /index\.html.*entry|entrypoint.*missing/i);
  });

  test('rejects output symlink parent pointing back into the checkout', () => {
    const f = fixture();
    const redirect = join(f.directory, 'redirect');
    symlinkSync(f.root, redirect, 'dir');
    const unexpected = join(f.root, 'unexpected.json');
    rejected(f, /output.*(symlink|checkout|outside)/i, ['--output', join(redirect, 'unexpected.json')]);
    expect(existsSync(unexpected)).toBe(false);
  });

});

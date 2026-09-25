#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';

const requiredInputs = [
  'Cargo.lock',
  'bun.lock',
  'flake.lock',
  'rust-toolchain.toml',
  'nix/cloud-storage.nix',
  'nix-support/bun-pinned.nix',
  'nix-support/node_modules-hashes.json',
  'nix-support/node_modules.nix',
  'nix-support/root-cargo-output-hashes.nix',
  'apps/web/package.json',
  'packages/sdk/bun.lock',
];
const groups = ['source', 'cache-wasm', 'agent-wasm', 'dist', 'binaries'];
const hexSha = /^[0-9a-f]{40,64}$/;

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function jsonFile(path, label) {
  try {
    const stats = lstatSync(path);
    if (stats.isSymbolicLink() || !stats.isFile()) fail(`${label}: symlink or non-file input`);
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${label}: invalid or missing JSON: ${error.message}`);
  }
}

function comparePath(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function relativePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || isAbsolute(value) || value.includes('\\') || value.includes('\0') || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail(`${label}: invalid escaping/traversal path ${JSON.stringify(value)}`);
  }
  return value;
}

function optionPaths(args) {
  const keys = ['checkout', 'expected', 'cache-wasm', 'agent-wasm', 'dist', 'binaries'];
  const optional = ['verify', 'output'];
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.startsWith('--') ? args[i].slice(2) : undefined;
    if (!key || ![...keys, ...optional].includes(key) || !args[i + 1] || options[key]) {
      fail(`usage: source-baseline.mjs ${keys.map((name) => `--${name} <path>`).join(' ')} [--verify <previous.json>] [--output <new.json>]; invalid option ${JSON.stringify(args[i])}`);
    }
    options[key] = resolve(args[i + 1]);
  }
  for (const key of keys) if (!options[key]) fail(`missing --${key}`);
  if (options.output && (options.output === options.expected || options.output === options.verify || options.output.startsWith(`${options.checkout}${sep}`))) {
    fail('--output must be a new path outside the checkout and distinct from input manifests');
  }
  return options;
}

// Named roots outside the checkout are allowed. No symlink may redirect a
// syntactically checkout-relative output into an unrelated directory.
function checkedRoot(path, label, checkout) {
  const stats = lstatSync(path);
  if (stats.isSymbolicLink() || !stats.isDirectory()) fail(`${label}: expected real directory, not symlink: ${path}`);
  if (checkout && path.startsWith(`${checkout}${sep}`)) {
    let current = checkout;
    for (const part of relative(checkout, path).split(sep)) {
      current = join(current, part);
      if (lstatSync(current).isSymbolicLink()) fail(`${label}: symlink in output root ${current}`);
    }
  }
  return realpathSync(path);
}

function checkedFile(root, path, label) {
  const location = resolve(root, path);
  if (location !== root && !location.startsWith(`${root}${sep}`)) fail(`${label}: escaping root`);
  let current = root;
  const parts = relative(root, location).split(sep);
  let fileStats;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    let stats;
    try {
      stats = lstatSync(current);
    } catch (error) {
      fail(`${label}: missing ${current}: ${error.code}`);
    }
    if (stats.isSymbolicLink()) fail(`${label}: symlink not allowed at ${current}`);
    if (index < parts.length - 1 && !stats.isDirectory()) fail(`${label}: non-directory path ${current}`);
    if (index === parts.length - 1 && !stats.isFile()) fail(`${label}: not a regular file ${current}`);
    if (index === parts.length - 1) fileStats = stats;
  }
  const bytes = readFileSync(location);
  if (bytes.length === 0) fail(`${label}: empty file ${path}`);
  return { bytes, location, stats: fileStats };
}

function walk(root, group) {
  const found = [];
  function visit(directory, prefix) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) fail(`${group}: symlink not allowed at ${name}`);
      if (entry.isDirectory()) visit(join(directory, entry.name), name);
      else if (entry.isFile()) found.push(name);
      else fail(`${group}: non-regular output ${name}`);
    }
  }
  visit(root, '');
  if (found.length === 0) fail(`${group}: missing or empty output directory`);
  return found.sort();
}

function git(root, ...args) {
  try {
    return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
  } catch (error) {
    fail(`git ${args.join(' ')} failed: ${String(error.stderr || error.message).trim()}`);
  }
}

function sourceTree(root, expectedSha) {
  const head = git(root, 'rev-parse', 'HEAD').toString().trim();
  if (!hexSha.test(expectedSha) || head !== expectedSha) fail(`source SHA mismatch: expected ${expectedSha}, checkout HEAD ${head}`);
  const format = git(root, 'rev-parse', '--show-object-format').toString().trim();
  if (!['sha1', 'sha256'].includes(format)) fail(`unknown Git object format ${format}`);
  const tree = new Map();
  for (const entry of git(root, 'ls-tree', '-rz', 'HEAD').toString().split('\0')) {
    if (!entry) continue;
    const match = /^(\d+) (\w+) ([a-f0-9]+)\t(.+)$/.exec(entry);
    if (!match) fail('malformed Git tree entry');
    tree.set(match[4], { mode: match[1], type: match[2], oid: match[3] });
  }
  const paths = [...tree.keys()].filter((path) =>
    requiredInputs.includes(path) ||
    /(?:^|\/)(?:Cargo|bun|flake)\.lock$/.test(path) ||
    path.startsWith('apps/web/patches/') ||
    path.startsWith('nix/patches/') ||
    path.startsWith('packages/sdk/specs/') ||
    path.startsWith('packages/sdk/generated/') ||
    /^apps\/web\/src\/lib\/service-clients\/[^/]+\/(?:openapi\.json|(?:[^/]+\/)*generated\/.*)$/.test(path)
  ).sort();
  for (const path of requiredInputs) if (!paths.includes(path)) fail(`source: missing required input ${path}`);
  for (const [label, prefix] of [
    ['service-client generated', /^apps\/web\/src\/lib\/service-clients\/[^/]+\/generated\//],
    ['service-client OpenAPI', /^apps\/web\/src\/lib\/service-clients\/[^/]+\/openapi\.json$/],
    ['SDK specs', /^packages\/sdk\/specs\//],
    ['SDK generated', /^packages\/sdk\/generated\//],
    ['dependency patches', /^apps\/web\/patches\//],
  ]) if (!paths.some((path) => prefix.test(path))) fail(`source: missing ${label} inputs`);
  for (const path of paths) {
    const entry = tree.get(path);
    if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) fail(`source: symlink or unsupported Git entry ${path}`);
  }
  const tracked = new Set(paths);
  for (const prefix of ['packages/sdk/specs', 'packages/sdk/generated', 'apps/web/patches']) {
    for (const path of walk(checkedRoot(join(root, prefix), `source/${prefix}`), `source/${prefix}`)) {
      if (!tracked.has(`${prefix}/${path}`)) fail(`source: unexpected untracked generated/source file ${prefix}/${path}`);
    }
  }
  const serviceClients = checkedRoot(join(root, 'apps/web/src/lib/service-clients'), 'service clients');
  function findGenerated(directory, prefix) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${prefix}/${entry.name}`;
      if (entry.isSymbolicLink()) fail(`source: symlink in service clients ${path}`);
      if (entry.isDirectory()) findGenerated(join(directory, entry.name), path);
      else if (entry.isFile() && (/\/generated\//.test(path) || /\/openapi\.json$/.test(path)) && !tracked.has(path)) {
        fail(`source: unexpected untracked generated file ${path}`);
      }
    }
  }
  findGenerated(serviceClients, 'apps/web/src/lib/service-clients');
  return { head, format, tree, paths };
}

function parseDeployDefinitions(text) {
  const start = /deployServiceBinaryDefinitions\s*=\s*\[/.exec(text);
  if (!start) fail('nix/cloud-storage.nix: missing deployServiceBinaryDefinitions');
  const remainder = text.slice(start.index + start[0].length);
  let depth = 1;
  let end = -1;
  let quoted = false;
  for (let index = 0; index < remainder.length; index++) {
    const char = remainder[index];
    if (char === '"' && remainder[index - 1] !== '\\') quoted = !quoted;
    if (!quoted && char === '[') depth++;
    if (!quoted && char === ']' && --depth === 0) { end = index; break; }
  }
  if (end < 0 || remainder.slice(end + 1).trimStart()[0] !== ';') fail('nix/cloud-storage.nix: unclosed deployServiceBinaryDefinitions');
  const body = remainder.slice(0, end);
  const pattern = /\{\s*serviceName\s*=\s*"([a-z0-9-]+)"\s*;\s*packageName\s*=\s*"([a-zA-Z0-9_-]+)"\s*;\s*binaries\s*=\s*\[([^\]]*)\]\s*;\s*\}/g;
  const parsed = [];
  let cursor = 0;
  for (const match of body.matchAll(pattern)) {
    if (body.slice(cursor, match.index).trim()) fail('nix/cloud-storage.nix: unsupported deploy definition syntax');
    cursor = match.index + match[0].length;
    const bins = [...match[3].matchAll(/"([a-zA-Z0-9_-]+)"/g)].map((item) => item[1]);
    if (bins.length === 0 || match[3].replace(/"[a-zA-Z0-9_-]+"/g, '').trim()) fail(`nix/cloud-storage.nix: invalid binaries for ${match[1]}`);
    for (const binary of bins) parsed.push({ serviceName: match[1], packageName: match[2], binary });
  }
  if (body.slice(cursor).trim() || parsed.length === 0) fail('nix/cloud-storage.nix: incomplete deploy binary definitions');
  if (new Set(parsed.map(({ serviceName, binary }) => `${serviceName}/${binary}`)).size !== parsed.length) fail('nix/cloud-storage.nix: duplicate deploy binary');
  return parsed.sort((a, b) => comparePath(`${a.serviceName}/${a.binary}`, `${b.serviceName}/${b.binary}`));
}

function expectedBinaries(input, deploy) {
  if (!Array.isArray(input.binaries) || input.binaries.length !== deploy.length) fail(`expected binary set differs from deploy inventory (${deploy.length} required)`);
  const expected = new Map(deploy.map((entry) => [`${entry.serviceName}/${entry.binary}`, entry]));
  const paths = new Set();
  for (const entry of input.binaries) {
    if (!entry || typeof entry !== 'object') fail('expected binary set: malformed entry');
    const key = `${entry.serviceName}/${entry.binary}`;
    const known = expected.get(key);
    if (!known || entry.packageName !== known.packageName) fail(`expected binary set: wrong or duplicate package/bin ${key}`);
    expected.delete(key);
    relativePath(entry.path, `binary ${key}`);
    if (paths.has(entry.path)) fail(`expected binary set: duplicate output path ${entry.path}`);
    paths.add(entry.path);
  }
  if (expected.size) fail(`expected binary set: missing ${[...expected.keys()].join(', ')}`);
  return input.binaries.map(({ serviceName, packageName, binary, path }) => ({ serviceName, packageName, binary, path })).sort((a, b) => comparePath(a.path, b.path));
}

function oneFile(files, pattern, label) {
  const matches = files.filter((path) => pattern.test(basename(path)));
  if (matches.length !== 1) fail(`${label}: expected exactly one file, found ${matches.length} (duplicate/missing)`);
  return matches[0];
}

function checkWasm(root, names, label, prefix) {
  if (!names.includes(`${prefix}_bg.wasm`)) fail(`${label}: ${prefix}_bg.wasm missing`);
  const binary = oneFile(names, new RegExp(`^${prefix}_bg\\.wasm$`), label);
  oneFile(names, new RegExp(`^${prefix}\\.js$`), label);
  if (names.some((name) => name.endsWith('.wasm') && name !== binary)) fail(`${label}: unexpected duplicate WASM`);
  const bytes = checkedFile(root, binary, label).bytes;
  if (!bytes.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))) fail(`${label}: invalid WASM header`);
  return bytes;
}

function webMetadata(root, checkout, names, head) {
  for (const path of ['index.html', 'semver.txt', 'bundle-manifest.json']) if (!names.includes(path)) fail(`dist: missing ${path}`);
  const manifest = jsonFile(join(root, 'bundle-manifest.json'), 'bundle-manifest.json');
  const packageJson = jsonFile(join(checkout, 'apps/web/package.json'), 'apps/web/package.json');
  const version = packageJson.version;
  const short = head.slice(0, 7);
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version || '') ||
      manifest.schemaVersion !== 2 || !Number.isSafeInteger(manifest.bundleBuild) || manifest.bundleBuild < 1 ||
      !Number.isSafeInteger(manifest.minNativeBuild) || manifest.minNativeBuild < 0 ||
      manifest.appVersion !== version || !/^[0-9a-f]{7,40}$/.test(manifest.gitSha || '') ||
      !head.startsWith(manifest.gitSha) || manifest.gitSha.length < short.length) {
    fail('bundle-manifest.json: invalid schema, build metadata or source SHA mismatch');
  }
  const semver = checkedFile(root, 'semver.txt', 'dist').bytes.toString('utf8').trim();
  if (semver !== `${version}+${manifest.gitSha}`) fail('semver.txt: mismatch with bundle-manifest.json version/source SHA');
  const index = checkedFile(root, 'index.html', 'dist').bytes.toString('utf8');
  if (index.includes('__MACRO_BUNDLE_BUILD__') || !index.includes(`name="macro-bundle-build" content="${manifest.bundleBuild}"`)) {
    fail('dist/index.html: wrong build metadata or unresolved build placeholder');
  }
  const entryScripts = [...index.matchAll(/<script\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .filter((tag) => /\btype\s*=\s*(["'])module\1/i.test(tag))
    .map((tag) => /\bsrc\s*=\s*(["'])(\/app\/[^"']+\.js)\1/i.exec(tag)?.[2])
    .filter(Boolean);
  if (entryScripts.length === 0) fail('dist/index.html: missing /app production entrypoint');
  for (const url of entryScripts) checkedFile(root, relativePath(url.slice('/app/'.length), 'dist entrypoint'), 'dist entrypoint');
  return manifest;
}

function run() {
  const options = optionPaths(process.argv.slice(2));
  const root = checkedRoot(options.checkout, 'checkout');
  if (options.output) {
    const parent = realpathSync(dirname(options.output));
    if (parent === root || parent.startsWith(`${root}${sep}`)) fail('--output must be outside the checkout');
  }
  const expected = jsonFile(options.expected, 'expected manifest');
  const source = sourceTree(root, expected.sourceSha);
  const deploy = parseDeployDefinitions(checkedFile(root, 'nix/cloud-storage.nix', 'source').bytes.toString('utf8'));
  const binaries = expectedBinaries(expected, deploy);
  const directories = {
    'cache-wasm': checkedRoot(options['cache-wasm'], 'cache-wasm', options.checkout),
    'agent-wasm': checkedRoot(options['agent-wasm'], 'agent-wasm', options.checkout),
    dist: checkedRoot(options.dist, 'dist', options.checkout),
    binaries: checkedRoot(options.binaries, 'binaries', options.checkout),
  };
  if (new Set(Object.values(directories)).size !== 4) fail('duplicate output roots');
  const lists = Object.fromEntries(Object.entries(directories).map(([group, directory]) => [group, walk(directory, group)]));
  const cacheBytes = checkWasm(directories['cache-wasm'], lists['cache-wasm'], 'cache WASM', 'cache_wasm');
  const agentBytes = checkWasm(directories['agent-wasm'], lists['agent-wasm'], 'agent WASM', 'agent_fold');
  webMetadata(directories.dist, root, lists.dist, source.head);
  const dist = lists.dist;
  const cache = oneFile(dist, /^cache_wasm_bg(?:-[\w-]+)?\.wasm$/, 'dist cache WASM');
  const agent = oneFile(dist, /^agent_fold_bg(?:-[\w-]+)?\.wasm$/, 'dist agent WASM');
  oneFile(dist, /^cache_wasm(?:-[\w-]+)?\.js$/, 'dist cache JS');
  oneFile(dist, /^agent_fold(?:-[\w-]+)?\.js$/, 'dist agent JS');
  if (!checkedFile(directories.dist, cache, 'dist cache WASM').bytes.equals(cacheBytes)) fail('cache WASM mismatch: generated and emitted bytes differ');
  if (!checkedFile(directories.dist, agent, 'dist agent WASM').bytes.equals(agentBytes)) fail('agent WASM mismatch: generated and emitted bytes differ');
  const sidecar = oneFile(dist, /^cache_wasm_bg(?:-[\w-]+)?\.wasm\.br$/, 'dist cache Brotli');
  if (sidecar !== `${cache}.br`) fail('dist cache Brotli: raw/sidecar names mismatch');
  try {
    if (!brotliDecompressSync(checkedFile(directories.dist, sidecar, 'dist cache Brotli').bytes).equals(cacheBytes)) fail('dist cache Brotli: raw/sidecar bytes mismatch');
  } catch (error) {
    fail(`dist cache Brotli: invalid compressed pair: ${error.message}`);
  }
  if (dist.some((path) => (path.endsWith('.wasm') && path !== cache && path !== agent && /(?:cache_wasm_bg|agent_fold_bg)/.test(path)) || (path.endsWith('.wasm.br') && path !== sidecar))) fail('dist: duplicate or unexpected WASM/Brotli sidecar');
  const requiredBinaryPaths = new Set(binaries.map(({ path }) => path));
  for (const path of lists.binaries) if (!requiredBinaryPaths.has(path)) fail(`binaries: unexpected ${path}`);
  for (const { path, binary } of binaries) {
    const { stats } = checkedFile(directories.binaries, path, `binary ${binary}`);
    if ((stats.mode & 0o111) === 0) fail(`binary ${binary}: not executable`);
  }
  const files = [];
  const locations = new Set();
  function add(group, directory, path, gitEntry) {
    const { bytes, location } = checkedFile(directory, path, group);
    if (locations.has(location)) fail(`duplicate artifact path ${location}`);
    locations.add(location);
    if (gitEntry) {
      const header = Buffer.from(`blob ${bytes.length}\0`);
      const oid = createHash(source.format).update(header).update(bytes).digest('hex');
      if (oid !== gitEntry.oid) fail(`source/${path}: modified expected input hashes (Git tree mismatch)`);
    }
    files.push({ path: `${group}/${path}`, size: bytes.length, sha256: sha256(bytes) });
  }
  for (const path of source.paths) add('source', root, path, source.tree.get(path));
  for (const group of groups.slice(1)) for (const path of lists[group]) add(group, directories[group], path);
  files.sort((a, b) => comparePath(a.path, b.path));
  const body = { schemaVersion: 1, sourceSha: source.head, binaries, files };
  const manifest = { ...body, digest: sha256(`${JSON.stringify(body)}\n`) };
  const output = `${JSON.stringify(manifest, null, 2)}\n`;
  if (options.verify) {
    const previous = jsonFile(options.verify, 'verify manifest');
    const { digest, ...oldBody } = previous;
    if (digest !== sha256(`${JSON.stringify(oldBody)}\n`) || JSON.stringify(oldBody) !== JSON.stringify(body)) fail('verify manifest mismatch: artifact inputs/outputs changed');
  }
  if (options.output) writeFileSync(options.output, output, { flag: 'wx', mode: 0o600 });
  else process.stdout.write(output);
}

try {
  run();
} catch (error) {
  console.error(`source-baseline: ${error.message}`);
  process.exitCode = 1;
}

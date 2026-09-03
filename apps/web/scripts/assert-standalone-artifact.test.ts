import { describe, expect, it } from 'vitest';
import {
  findForbiddenStandaloneLiterals,
  isTextualStandaloneArtifact,
} from './assert-standalone-artifact';

describe('standalone artifact validation', () => {
  it('accepts operator-owned endpoint literals', () => {
    expect(
      findForbiddenStandaloneLiterals(
        'https://conation.dev/mcp wss://conation.dev/sync conation://login'
      )
    ).toEqual([]);
  });

  it('reports managed endpoint and old scheme literals', () => {
    expect(
      findForbiddenStandaloneLiterals(
        'https://mcp-server.macro.com/mcp macro://login'
      )
    ).toEqual(['macro.com', 'macro://']);
    expect(findForbiddenStandaloneLiterals('https://macro.com')).toEqual([
      'macro.com',
    ]);
  });

  it('ignores host-suffix denylists and non-URL substrings', () => {
    expect(
      findForbiddenStandaloneLiterals(
        "const MANAGED_LEGACY_HOST_SUFFIXES = ['macro.com']; macromolecule notmacro.com ada@macro.com"
      )
    ).toEqual([]);
  });

  it('scans every textual release asset while excluding binary payloads', () => {
    for (const file of [
      'app.js',
      'app.css',
      'index.html',
      'manifest.webmanifest',
      'bundle-manifest.json',
      'app.js.map',
      'notices.md',
      'conation.svg',
      'semver.txt',
    ]) {
      expect(isTextualStandaloneArtifact(file)).toBe(true);
    }

    for (const file of ['cache.wasm', 'logo.png', 'app.js.br']) {
      expect(isTextualStandaloneArtifact(file)).toBe(false);
    }
  });
});

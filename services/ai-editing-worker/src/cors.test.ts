import { describe, expect, test } from 'vitest';
import { isOriginAllowed, parseAllowedOrigins } from './cors';

describe('browser origin policy', () => {
  test('uses Conation defaults without implicit Macro origins', () => {
    expect(isOriginAllowed('https://conation.dev')).toBe(true);
    expect(isOriginAllowed('https://app.conation.dev')).toBe(true);
    expect(isOriginAllowed('https://macro.com')).toBe(false);
    expect(isOriginAllowed('https://feature.preview.macro.com')).toBe(false);
  });

  test('uses an exact operator allowlist', () => {
    const configured =
      'https://workspace.example.org/,https://api.example.org:8443';

    expect(isOriginAllowed('https://workspace.example.org', configured)).toBe(
      true
    );
    expect(
      isOriginAllowed('https://workspace.example.org.attacker.test', configured)
    ).toBe(false);
    expect(isOriginAllowed('http://workspace.example.org', configured)).toBe(
      false
    );
    expect(isOriginAllowed('https://conation.dev', configured)).toBe(false);
  });

  test('rejects malformed configured origins', () => {
    for (const configured of [
      '',
      'https://workspace.example.org/path',
      'https://attacker@workspace.example.org',
      'javascript:alert(1)',
    ]) {
      expect(() => parseAllowedOrigins(configured)).toThrow();
    }
  });

  test('keeps bounded localhost development ports', () => {
    expect(isOriginAllowed('http://alice.localhost:3005')).toBe(true);
    expect(isOriginAllowed('http://alice.localhost:9000')).toBe(false);
    expect(isOriginAllowed('https://alice.localhost:3005')).toBe(false);
    expect(isOriginAllowed('http://alice.localhost.attacker:3005')).toBe(false);
  });
});

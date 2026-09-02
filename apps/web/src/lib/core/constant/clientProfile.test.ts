import { describe, expect, it } from 'vitest';
import {
  httpOriginToWebSocketOrigin,
  isManagedLegacyHostname,
  nativeAppSchemeForProfile,
  parseConationClientProfile,
  resolveStandaloneOperatorOrigin,
  validateStandaloneOperatorOriginInput,
  validateStandaloneServiceUrlInput,
} from './clientProfile';

describe('Conation client profile', () => {
  it('defaults to standalone and requires an explicit legacy selection', () => {
    expect(parseConationClientProfile(undefined)).toBe('standalone');
    expect(parseConationClientProfile('standalone')).toBe('standalone');
    expect(parseConationClientProfile('hosted-legacy')).toBe('hosted-legacy');
    expect(() => parseConationClientProfile('hosted')).toThrow(
      'VITE_CONATION_CLIENT_PROFILE'
    );
  });

  it('resolves same-origin at runtime and normalizes a configured origin', () => {
    expect(
      resolveStandaloneOperatorOrigin(
        'same-origin',
        'https://team.example.test:8443'
      )
    ).toBe('https://team.example.test:8443');
    expect(
      resolveStandaloneOperatorOrigin('https://conation.dev/', undefined)
    ).toBe('https://conation.dev');
  });

  it('rejects non-origin values and managed Macro infrastructure', () => {
    for (const value of [
      'ftp://conation.dev',
      'https://conation.dev/app',
      'https://conation.dev/?tenant=a',
      'https://macro.com',
      'https://auth-service.macro.com',
    ]) {
      expect(() => validateStandaloneOperatorOriginInput(value)).toThrow();
    }
    expect(isManagedLegacyHostname('notmacro.com')).toBe(false);
  });

  it('allows a standalone service path without weakening origin validation', () => {
    expect(
      validateStandaloneServiceUrlInput('http://localhost:23009/ai-editing/')
    ).toBe('http://localhost:23009/ai-editing');
    expect(validateStandaloneServiceUrlInput('/ai-editing/')).toBe(
      '/ai-editing'
    );
    for (const value of [
      'https://auth-service.macro.com/ai-editing',
      'https://conation.dev/ai-editing?tenant=a',
      'https://user:pass@conation.dev/ai-editing',
      '//mcp-server.macro.com/ai-editing',
      '/ai-editing?tenant=a',
      '/ai-editing#fragment',
    ]) {
      expect(() => validateStandaloneServiceUrlInput(value)).toThrow();
    }
  });

  it('derives websocket origins without weakening the scheme', () => {
    expect(httpOriginToWebSocketOrigin('https://conation.dev')).toBe(
      'wss://conation.dev'
    );
    expect(httpOriginToWebSocketOrigin('http://localhost:8090')).toBe(
      'ws://localhost:8090'
    );
  });

  it('keeps the legacy callback scheme behind the explicit legacy profile', () => {
    expect(nativeAppSchemeForProfile('standalone')).toBe('conation');
    expect(nativeAppSchemeForProfile('hosted-legacy')).toBe('macro');
  });
});

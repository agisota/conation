import { describe, expect, it, vi } from 'vitest';
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
  it('defaults to standalone and rejects the retired managed selection', () => {
    expect(parseConationClientProfile(undefined)).toBe('standalone');
    expect(parseConationClientProfile('standalone')).toBe('standalone');
    expect(() => parseConationClientProfile('hosted-legacy')).toThrow(
      'has been removed'
    );
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

  it('keeps managed Macro hosts blocked in a compiled standalone bundle', async () => {
    vi.stubGlobal('__CONATION_HOSTED_LEGACY__', false);
    vi.resetModules();

    try {
      const { validateStandaloneOperatorOriginInput } = await import(
        './clientProfile'
      );

      expect(() =>
        validateStandaloneOperatorOriginInput('https://macro.com')
      ).toThrow('Standalone Conation cannot target managed legacy host');
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
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

  it('uses the Conation callback scheme', () => {
    expect(nativeAppSchemeForProfile('standalone')).toBe('conation');
  });
});

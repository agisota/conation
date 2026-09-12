import { describe, expect, it } from 'vitest';
import {
  isLocalStackNativeTarget,
  resolveLocalStackOperatorOrigin,
} from './local-stack-operator-origin';

describe('local-stack operator origin', () => {
  it('requires an explicit origin and rejects hosted defaults', () => {
    expect(() => resolveLocalStackOperatorOrigin(undefined)).toThrow(
      'CONATION_OPERATOR_ORIGIN is required'
    );
    expect(() => resolveLocalStackOperatorOrigin('')).toThrow(
      'CONATION_OPERATOR_ORIGIN is required'
    );
    expect(() => resolveLocalStackOperatorOrigin('same-origin')).toThrow(
      'same-origin'
    );
    expect(() =>
      resolveLocalStackOperatorOrigin('https://conation.dev')
    ).toThrow('operator proxy');
    expect(() =>
      resolveLocalStackOperatorOrigin('https://conation.dev/')
    ).toThrow('operator proxy');
    expect(() =>
      resolveLocalStackOperatorOrigin('https://app.conation.dev')
    ).toThrow('operator proxy');
  });

  it('accepts a LAN or loopback operator proxy', () => {
    expect(resolveLocalStackOperatorOrigin('http://192.0.2.10:8090/')).toBe(
      'http://192.0.2.10:8090'
    );
    expect(resolveLocalStackOperatorOrigin('http://localhost:8090')).toBe(
      'http://localhost:8090'
    );
    expect(
      resolveLocalStackOperatorOrigin('https://conation.example.test:8443')
    ).toBe('https://conation.example.test:8443');
  });

  it('still rejects managed Macro hosts', () => {
    expect(() =>
      resolveLocalStackOperatorOrigin('https://macro.com')
    ).toThrow('managed legacy host');
  });

  it('recognizes the local-stack native target flag', () => {
    expect(isLocalStackNativeTarget('local-stack')).toBe(true);
    expect(isLocalStackNativeTarget(undefined)).toBe(false);
    expect(isLocalStackNativeTarget('standalone')).toBe(false);
  });
});

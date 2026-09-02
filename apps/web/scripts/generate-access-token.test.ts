import { describe, expect, it } from 'vitest';
import {
  LOCAL_FUSIONAUTH_ORIGIN,
  resolveFusionAuthOrigin,
} from './generate-access-token';

describe('resolveFusionAuthOrigin', () => {
  it('uses the documented local FusionAuth service by default', () => {
    expect(resolveFusionAuthOrigin(undefined)).toBe(LOCAL_FUSIONAUTH_ORIGIN);
  });

  it('normalizes an explicit operator-controlled FusionAuth origin', () => {
    expect(resolveFusionAuthOrigin('https://auth.conation.example/')).toBe(
      'https://auth.conation.example'
    );
  });

  it('rejects managed legacy hosts before a refresh token can be sent', () => {
    expect(() =>
      resolveFusionAuthOrigin('https://fusionauth-dev.macro.com')
    ).toThrow('managed legacy host');
  });

  it('requires an origin rather than a credential-bearing API URL', () => {
    expect(() =>
      resolveFusionAuthOrigin('https://token@example.conation/api')
    ).toThrow('without credentials, path, query, or fragment');
  });
});

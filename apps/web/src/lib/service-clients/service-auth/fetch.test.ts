/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { err, ok } from 'neverthrow';

const conationApiToken = vi.fn();

vi.mock('./client', () => ({
  authServiceClient: { conationApiToken },
  getExpiresAt: (token: string) => {
    try {
      const payload: unknown = JSON.parse(atob(token.split('.')[1]));
      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('exp' in payload)
      ) {
        return 0;
      }

      const expValue = payload.exp;
      if (typeof expValue !== 'number' && typeof expValue !== 'string') {
        return 0;
      }

      const exp = Number(expValue) * 1000;
      return Number.isFinite(exp) ? exp : 0;
    } catch {
      return 0;
    }
  },
}));

function jwt(exp: unknown) {
  const payload = btoa(JSON.stringify({ exp }));
  return `header.${payload}.signature`;
}

describe('getConationApiToken', () => {
  beforeEach(() => {
    vi.resetModules();
    conationApiToken.mockReset();
    localStorage.clear();
  });

  test('reuses an unexpired cached token', async () => {
    const token = jwt(Math.floor(Date.now() / 1000) + 3600);
    conationApiToken.mockResolvedValue(ok({ conation_api_token: token }));
    const { getConationApiToken } = await import('./fetch');

    await expect(getConationApiToken()).resolves.toBe(token);
    await expect(getConationApiToken()).resolves.toBe(token);

    expect(conationApiToken).toHaveBeenCalledTimes(1);
  });

  test('refreshes an expired cached token', async () => {
    const expired = jwt(Math.floor(Date.now() / 1000) - 60);
    const fresh = jwt(Math.floor(Date.now() / 1000) + 3600);
    conationApiToken
      .mockResolvedValueOnce(ok({ conation_api_token: expired }))
      .mockResolvedValueOnce(ok({ conation_api_token: fresh }));
    const { getConationApiToken } = await import('./fetch');

    await expect(getConationApiToken()).resolves.toBe(expired);
    await expect(getConationApiToken()).resolves.toBe(fresh);

    expect(conationApiToken).toHaveBeenCalledTimes(2);
  });

  test('refreshes a cached token with a non-scalar exp', async () => {
    const malformed = jwt([Math.floor(Date.now() / 1000) + 3600]);
    const fresh = jwt(Math.floor(Date.now() / 1000) + 3600);
    conationApiToken
      .mockResolvedValueOnce(ok({ conation_api_token: malformed }))
      .mockResolvedValueOnce(ok({ conation_api_token: fresh }));
    const { getConationApiToken } = await import('./fetch');

    await expect(getConationApiToken()).resolves.toBe(malformed);
    await expect(getConationApiToken()).resolves.toBe(fresh);

    expect(conationApiToken).toHaveBeenCalledTimes(2);
  });

  test('deduplicates concurrent requests when the cache is empty', async () => {
    const token = jwt(Math.floor(Date.now() / 1000) + 3600);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    conationApiToken.mockImplementation(async () => {
      await gate;
      return ok({ conation_api_token: token });
    });
    const { getConationApiToken } = await import('./fetch');

    const first = getConationApiToken();
    const second = getConationApiToken();

    expect(conationApiToken).toHaveBeenCalledTimes(1);
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([token, token]);
  });

  test('deduplicates concurrent refreshes of an expired cached token', async () => {
    const expired = jwt(Math.floor(Date.now() / 1000) - 60);
    const fresh = jwt(Math.floor(Date.now() / 1000) + 3600);
    conationApiToken.mockResolvedValueOnce(ok({ conation_api_token: expired }));
    const { getConationApiToken } = await import('./fetch');

    await expect(getConationApiToken()).resolves.toBe(expired);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    conationApiToken.mockImplementationOnce(async () => {
      await gate;
      return ok({ conation_api_token: fresh });
    });

    const first = getConationApiToken();
    const second = getConationApiToken();

    await Promise.resolve();
    expect(conationApiToken).toHaveBeenCalledTimes(2);
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([fresh, fresh]);
  });

  test('does not permanently cache a rejected token request', async () => {
    const fresh = jwt(Math.floor(Date.now() / 1000) + 3600);
    conationApiToken
      .mockResolvedValueOnce(
        err([{ code: 'UNAUTHORIZED' as const, message: 'Unauthorized access' }])
      )
      .mockResolvedValueOnce(ok({ conation_api_token: fresh }));
    const { getConationApiToken } = await import('./fetch');

    await expect(getConationApiToken()).rejects.toBeDefined();
    await expect(getConationApiToken()).resolves.toBe(fresh);

    expect(conationApiToken).toHaveBeenCalledTimes(2);
  });

  test('falls back to a persisted passwordless JWT when mint 401s', async () => {
    const persisted = jwt(Math.floor(Date.now() / 1000) + 3600);
    localStorage.setItem(
      'conationAccessToken',
      JSON.stringify({
        accessToken: persisted,
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600_000,
      })
    );
    conationApiToken.mockResolvedValueOnce(
      err([{ code: 'UNAUTHORIZED' as const, message: 'Unauthorized access' }])
    );
    const { getConationApiToken } = await import('./fetch');

    await expect(getConationApiToken()).resolves.toBe(persisted);
    expect(conationApiToken).toHaveBeenCalledTimes(1);
    localStorage.removeItem('conationAccessToken');
  });

  test('falls back to a persisted passwordless JWT when mint 500s', async () => {
    const persisted = jwt(Math.floor(Date.now() / 1000) + 3600);
    localStorage.setItem(
      'conationAccessToken',
      JSON.stringify({
        accessToken: persisted,
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600_000,
      })
    );
    conationApiToken.mockResolvedValueOnce(
      err([
        {
          code: 'SERVER_ERROR' as const,
          message: 'unable to encode Conation API token',
        },
      ])
    );
    const { getConationApiToken } = await import('./fetch');

    await expect(getConationApiToken()).resolves.toBe(persisted);
    expect(conationApiToken).toHaveBeenCalledTimes(1);
    localStorage.removeItem('conationAccessToken');
  });

  test('unsetConationApiTokenPromise drops an in-flight cache', async () => {
    const first = jwt(Math.floor(Date.now() / 1000) + 3600);
    const second = jwt(Math.floor(Date.now() / 1000) + 7200);
    conationApiToken
      .mockResolvedValueOnce(ok({ conation_api_token: first }))
      .mockResolvedValueOnce(ok({ conation_api_token: second }));
    const { getConationApiToken, unsetConationApiTokenPromise } =
      await import('./fetch');

    await expect(getConationApiToken()).resolves.toBe(first);
    unsetConationApiTokenPromise();
    await expect(getConationApiToken()).resolves.toBe(second);
    expect(conationApiToken).toHaveBeenCalledTimes(2);
  });
});

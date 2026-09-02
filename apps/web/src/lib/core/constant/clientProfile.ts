/** The greenfield client has one supported runtime: standalone Conation. */
export type ConationClientProfile = 'standalone';

// Keep this list in every bundle. Standalone origin validation must reject a
// legacy managed host even after Vite replaces __CONATION_HOSTED_LEGACY__ with
// `false` at build time. The legacy-hosted profile does not use the standalone
// validation entry points.
const MANAGED_LEGACY_HOST_SUFFIXES = ['macro.com'];

/**
 * Reject the retired managed profile explicitly rather than silently falling
 * back: a stale CI variable must not produce an artifact with Macro endpoints
 * or deep links.
 */
export function parseConationClientProfile(
  value: string | undefined
): ConationClientProfile {
  if (value === undefined || value === '' || value === 'standalone') {
    return 'standalone';
  }
  if (value === 'hosted-legacy') {
    throw new Error(
      'VITE_CONATION_CLIENT_PROFILE=hosted-legacy has been removed; use standalone'
    );
  }
  throw new Error(
    `VITE_CONATION_CLIENT_PROFILE must be "standalone", found ${JSON.stringify(value)}`
  );
}

export function isManagedLegacyHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return MANAGED_LEGACY_HOST_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`)
  );
}

function validateHttpUrl(value: string, allowPath: boolean): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `Conation operator origin must be an absolute http(s) origin, found ${JSON.stringify(value)}`
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Conation operator origin must use http or https, found ${parsed.protocol}`
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error('Conation operator origin must not contain credentials');
  }
  if (!allowPath && parsed.pathname !== '' && parsed.pathname !== '/') {
    throw new Error(
      'Conation operator origin must not contain a path, query, or fragment'
    );
  }
  if (parsed.search || parsed.hash) {
    throw new Error(
      'Conation operator origin must not contain a path, query, or fragment'
    );
  }
  if (isManagedLegacyHostname(parsed.hostname)) {
    throw new Error(
      `Standalone Conation cannot target managed legacy host ${parsed.hostname}`
    );
  }
  return parsed;
}

function validateRootHttpOrigin(value: string): URL {
  return validateHttpUrl(value, false);
}

/**
 * Resolve the standalone operator origin. `same-origin` is deliberately
 * resolved at runtime so one immutable web bundle can be served by any
 * operator hostname.
 */
export function resolveStandaloneOperatorOrigin(
  configured: string | undefined,
  runtimeOrigin: string | undefined
): string {
  const requested = configured?.trim() || 'same-origin';
  const value = requested === 'same-origin' ? runtimeOrigin : requested;
  if (!value) {
    throw new Error(
      'VITE_CONATION_OPERATOR_ORIGIN=same-origin requires a browser origin'
    );
  }
  return validateRootHttpOrigin(value).origin;
}

/** Validate a build input without trying to resolve the runtime page origin. */
export function validateStandaloneOperatorOriginInput(
  configured: string | undefined
): 'same-origin' | string {
  const requested = configured?.trim() || 'same-origin';
  if (requested === 'same-origin') return requested;
  return validateRootHttpOrigin(requested).origin;
}

/**
 * Validate an explicit standalone service endpoint.
 *
 * Service endpoints may live below the operator origin (for example
 * `/ai-editing` behind the local proxy), unlike the root operator origin.
 */
export function validateStandaloneServiceUrlInput(configured: string): string {
  const value = configured.trim();

  // A standalone bundle normally calls a service through the same reverse
  // proxy as the page itself. Keep this path relative so one build works on
  // every operator hostname, but never allow a protocol-relative URL to turn
  // it into an external host.
  if (value.startsWith('/')) {
    const base = new URL('https://conation.invalid');
    const parsed = new URL(value, base);
    if (parsed.origin !== base.origin || parsed.search || parsed.hash) {
      throw new Error(
        'Conation standalone service path must be a root-relative path without a query or fragment'
      );
    }
    return parsed.pathname.replace(/\/$/, '') || '/';
  }

  const parsed = validateHttpUrl(value, true);
  return parsed.href.replace(/\/$/, '');
}

export function httpOriginToWebSocketOrigin(origin: string): string {
  const parsed = validateRootHttpOrigin(origin);
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  return parsed.origin;
}

export function getConfiguredClientProfile(): ConationClientProfile {
  return parseConationClientProfile(
    import.meta.env.VITE_CONATION_CLIENT_PROFILE
  );
}

export function getConfiguredStandaloneOperatorOrigin(): string {
  return resolveStandaloneOperatorOrigin(
    import.meta.env.VITE_CONATION_OPERATOR_ORIGIN,
    globalThis.location?.origin
  );
}

/** Native callbacks use the Conation scheme in every supported build. */
export function nativeAppSchemeForProfile(
  _profile: ConationClientProfile
): 'conation' {
  return 'conation';
}

export function getConfiguredNativeAppScheme(): 'conation' {
  return nativeAppSchemeForProfile(getConfiguredClientProfile());
}

import { isTauri } from '@core/util/platform';
import { getConfiguredStandaloneOperatorOrigin } from '../constant/clientProfile';

const LegacyHostedAppHosts = {
  Prod: 'macro.com',
  Dev: 'dev.macro.com',
  Staging: 'staging.macro.com',
} as const;

const NativeLocalHosts = {
  Localhost: 'localhost',
  // The webview's own origin under the http asset scheme (e.g. Windows/Android),
  // where `window.location.hostname` is `tauri.localhost` rather than `localhost`.
  TauriLocalhost: 'tauri.localhost',
} as const;

function cleanHostname(hostname: string): string {
  // Strip only a leading `www.` (parity with the Rust `strip_prefix("www.")`);
  // a bare `replace('www.', '')` would also collapse a mid-string occurrence,
  // e.g. `macro.www.com` -> `macro.com`, letting a foreign host masquerade as
  // a Macro one.
  return hostname.toLowerCase().replace(/^www\./, '');
}

export function isValidMacroAppHostname(hostname: string): boolean {
  const current = cleanHostname(window.location.hostname);
  const target = cleanHostname(hostname);
  if (current === target) {
    return true;
  }
  const hostedLegacy =
    globalThis.__CONATION_HOSTED_LEGACY__ ??
    import.meta.env.VITE_CONATION_CLIENT_PROFILE === 'hosted-legacy';
  if (hostedLegacy) {
    if (
      (target === LegacyHostedAppHosts.Dev &&
        current === NativeLocalHosts.Localhost) ||
      (target === NativeLocalHosts.Localhost &&
        current === LegacyHostedAppHosts.Dev)
    ) {
      return true;
    }
    // The old hosted profile remains available only when explicitly selected.
    if (
      isTauri() &&
      (current === NativeLocalHosts.Localhost ||
        current === NativeLocalHosts.TauriLocalhost)
    ) {
      return (
        target === LegacyHostedAppHosts.Prod ||
        target === LegacyHostedAppHosts.Dev ||
        target === LegacyHostedAppHosts.Staging
      );
    }
    return false;
  }

  // Native webviews have a synthetic localhost origin. Only the configured
  // standalone operator host is an app-link host; no managed host aliases are
  // accepted.
  if (
    isTauri() &&
    (current === NativeLocalHosts.Localhost ||
      current === NativeLocalHosts.TauriLocalhost)
  ) {
    return (
      target ===
      cleanHostname(new URL(getConfiguredStandaloneOperatorOrigin()).hostname)
    );
  }
  return false;
}

type InternalAppLink = {
  path: string;
  query: string;
};

/**
 * Parses an absolute URL pointing at the configured Conation web app into a
 * router path and query. Returns null for any foreign `/app` URL.
 *
 * The `/app` prefix is stripped because the Tauri router uses `/` as its
 * base (mirrors the native navigation scheme parser on the Rust side).
 */
export function parseInternalAppLink(url: string): InternalAppLink | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const pathname = parsed.pathname;
  if (pathname !== '/app' && !pathname.startsWith('/app/')) {
    return null;
  }
  if (!isValidMacroAppHostname(parsed.hostname)) {
    return null;
  }
  return {
    path: pathname.slice('/app'.length) || '/',
    query: parsed.search.slice(1),
  };
}

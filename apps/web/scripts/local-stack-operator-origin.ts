import { resolveStandaloneOperatorOrigin } from '../src/lib/core/constant/clientProfile';

const HOSTED_DEFAULT_HOSTS = new Set(['conation.dev', 'www.conation.dev']);

const LOCAL_STACK_ORIGIN_HINT =
  'Set CONATION_OPERATOR_ORIGIN to this host\'s operator proxy, typically http://<lan-host>:8090';

/**
 * Resolve the operator origin for a native bundle that must talk to a
 * locally running Conation stack (xtask proxy on :8090), not the public
 * hosted default baked into `just tauri-build-standalone`.
 */
export function resolveLocalStackOperatorOrigin(
  configured: string | undefined
): string {
  const requested = configured?.trim();
  if (!requested) {
    throw new Error(
      `CONATION_OPERATOR_ORIGIN is required for a local-stack native build. ${LOCAL_STACK_ORIGIN_HINT}`
    );
  }
  if (requested === 'same-origin') {
    throw new Error(
      `CONATION_OPERATOR_ORIGIN=same-origin cannot be used for a local-stack native build. ${LOCAL_STACK_ORIGIN_HINT}`
    );
  }

  const origin = resolveStandaloneOperatorOrigin(requested, undefined);
  const hostname = new URL(origin).hostname.toLowerCase();
  if (HOSTED_DEFAULT_HOSTS.has(hostname)) {
    throw new Error(
      `Local-stack native builds must target the operator proxy, not ${origin}. ${LOCAL_STACK_ORIGIN_HINT}`
    );
  }
  return origin;
}

export function isLocalStackNativeTarget(
  value: string | undefined
): value is 'local-stack' {
  return value === 'local-stack';
}

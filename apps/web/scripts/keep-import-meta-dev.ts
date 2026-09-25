/**
 * Whether a `vite build` should keep `import.meta.env.DEV` true.
 *
 * Vite compiles DEV from NODE_ENV, not MODE, so
 * `MODE=development NODE_ENV=production vite build` would otherwise ship
 * DEV=false. Local-backend bundles (`just stack up`) already set
 * `VITE_LOCAL_BACKEND_ORIGIN`; hosted `just build-dev` / staging / prod do not.
 *
 * A MODE=production self-host build uses same-origin routing but must retain
 * `DEV=false`; its complete opt-in is validated here as well.
 */
export function keepImportMetaDev(opts: {
  command: string;
  mode: string;
  localBackendOrigin: string | undefined;
  localServers?: string | undefined;
}): boolean {
  const hasOrigin = Boolean(opts.localBackendOrigin);
  const hasLocalServers = opts.localServers !== undefined;
  if ((hasOrigin || hasLocalServers) && opts.mode !== 'development') {
    const validProductionSelfHost =
      opts.mode === 'production' &&
      opts.localBackendOrigin === 'same-origin' &&
      opts.localServers === 'ALL';
    if (!validProductionSelfHost) {
      throw new Error(
        `Self-host flags require MODE=production, VITE_LOCAL_BACKEND_ORIGIN=same-origin, and VITE_LOCAL_SERVERS=ALL`
      );
    }
    return false;
  }
  return opts.command === 'build' && opts.mode === 'development' && hasOrigin;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://host.local:3000',
  'https://dev.conation.dev',
  'https://staging.conation.dev',
  'https://www.conation.dev',
  'https://app.conation.dev',
  'https://conation.dev',
  'http://tauri.localhost',
  'tauri://localhost',
  'capacitor://localhost',
  'http://conation.localhost',
];

export function normalizeOrigin(origin: string): string {
  const value = origin.trim();
  if (!value) throw new Error('origin must not be empty');

  const parsed = new URL(value);
  if (!['http:', 'https:', 'tauri:', 'capacitor:'].includes(parsed.protocol)) {
    throw new Error(`unsupported origin scheme: ${parsed.protocol}`);
  }
  if (
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== '' && parsed.pathname !== '/') ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      'origin must contain only a scheme, host, and optional port'
    );
  }

  return `${parsed.protocol}//${parsed.host}`;
}

export function parseAllowedOrigins(configured: string): string[] {
  const origins = configured
    .split(',')
    .map(normalizeOrigin)
    .filter((origin, index, all) => all.indexOf(origin) === index);
  if (origins.length === 0) {
    throw new Error('origin allowlist must contain at least one origin');
  }
  return origins;
}

export function isOriginAllowed(origin: string, configured?: string): boolean {
  let normalized: string;
  try {
    normalized = normalizeOrigin(origin);
  } catch {
    return false;
  }

  const allowed =
    configured !== undefined
      ? parseAllowedOrigins(configured)
      : DEFAULT_ALLOWED_ORIGINS.map(normalizeOrigin);
  if (allowed.includes(normalized)) return true;

  const parsed = new URL(normalized);
  const port = Number(parsed.port);
  return (
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' ||
      parsed.hostname.endsWith('.localhost')) &&
    ((port >= 3000 && port <= 3999) || (port >= 20000 && port <= 60000))
  );
}

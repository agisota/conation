import { readFileSync } from 'node:fs';
import {
  parseConationClientProfile,
  resolveStandaloneOperatorOrigin,
} from '../src/lib/core/constant/clientProfile';

type Capability = {
  identifier: string;
  description?: string;
  windows?: string[];
  permissions: unknown[];
};

export type TauriClientConfigInput = {
  profile?: string;
  operatorOrigin?: string;
  extraHttpOrigins?: string[];
};

function readCapability(): Capability {
  const url = new URL(
    '../tauri/src-tauri/capabilities/default.json',
    import.meta.url
  );
  return JSON.parse(readFileSync(url, 'utf8')) as Capability;
}

function httpPermission(capability: Capability) {
  const permission = capability.permissions.find(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      'identifier' in entry &&
      entry.identifier === 'http:default'
  );
  if (!permission || typeof permission !== 'object') {
    throw new Error(`${capability.identifier} capability lacks http:default`);
  }
  return permission as { identifier: string; allow: Array<{ url: string }> };
}

/** Build the Tauri merge config applied before native manifests are generated. */
export function buildTauriClientConfig(input: TauriClientConfigInput) {
  parseConationClientProfile(input.profile);

  const operatorOrigin = resolveStandaloneOperatorOrigin(
    input.operatorOrigin ?? 'https://conation.dev',
    undefined
  );
  const operatorUrl = new URL(operatorOrigin);
  const additionalOrigins = (input.extraHttpOrigins ?? []).map((origin) =>
    resolveStandaloneOperatorOrigin(origin, undefined)
  );
  const allowedOrigins = [...new Set([operatorOrigin, ...additionalOrigins])];
  const capability = structuredClone(readCapability());
  httpPermission(capability).allow = [
    ...allowedOrigins.map((origin) => ({ url: `${origin}/**` })),
    { url: 'http://localhost:*' },
  ];

  return {
    app: {
      security: {
        capabilities: [capability, 'mobile-capability'],
      },
    },
    plugins: {
      'deep-link': {
        mobile: [
          { scheme: ['conation'], appLink: false },
          { host: operatorUrl.hostname, pathPrefix: ['/app'] },
        ],
        desktop: { schemes: ['conation'] },
      },
    },
  };
}

export function splitConfiguredOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

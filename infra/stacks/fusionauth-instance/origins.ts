import { config, stack } from '../../packages/shared';
import { AUTHENTICATION_SERVICE_DOMAIN } from './constants';

const EXTERNAL_CLIENT_ORIGINS = [
  'https://github.com',
  'https://claude.ai',
  'https://chatgpt.com',
  'https://chat.openai.com',
  'https://cursor.com',
];

function exactOrigin(value: string, key: string): string {
  const parsed = new URL(value);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== '' && parsed.pathname !== '/') ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${key} must be an exact http(s) browser origin`);
  }
  return parsed.origin;
}

function callbackUrl(value: string, key: string): string {
  const parsed = new URL(value);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${key} must be an absolute http(s) callback URL`);
  }
  return parsed.toString();
}

export const APPLICATION_URL = exactOrigin(
  config.get('application-url') ??
    (stack === 'local'
      ? 'http://localhost:3000'
      : stack === 'dev'
        ? 'https://dev.conation.dev'
        : 'https://conation.dev'),
  'application-url'
);

export const MCP_OAUTH_CALLBACK_URL = callbackUrl(
  config.get('mcp-oauth-callback-url') ??
    (stack === 'local'
      ? 'http://localhost:8085/oauth/callback'
      : `https://mcp-server${stack === 'prod' ? '' : `-${stack}`}.conation.dev/oauth/callback`),
  'mcp-oauth-callback-url'
);

/**
 * Creates an array of allowed origins for the fusionauth application depending on stack
 */
export const ALLOWED_ORIGINS = () => {
  const configuredOrigins = config.getObject<string[]>('allowed-origins');
  if (configuredOrigins?.length === 0) {
    throw new Error('allowed-origins must contain at least one origin');
  }

  const productOrigins = (
    configuredOrigins ??
    (stack === 'local'
      ? [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
          'http://localhost:3003',
          'http://localhost:3004',
          'http://localhost:3005',
          'http://localhost:3006',
          'http://localhost:3007',
          'http://localhost:3008',
          'http://localhost:3009',
          'http://localhost:5173',
        ]
      : stack === 'dev'
        ? ['https://dev.conation.dev', 'http://localhost:3000']
        : [
            'https://conation.dev',
            'https://app.conation.dev',
            'https://www.conation.dev',
          ])
  ).map((origin) => exactOrigin(origin, 'allowed-origins'));

  const allowedOrigins = [
    exactOrigin(AUTHENTICATION_SERVICE_DOMAIN, 'authentication-service-domain'),
    ...productOrigins,
    ...EXTERNAL_CLIENT_ORIGINS,
  ];
  const uniqueOrigins = [...new Set(allowedOrigins)];
  switch (stack) {
    case 'local':
      return uniqueOrigins;
    case 'dev':
      return [
        ...uniqueOrigins,
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003',
        'http://localhost:3004',
        'http://localhost:3005',
        'http://localhost:3006',
        'http://localhost:3007',
        'http://localhost:3008',
        'http://localhost:3009',
        'http://localhost:8084',
        'http://localhost:5173',
      ];
    case 'prod':
      return uniqueOrigins;
  }

  throw new Error('invalid stack');
};

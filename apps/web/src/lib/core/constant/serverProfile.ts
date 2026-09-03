import { httpOriginToWebSocketOrigin } from './clientProfile';

export type Servers = {
  'auth-service': string;
  'auth-logout': string;
  'pdf-service': string;
  'document-storage-service': string;
  'websocket-service': string;
  'cognition-service': string;
  'connection-gateway': string;
  'notification-service': string;
  'static-file': string;
  'unfurl-service': string;
  contacts: string;
  'email-service': string;
  'image-proxy-service': string;
  'scheduled-action': string;
  'agent-harness': string;
};

export type SyncServiceHosts = { worker: string; ws: string };

/** Build the single-ingress path contract used by a standalone operator. */
export function createStandaloneServers(origin: string): Servers {
  const wsOrigin = httpOriginToWebSocketOrigin(origin);
  return {
    'auth-service': `${origin}/auth`,
    'auth-logout': `${origin}/app/login`,
    'pdf-service': `${origin}/pdf`,
    'document-storage-service': `${origin}/dss`,
    'websocket-service': `${wsOrigin}/websocket`,
    'cognition-service': `${origin}/cognition`,
    'connection-gateway': `${wsOrigin}/connection-gateway`,
    'notification-service': `${origin}/notification`,
    'static-file': `${origin}/static-file`,
    'unfurl-service': `${origin}/unfurl`,
    contacts: `${origin}/contacts`,
    'email-service': `${origin}/email`,
    'image-proxy-service': `${origin}/image-proxy`,
    'scheduled-action': `${origin}/scheduled-action`,
    'agent-harness': `${origin}/agent-harness`,
  };
}

export function createStandaloneSyncServiceHosts(
  origin: string
): SyncServiceHosts {
  return {
    worker: `${origin}/sync`,
    ws: `${httpOriginToWebSocketOrigin(origin)}/sync`,
  };
}

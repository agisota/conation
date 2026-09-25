export type WebDeploymentEnvironment = {
  mode: string;
  localBackendOrigin?: string;
  localServers?: string;
  pageOrigin?: string;
};

export type WebDeployment =
  | { kind: 'hosted' }
  | {
      kind: 'self-hosted';
      proxyOrigin: string;
      syncWorker: string;
      syncWebSocket: string;
    };

export type SelfHostedServerHosts = Record<string, string>;

export function buildSelfHostedServerHosts(
  proxyOrigin: string
): SelfHostedServerHosts {
  const websocketOrigin = proxyOrigin.replace(/^http/, 'ws');
  return {
    'auth-service': `${proxyOrigin}/auth`,
    'auth-logout': `${proxyOrigin}/app/login`,
    'pdf-service': `${proxyOrigin}/pdf`,
    'document-storage-service': `${proxyOrigin}/dss`,
    'websocket-service': `${websocketOrigin}/websocket`,
    'cognition-service': `${proxyOrigin}/cognition`,
    'connection-gateway': `${websocketOrigin}/connection-gateway`,
    'notification-service': `${proxyOrigin}/notification`,
    'static-file': `${proxyOrigin}/static-file`,
    'unfurl-service': `${proxyOrigin}/unfurl`,
    'agent-harness': `${proxyOrigin}/agent-harness`,
    contacts: `${proxyOrigin}/contacts`,
    'email-service': `${proxyOrigin}/email`,
    'calendar-service': `${proxyOrigin}/calendar`,
    'image-proxy-service': `${proxyOrigin}/image-proxy`,
    'scheduled-action': `${proxyOrigin}/scheduled-action`,
  };
}

export function resolveWebDeployment(
  environment: WebDeploymentEnvironment
): WebDeployment {
  const { mode, localBackendOrigin, localServers, pageOrigin } = environment;
  if (mode !== 'production') return { kind: 'hosted' };

  const hasSelfHostSetting =
    localBackendOrigin !== undefined || localServers !== undefined;
  if (!hasSelfHostSetting) return { kind: 'hosted' };
  if (localBackendOrigin !== 'same-origin') {
    throw new Error(
      'Production self-host mode requires VITE_LOCAL_BACKEND_ORIGIN=same-origin'
    );
  }
  if (localServers !== 'ALL') {
    throw new Error(
      'Production self-host mode requires VITE_LOCAL_SERVERS=ALL'
    );
  }
  if (!pageOrigin) {
    throw new Error(
      'Production self-host mode requires a browser origin to resolve same-origin'
    );
  }

  let proxyOrigin: string;
  try {
    const origin = new URL(pageOrigin);
    if (
      origin.origin !== pageOrigin ||
      !['http:', 'https:'].includes(origin.protocol)
    ) {
      throw new Error('invalid origin');
    }
    proxyOrigin = origin.origin;
  } catch {
    throw new Error(
      'Production self-host mode requires a valid browser origin'
    );
  }

  const websocketOrigin = proxyOrigin.replace(/^http/, 'ws');
  return {
    kind: 'self-hosted',
    proxyOrigin,
    syncWorker: `${proxyOrigin}/sync`,
    syncWebSocket: `${websocketOrigin}/sync`,
  };
}

export const WEB_DEPLOYMENT = resolveWebDeployment({
  mode: import.meta.env.MODE,
  localBackendOrigin: import.meta.env.VITE_LOCAL_BACKEND_ORIGIN,
  localServers: import.meta.env.VITE_LOCAL_SERVERS,
  pageOrigin: globalThis.location?.origin,
});

export const IS_SELF_HOSTED_PRODUCTION = WEB_DEPLOYMENT.kind === 'self-hosted';

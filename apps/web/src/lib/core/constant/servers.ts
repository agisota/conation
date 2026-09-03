import {
  getConfiguredStandaloneOperatorOrigin,
} from './clientProfile';
import {
  createStandaloneServers,
  createStandaloneSyncServiceHosts,
  type Servers,
} from './serverProfile';

const standaloneOperatorOrigin = getConfiguredStandaloneOperatorOrigin();

/** All web builds use the operator's single-origin reverse-proxy contract. */
export const SERVER_HOSTS: Servers = createStandaloneServers(
  standaloneOperatorOrigin
);

export const SYNC_SERVICE_HOSTS = createStandaloneSyncServiceHosts(
  standaloneOperatorOrigin
);

/** The operator DSS host used to mint sync-service permission tokens. */
export const SYNC_PERMISSION_TOKEN_DSS_HOST =
  SERVER_HOSTS['document-storage-service'];

/** Creates endpoint URL for accessing a static file by its ID */
export function staticFileIdEndpoint(id: string): string {
  return `${SERVER_HOSTS['static-file']}/file/${id}`;
}

type StaticFileSize = 'small' | 'medium';

const staticFileSizes: Record<StaticFileSize, number> = {
  small: 320,
  medium: 1080,
};

export function staticFileSizedEndpoint(
  id: string,
  size: StaticFileSize
): string {
  return `${staticFileIdEndpoint(id)}?size=${staticFileSizes[size]}`;
}

export function staticFileSizedUrl(url: string, size: StaticFileSize): string {
  return `${url}?size=${staticFileSizes[size]}`;
}

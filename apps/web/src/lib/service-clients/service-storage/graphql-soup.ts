import {
  ENABLE_BEARER_TOKEN_AUTH,
  ENABLE_GRAPHQL_SOUP,
} from '@core/constant/featureFlags';
import { SERVER_HOSTS } from '@core/constant/servers';
import { fetchToken } from '@core/util/fetchWithToken';
import { isTauri } from '@core/util/platform';
import { platformFetch } from '@core/util/platformFetch';
import {
  HYDRATE_ONLY_CONTEXT_KEY,
  normalizedCacheExchange,
} from '@graphql-cache/exchange/normalized-cache-exchange';
import type { CacheHost } from '@graphql-cache/host/types';
import {
  createTauriCacheHost,
  createWorkerCacheHost,
  entityFromArgument,
} from '@graphql-cache/index';
import { registerCacheHost } from '@graphql-cache/lifecycle';
import { getBrowserTursoCacheRolloutDecision } from '@graphql-cache/rollout';
import { getOrCreateCacheScope } from '@graphql-cache/scope';
import { getConationApiToken } from '@service-auth/fetch';
import type { ApiUserNotification } from '@service-notification/generated/schemas/apiUserNotification';
import type { ChannelType } from '@service-notification/generated/schemas/channelType';
import type { GithubPrCheckRunState } from '@service-notification/generated/schemas/githubPrCheckRunState';
import type { GithubPrCommentKind } from '@service-notification/generated/schemas/githubPrCommentKind';
import type { GithubPrEventAction } from '@service-notification/generated/schemas/githubPrEventAction';
import type { GithubPrEventStatus } from '@service-notification/generated/schemas/githubPrEventStatus';
import type { GithubPrMentionLocation } from '@service-notification/generated/schemas/githubPrMentionLocation';
import type { GithubPrReviewState } from '@service-notification/generated/schemas/githubPrReviewState';
import type { NotifEvent } from '@service-notification/generated/schemas/notifEvent';
import type { NotificationDocumentSubType } from '@service-notification/generated/schemas/notificationDocumentSubType';
import {
  type AnyVariables,
  type Client,
  createClient,
  type DocumentInput,
  fetchExchange,
  type RequestPolicy,
  subscriptionExchange,
} from '@urql/core';
import { parse, print, visit } from 'graphql';
import {
  createClient as createGraphqlWsClient,
  type Client as GraphqlWsClient,
} from 'graphql-ws';
import { match } from 'ts-pattern';
import type { SoupApiItem } from './generated/schemas/soupApiItem';
import type { SoupCalendarEventSoupPropertiesField } from './generated/schemas/soupCalendarEventSoupPropertiesField';
import type { SoupCalendarEventTime } from './generated/schemas/soupCalendarEventTime';
import type { SoupPage } from './generated/schemas/soupPage';
import type { SoupProperty } from './generated/schemas/soupProperty';
import type { SoupReminderSchedule } from './generated/schemas/soupReminderSchedule';
import {
  type GraphqlEntityType,
  type GraphqlReminderScheduleType,
  type GroupedSoupInput,
  type GroupSoupQuery,
  GroupSoupDocument as GroupSoupQueryDocument,
  type GroupSoupQueryVariables,
  type SoupBackfillResult,
  type SoupInitialInput,
  type SoupInput,
  type SoupNotificationFieldsFragment,
  type SoupPropertyFieldsFragment,
  type SoupQuery,
} from './graphql/generated/graphql';
import {
  createGraphqlSoupSubscriptionsLifecycle,
  createGraphqlSoupWebSocketUrlResolver,
  SOUP_GRAPHQL_WEBSOCKET_RETRY_ATTEMPTS,
  shouldRetryGraphqlSoupWebSocket,
} from './graphql-soup-websocket';

const dssHost = SERVER_HOSTS['document-storage-service'];

function mergeHeaders(...headers: Array<HeadersInit | undefined>): Headers {
  const result = new Headers();
  for (const source of headers) {
    if (!source) continue;
    new Headers(source).forEach((value, key) => result.set(key, value));
  }
  return result;
}

async function authorizedDssGraphqlFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  if (ENABLE_BEARER_TOKEN_AUTH) {
    let apiToken = '';
    try {
      apiToken = await getConationApiToken();
    } catch {
      apiToken = '';
    }
    return await platformFetch(input, {
      ...init,
      headers: mergeHeaders(init?.headers, {
        ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
      }),
    });
  }

  const fetchWithCredentials = () =>
    platformFetch(input, { ...init, credentials: 'include' });

  let response = await fetchWithCredentials();
  if (response.status !== 401) return response;

  const tokenResult = await fetchToken();
  if (tokenResult.isErr()) return response;

  response = await fetchWithCredentials();
  return response;
}

let soupProjectionServerSupported = true;

/** Whether this session has confirmed that the server accepts projection fields. */
export function graphqlSoupProjectionSupported(): boolean {
  return soupProjectionServerSupported;
}

/** Removes only the additive cache metadata field for a legacy-server retry. */
export function legacySoupProjectionDocument(query: string): string {
  return print(
    visit(parse(query), {
      Field(node) {
        return node.name.value === 'cacheProjection' ? null : undefined;
      },
    })
  );
}

function legacyProjectionRequest(
  init: RequestInit | undefined
): RequestInit | undefined {
  if (typeof init?.body !== 'string') return;
  try {
    const payload: unknown = JSON.parse(init.body);
    if (
      payload === null ||
      typeof payload !== 'object' ||
      !('query' in payload) ||
      typeof payload.query !== 'string' ||
      !payload.query.includes('cacheProjection')
    ) {
      return;
    }
    return {
      ...init,
      body: JSON.stringify({
        ...payload,
        query: legacySoupProjectionDocument(payload.query),
      }),
    };
  } catch {
    return;
  }
}

async function isLegacyProjectionValidationError(
  response: Response
): Promise<boolean> {
  try {
    const payload: unknown = await response.clone().json();
    if (
      payload === null ||
      typeof payload !== 'object' ||
      !('errors' in payload)
    ) {
      return false;
    }
    const errors = payload.errors;
    return (
      Array.isArray(errors) &&
      errors.some(
        (error) =>
          error !== null &&
          typeof error === 'object' &&
          'message' in error &&
          typeof error.message === 'string' &&
          /Cannot query field ["']cacheProjection["']/.test(error.message)
      )
    );
  } catch {
    return false;
  }
}

export async function dssGraphqlFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await authorizedDssGraphqlFetch(input, init);
  const legacyInit = legacyProjectionRequest(init);
  if (
    legacyInit === undefined ||
    !(await isLegacyProjectionValidationError(response))
  ) {
    return response;
  }

  // A mixed deployment remains network-correct: retry without the additive
  // metadata field and suppress v2 local authority for this session. Backfill
  // still refuses to checkpoint missing required Document supplements.
  soupProjectionServerSupported = false;
  return await authorizedDssGraphqlFetch(input, legacyInit);
}

const graphqlSoupClient = createClient({
  url: `${dssHost}/items/soup/graphql`,
  exchanges: [fetchExchange],
  fetch: dssGraphqlFetch,
  // urql's default ("within-url-limit") sends small documents as GET, but
  // GET on the DSS GraphQL path serves the GraphiQL IDE — only POST
  // executes. Every pre-activity document was too large to trigger this.
  preferGetMethod: false,
});

function createGraphqlSoupWebSocketClient(): GraphqlWsClient {
  const resolveWebSocketUrl = createGraphqlSoupWebSocketUrlResolver({
    dssHost,
    bearerTokenAuth: ENABLE_BEARER_TOKEN_AUTH,
    getApiToken: getConationApiToken,
    refreshCookieAuth: async () => {
      const result = await fetchToken();
      if (result.isErr()) {
        throw new Error('Unable to refresh GraphQL websocket cookie');
      }
    },
  });
  return createGraphqlWsClient({
    url: resolveWebSocketUrl,
    retryAttempts: SOUP_GRAPHQL_WEBSOCKET_RETRY_ATTEMPTS,
    shouldRetry: shouldRetryGraphqlSoupWebSocket,
  });
}

function graphqlSoupSubscriptionExchange(websocketClient: GraphqlWsClient) {
  return subscriptionExchange({
    forwardSubscription(payload, request) {
      const graphqlWsPayload = {
        query: print(request.query),
        operationName: payload.operationName,
        variables: payload.variables,
        extensions: payload.extensions,
      };
      return {
        subscribe(sink) {
          const unsubscribe = websocketClient.subscribe(graphqlWsPayload, sink);
          return { unsubscribe };
        },
      };
    },
  });
}

let uncachedRealtimeClient: Client | undefined;
let uncachedRealtimeCleanup: (() => void) | undefined;

function disposeUncachedRealtimeClient(): void {
  uncachedRealtimeCleanup?.();
  uncachedRealtimeCleanup = undefined;
  uncachedRealtimeClient = undefined;
}

function getUncachedRealtimeClient(): Client {
  if (uncachedRealtimeClient) return uncachedRealtimeClient;

  const websocketClient = createGraphqlSoupWebSocketClient();
  const subscriptionsLifecycle = createGraphqlSoupSubscriptionsLifecycle();
  const client = createClient({
    url: `${dssHost}/items/soup/graphql`,
    preferGetMethod: false,
    exchanges: [
      graphqlSoupSubscriptionExchange(websocketClient),
      fetchExchange,
    ],
    fetch: dssGraphqlFetch,
  });
  subscriptionsLifecycle.replace(client);
  uncachedRealtimeClient = client;
  uncachedRealtimeCleanup = () => {
    subscriptionsLifecycle.dispose();
    void websocketClient.dispose();
  };
  return client;
}

let cacheInitializationFailed = false;

/**
 * Whether the normalized cache is active for soup GraphQL queries.
 * Browser: wasm engine in a worker. Tauri: native engine in the host
 * process (graphql_cache_plugin).
 */
export function graphqlCacheEnabled(): boolean {
  if (cacheInitializationFailed) return false;
  if (!isTauri() && browserCacheClientActivated) return true;
  return getBrowserTursoCacheRolloutDecision().enabled;
}

let cachedClient: Client | undefined;
let cachedCacheHost: CacheHost | undefined;
let cachedCacheCleanup: (() => void) | undefined;
let browserCacheClientActivated = false;

function fallbackAfterInitializationFailure(): void {
  const cleanup = cachedCacheCleanup;
  cachedCacheCleanup = undefined;
  cachedCacheHost = undefined;
  cacheInitializationFailed = true;
  cachedClient = ENABLE_GRAPHQL_SOUP()
    ? getUncachedRealtimeClient()
    : graphqlSoupClient;
  browserCacheClientActivated = false;
  try {
    cleanup?.();
  } catch {
    // Initialization-failure cleanup cannot alter GraphQL transport fallback.
  }
}

/** Returns the persistent normalized-cache host after client initialization. */
export function getGraphqlCacheHost(): CacheHost | undefined {
  return cachedCacheHost?.disabled ? undefined : cachedCacheHost;
}

/**
 * Resolves the urql client, lazily assembling the cached client on first
 * use. The cache scope is an anonymous client uuid — no identity lookup is
 * needed (or wanted) here: user↔cache consistency is enforced inside the
 * engine by the identity witness on `QueryRoot.user.id` (a response for a
 * different user wipes and rebinds the cache). See @graphql-cache/scope.
 * Any failure falls back to the plain fetch client for the session.
 */
export function getGraphqlSoupClient(): Client {
  const native = isTauri();
  // Only the browser Turso client is session-latched. Tauri keeps the prior
  // dynamic GraphQL transport behavior and can return to the plain client when
  // ENABLE_GRAPHQL_SOUP changes without constructing a browser resource.
  if (!native && browserCacheClientActivated && cachedClient)
    return cachedClient;
  const rollout = getBrowserTursoCacheRolloutDecision();
  if (!rollout.enabled) {
    return ENABLE_GRAPHQL_SOUP()
      ? getUncachedRealtimeClient()
      : graphqlSoupClient;
  }
  if (cachedClient) return cachedClient;
  disposeUncachedRealtimeClient();
  cachedClient = (() => {
    let host: CacheHost | undefined;
    let websocketClient: GraphqlWsClient | undefined;
    let unregisterHost: () => void = () => undefined;
    const subscriptionsLifecycle = createGraphqlSoupSubscriptionsLifecycle();
    const cleanup = () => {
      unregisterHost();
      // Unsubscribing emits urql teardown operations; keep the cache host
      // available until those best-effort registration removals are issued.
      subscriptionsLifecycle.dispose();
      host?.dispose();
      if (websocketClient) void websocketClient.dispose();
    };
    const onInitializationError = (error: Error) => {
      if (!host || cachedCacheHost !== host) return;
      fallbackAfterInitializationFailure();
      console.warn(
        'graphql cache async init failed; using uncached client',
        error
      );
    };
    try {
      const scope = getOrCreateCacheScope();
      host = native
        ? createTauriCacheHost({ scope, onInitializationError })
        : createWorkerCacheHost({
            scope,
            onInitializationError,
            rolloutCohort: rollout.cohort,
          });
      const graphqlWsClient = createGraphqlSoupWebSocketClient();
      websocketClient = graphqlWsClient;
      const client = createClient({
        url: `${dssHost}/items/soup/graphql`,
        // See graphqlSoupClient: GET serves GraphiQL on this path.
        preferGetMethod: false,
        exchanges: [
          normalizedCacheExchange(host, {
            entityResolvers: {
              GraphqlUser: {
                emailThread: entityFromArgument('GraphqlSoupEmailThread', [
                  'input',
                  'threadId',
                ]),
              },
            },
            // Session identity witness: the viewer id present on every soup
            // response. A response for a different user silently wipes and
            // rebinds the cache (see @graphql-cache/scope).
            extractIdentity: (data) =>
              (data as Partial<SoupQuery | GroupSoupQuery> | undefined)?.user
                ?.id,
            // Transport failures remain queued with their optimistic layer;
            // GraphQL application errors are permanent and roll back.
            shouldRetryMutation: (error) => error.networkError != null,
          }),
          graphqlSoupSubscriptionExchange(graphqlWsClient),
          fetchExchange,
        ],
        fetch: dssGraphqlFetch,
      });
      cachedCacheHost = host;
      cacheInitializationFailed = false;
      unregisterHost = registerCacheHost(host);
      subscriptionsLifecycle.replace(client, host);
      cachedCacheCleanup = cleanup;
      browserCacheClientActivated = !native;
      return client;
    } catch (error) {
      cleanup();
      cachedCacheHost = undefined;
      cachedCacheCleanup = undefined;
      cacheInitializationFailed = true;
      console.warn('graphql cache init failed; using uncached client', error);
      return ENABLE_GRAPHQL_SOUP()
        ? getUncachedRealtimeClient()
        : graphqlSoupClient;
    }
  })();
  return cachedClient;
}

/** Returns the cache host backing the flagged GraphQL Soup client. */
export function getGraphqlSoupCacheHost(): CacheHost | undefined {
  if (!graphqlCacheEnabled()) return undefined;
  getGraphqlSoupClient();
  return cachedCacheHost;
}

/** Shared entity GraphQL client used by both Soup queries and mutations. */
export const getEntityGraphqlClient = getGraphqlSoupClient;

export type GraphqlSoupInput = SoupInput;
export type GraphqlSoupInitialInput = SoupInitialInput;
export type GraphqlGroupedSoupInput = GroupedSoupInput;

export type GraphqlGroupedSoupPage = {
  items: Record<string, SoupApiItem>;
  groups: Array<{
    key: string;
    totalCount: number;
    nextCursor: string | null;
    itemIds: string[];
  }>;
};

export type GraphqlSoupItem = SoupQuery['user']['soup']['items'][number];
type GraphqlSoupEntity = GraphqlSoupItem;
type GraphqlProperty = Extract<
  GraphqlSoupEntity,
  { __typename: 'GraphqlSoupDocument' }
>['properties'][number];
type GraphqlPropertyValue = NonNullable<GraphqlProperty['value']>;
type GraphqlSoupDocument = Extract<
  GraphqlSoupEntity,
  { __typename: 'GraphqlSoupDocument' }
>;
type GraphqlSoupChannelMessage = NonNullable<
  Extract<
    GraphqlSoupEntity,
    { __typename: 'GraphqlSoupChannel' }
  >['latestMessage']
>;

function mapGraphqlPropertyValue(
  value: GraphqlPropertyValue | null | undefined
) {
  if (!value) return value;

  return match(value)
    .with({ __typename: 'GraphqlBooleanPropertyValue' }, ({ boolValue }) => ({
      type: 'Boolean' as const,
      value: boolValue,
    }))
    .with({ __typename: 'GraphqlNumberPropertyValue' }, ({ numberValue }) => ({
      type: 'Number' as const,
      value: numberValue,
    }))
    .with({ __typename: 'GraphqlStringPropertyValue' }, ({ stringValue }) => ({
      type: 'String' as const,
      value: stringValue,
    }))
    .with({ __typename: 'GraphqlDatePropertyValue' }, ({ dateValue }) => ({
      type: 'Date' as const,
      value: dateValue,
    }))
    .with(
      { __typename: 'GraphqlSelectOptionPropertyValue' },
      ({ optionIds }) => ({
        type: 'SelectOption' as const,
        value: optionIds,
      })
    )
    .with(
      { __typename: 'GraphqlEntityReferencePropertyValue' },
      ({ references }) => ({
        type: 'EntityReference' as const,
        value: references.map((reference) => ({
          entity_id: reference.entityId,
          entity_type: reference.entityType,
          specific_message_id: reference.specificMessageId ?? undefined,
        })),
      })
    )
    .with({ __typename: 'GraphqlLinkPropertyValue' }, ({ urls }) => ({
      type: 'Link' as const,
      value: urls,
    }))
    .exhaustive();
}

/** Maps GraphQL property fragments to the shared Soup property shape. */
export function mapGraphqlProperties(
  properties: SoupPropertyFieldsFragment[]
): SoupProperty[] {
  return properties.map((property) => ({
    id: property.id,
    definition: {
      id: property.propertyDefinitionId,
      display_name: property.displayName,
      data_type: property.dataType,
      is_multi_select: property.isMultiSelect,
      specific_entity_type: property.specificEntityType ?? undefined,
      is_system: property.isSystem,
      is_metadata: property.isMetadata,
      owner: { scope: 'system' as const },
      created_at: '',
      updated_at: '',
    },
    value: mapGraphqlPropertyValue(property.value),
  }));
}

function mapDocumentSubType(subType: GraphqlSoupDocument['subType']) {
  if (!subType) return undefined;
  return match(subType)
    .with({ __typename: 'GraphqlTaskSubType' }, ({ isCompleted }) => ({
      type: 'task' as const,
      is_completed: isCompleted,
    }))
    .with({ __typename: 'GraphqlSnippetSubType' }, () => ({
      type: 'snippet' as const,
    }))
    .with({ __typename: 'GraphqlSkillSubType' }, () => ({
      type: 'skill' as const,
    }))
    .exhaustive();
}

function mapChannelMessage(
  message: GraphqlSoupChannelMessage | null | undefined
) {
  if (!message) return message;
  return {
    message_id: message.messageId,
    thread_id: message.threadId ?? undefined,
    sender_id: message.senderId,
    content: message.content,
    created_at: message.createdAt,
    updated_at: message.updatedAt,
    deleted_at: message.deletedAt ?? undefined,
    mentions: message.mentions ?? [],
  };
}

function normalizeChannelType(channelType: string) {
  return channelType.toLowerCase();
}

function toNotificationDocumentSubType(
  subType: string | null
): NotificationDocumentSubType | null {
  return subType
    ? ({ type: subType.toLowerCase() } as NotificationDocumentSubType)
    : null;
}

type NotifEventMember<Tag extends NotifEvent['tag']> = Extract<
  NotifEvent,
  { tag: Tag }
> & {
  content: { hasAttachments?: boolean };
};

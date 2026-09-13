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

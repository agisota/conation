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

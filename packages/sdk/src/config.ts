export type Env = 'dev' | 'prod' | 'local';

/** The backend services the SDK talks to. Note `search` and `properties` are
 * served on the storage host, so they point there. */
export type ServiceName =
  | 'agent-harness'
  | 'storage'
  | 'auth'
  | 'email'
  | 'cognition'
  | 'notification'
  | 'properties'
  | 'search'
  | 'scheduled-action'
  | 'static-files'
  | 'connection'
  | 'contacts'
  | 'unfurl';

export const WEB_APP_URLS: Record<Env, string> = {
  dev: 'https://dev.conation.dev',
  prod: 'https://conation.dev',
  local: 'http://localhost:3000',
};

export const HOSTS: Record<Env, Record<ServiceName, string>> = {
  dev: {
    'agent-harness': 'https://agent-harness-dev.conation.dev',
    storage: 'https://cloud-storage-dev.conation.dev',
    auth: 'https://auth-service-dev.conation.dev',
    email: 'https://email-service-dev.conation.dev',
    cognition: 'https://document-cognition-dev.conation.dev',
    notification: 'https://notifications-dev.conation.dev',
    properties: 'https://cloud-storage-dev.conation.dev',
    search: 'https://cloud-storage-dev.conation.dev',
    'scheduled-action': 'https://agent-schedule-dev.conation.dev',
    'static-files': 'https://static-file-service-dev.conation.dev',
    connection: 'https://connection-gateway-dev.conation.dev',
    contacts: 'https://contacts-dev.conation.dev',
    unfurl: 'https://unfurl-service-dev.conation.dev',
  },
  prod: {
    'agent-harness': 'https://agent-harness.conation.dev',
    storage: 'https://cloud-storage.conation.dev',
    auth: 'https://auth-service.conation.dev',
    email: 'https://email-service.conation.dev',
    cognition: 'https://document-cognition.conation.dev',
    notification: 'https://notifications.conation.dev',
    properties: 'https://cloud-storage.conation.dev',
    search: 'https://cloud-storage.conation.dev',
    'scheduled-action': 'https://agent-schedule.conation.dev',
    'static-files': 'https://static-file-service.conation.dev',
    connection: 'https://connection-gateway.conation.dev',
    contacts: 'https://contacts.conation.dev',
    unfurl: 'https://unfurl-service.conation.dev',
  },
  local: {
    'agent-harness': 'http://localhost:8101',
    storage: 'http://localhost:8086',
    auth: 'http://localhost:8080',
    email: 'http://localhost:8087',
    cognition: 'http://localhost:8085',
    notification: 'http://localhost:8089',
    properties: 'http://localhost:8086',
    search: 'http://localhost:8086',
    'scheduled-action': 'http://localhost:8098',
    'static-files': 'http://localhost:8100',
    connection: 'http://localhost:8082',
    contacts: 'http://localhost:8083',
    unfurl: 'http://localhost:8095',
  },
};

/** A bearer token, or a (possibly async) function that returns one — the
 * function form lets you refresh tokens without reconfiguring. */
export type TokenSource = string | (() => string | Promise<string>);

/** Access scope for bot-authenticated requests. `user` acts with the
 * requested-as user's access (requires `requestedAs`); `team` acts with the
 * bot's owning team's access (team-owned bots only). */
export type BotScope = 'user' | 'team';

/** How the SDK authenticates with Conation.
 *
 * - `user`: a human's Conation API token, sent as `Authorization: Bearer`.
 * - `bot`: an `mbot_` API key, sent as `x-conation-bot-token` together with
 *   `x-conation-bot-scope`. When `scope` is omitted it defaults to `user` when
 *   `requestedAs` is set (user scope requires an acting user) and `team`
 *   otherwise.
 */
export type MacroAuth =
  | { type: 'user'; token: TokenSource }
  | { type: 'bot'; token: TokenSource; scope?: BotScope };

/** Options passed to `new Macro(opts)` and stored on `MacroClient`. */
export interface MacroOpts {
  /** How to authenticate. Takes precedence over `token`. Falls back to the
   * CONATION_API_KEY (user auth) or CONATION_BOT_TOKEN (bot auth) env var. */
  auth?: MacroAuth;
  /** Shorthand for `auth: { type: 'user', token }`. */
  token?: TokenSource;
  /** Which Conation environment to talk to. Falls back to the CONATION_ENV env
   * var, then `'dev'`. */
  env?: Env;
  /** Override individual service hosts (e.g. point one at localhost). */
  hosts?: Partial<Record<ServiceName, string>>;
  /** Override the web app base URL (e.g. for local frontend dev). Also reads CONATION_WEB_URL. */
  webAppUrl?: string;
  /** Signing secret for verifying incoming webhooks. Falls back to CONATION_WEBHOOK_SECRET. */
  webhookSecret?: string;
  wsVerify?: string;
  /** User id the bot acts for, sent as `x-conation-bot-for-conation-user-id` on
   * every request. Bot auth only. Set via `macro.requestedAs(user)` rather
   * than directly. */
  requestedAs?: string;
}

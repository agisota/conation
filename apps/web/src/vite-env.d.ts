interface ImportMetaEnv {
  readonly __APP_VERSION__: string;
  readonly BASE_URL: string;
  readonly __LOCAL_JWT__: string;
  readonly __GIT_BRANCH__: string;

  readonly VITE_CONATION_CLIENT_PROFILE?: 'standalone';
  readonly VITE_CONATION_OPERATOR_ORIGIN?: string;
  readonly VITE_CONATION_SOURCEMAPS?: string;
  readonly VITE_LOCAL_BACKEND_ORIGIN?: string;

  readonly VITE_SEGMENT_WRITE_KEY: string;
  readonly VITE_POSTHOG_API_KEY: string;

  readonly VITE_OTEL_EXPORTER_URL?: string;
  readonly VITE_OTEL_ENV?: string;
  readonly VITE_ENABLE_BROWSER_OTEL?: string;
  readonly VITE_ENABLE_REMINDERS?: string;
  readonly VITE_DISABLE_BROWSER_TURSO_CACHE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Replaced with a boolean literal by the production Vite configuration. */
declare var __CONATION_HOSTED_LEGACY__: boolean | undefined;

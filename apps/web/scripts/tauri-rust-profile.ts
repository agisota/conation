import { writeFileSync } from 'node:fs';
import {
  parseConationClientProfile,
  resolveStandaloneOperatorOrigin,
} from '../src/lib/core/constant/clientProfile';

type TauriAppEnvironment = 'development' | 'production';

export type TauriRustProfileInput = {
  environment: TauriAppEnvironment;
  profile?: string;
  operatorOrigin?: string;
  bundleUpdateBaseUrl?: string;
};

/** Write the non-secret profile files consumed by the native Cargo build. */
export function writeTauriRustProfile(input: TauriRustProfileInput) {
  const profile = parseConationClientProfile(input.profile);
  const operatorOrigin =
    profile === 'standalone'
      ? resolveStandaloneOperatorOrigin(
          input.operatorOrigin ??
            (input.environment === 'development'
              ? 'http://localhost:8090'
              : 'https://conation.dev'),
          undefined
        )
      : undefined;
  const directory = new URL('../tauri/src-tauri/', import.meta.url);

  writeFileSync(new URL('.conation-tauri-env', directory), input.environment);
  writeFileSync(
    new URL('.conation-tauri-profile.json', directory),
    JSON.stringify({
      profile,
      operatorOrigin,
      bundleUpdateBaseUrl: input.bundleUpdateBaseUrl,
    })
  );
}

if (import.meta.main) {
  const environment = process.env.CONATION_TAURI_APP_ENV;
  if (environment !== 'development' && environment !== 'production') {
    throw new Error(
      'CONATION_TAURI_APP_ENV must be development or production'
    );
  }
  writeTauriRustProfile({
    environment,
    profile: process.env.CONATION_CLIENT_PROFILE,
    operatorOrigin: process.env.CONATION_OPERATOR_ORIGIN,
    bundleUpdateBaseUrl: process.env.CONATION_BUNDLE_UPDATE_BASE_URL,
  });
}

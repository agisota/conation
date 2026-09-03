import { fileURLToPath } from 'node:url';
import {
  buildTauriClientConfig,
  splitConfiguredOrigins,
} from './tauri-client-config';
import { writeTauriRustProfile } from './tauri-rust-profile';

type Platform = 'desktop' | 'ios' | 'android';

const platform = (process.argv[2] || 'desktop') as Platform;
if (!['desktop', 'ios', 'android'].includes(platform)) {
  throw new Error(`expected desktop, ios, or android; found ${platform}`);
}

const profile = process.env.CONATION_CLIENT_PROFILE || 'standalone';
const operatorOrigin =
  process.env.CONATION_OPERATOR_ORIGIN || 'https://conation.dev';
const config = buildTauriClientConfig({
  profile,
  operatorOrigin,
  extraHttpOrigins: splitConfiguredOrigins(
    process.env.CONATION_TAURI_HTTP_ORIGINS
  ),
});
writeTauriRustProfile({
  environment: 'production',
  profile,
  operatorOrigin,
  bundleUpdateBaseUrl: process.env.CONATION_BUNDLE_UPDATE_BASE_URL,
});
const configJson = JSON.stringify(config);
const extraArgs = process.argv.slice(3);
const separator = extraArgs.indexOf('--');
const tauriArgs = separator === -1 ? extraArgs : extraArgs.slice(0, separator);
const cargoArgs = separator === -1 ? [] : extraArgs.slice(separator + 1);
const args =
  platform === 'desktop'
    ? ['tauri', 'build', ...tauriArgs, '--config', configJson]
    : ['tauri', platform, 'build', ...tauriArgs, '--config', configJson];
if (cargoArgs.length > 0) args.push('--', ...cargoArgs);

const child = Bun.spawn(['cargo', ...args], {
  cwd: fileURLToPath(new URL('../tauri/src-tauri', import.meta.url)),
  env: {
    ...process.env,
    CONATION_CLIENT_PROFILE: profile,
    CONATION_OPERATOR_ORIGIN: operatorOrigin,
    VITE_CONATION_CLIENT_PROFILE: profile,
    VITE_CONATION_OPERATOR_ORIGIN: operatorOrigin,
  },
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
});

process.exit(await child.exited);

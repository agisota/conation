import { isTauri } from '@core/util/platform';
import { getConfiguredStandaloneOperatorOrigin } from '../constant/clientProfile';

export function getWebOrigin(): string {
  if (isTauri()) {
    const hostedLegacy =
      globalThis.__CONATION_HOSTED_LEGACY__ ??
      import.meta.env.VITE_CONATION_CLIENT_PROFILE === 'hosted-legacy';
    if (!hostedLegacy) {
      return getConfiguredStandaloneOperatorOrigin();
    }
    return getConfiguredStandaloneOperatorOrigin();
  }
  return window.location.origin;
}

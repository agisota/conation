import { isTauri } from '@core/util/platform';
import { getConfiguredStandaloneOperatorOrigin } from '../constant/clientProfile';

export function getWebOrigin(): string {
  if (isTauri()) {
    return getConfiguredStandaloneOperatorOrigin();
  }
  return window.location.origin;
}

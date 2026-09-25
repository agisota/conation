import { SERVER_HOSTS } from '@core/constant/servers';
import { createSignal, onCleanup, onMount } from 'solid-js';

export type InstallationBrand = {
  version: number;
  name: string;
  color: string;
  logoUrl: string | null;
};

const DEFAULT_BRAND: InstallationBrand = {
  version: 0,
  name: 'Macro',
  color: '#6B5CFF',
  logoUrl: null,
};

const [installationBrand, setInstallationBrand] = createSignal(DEFAULT_BRAND);
export const currentInstallationBrand = installationBrand;

export function shouldApplyBrandVersion(
  currentVersion: number,
  nextVersion: number
) {
  return Number.isSafeInteger(nextVersion) && nextVersion > currentVersion;
}

export function applyBrandSnapshot(value: unknown) {
  if (!value || typeof value !== 'object') return;
  const candidate = value as Partial<InstallationBrand>;
  const current = installationBrand();
  if (
    typeof candidate.version !== 'number' ||
    !shouldApplyBrandVersion(current.version, candidate.version) ||
    typeof candidate.name !== 'string' ||
    !candidate.name.trim() ||
    candidate.name.length > 80 ||
    typeof candidate.color !== 'string' ||
    !/^#[\da-f]{6}$/i.test(candidate.color)
  ) {
    return;
  }
  let logoUrl: string | null = null;
  if (candidate.logoUrl != null) {
    if (
      typeof candidate.logoUrl !== 'string' ||
      candidate.logoUrl !== `/brand/logo/${candidate.version}`
    )
      return;
    logoUrl = `${SERVER_HOSTS['auth-service']}${candidate.logoUrl}`;
  }
  setInstallationBrand({
    version: candidate.version,
    name: candidate.name,
    color: candidate.color,
    logoUrl,
  });
}

export async function refreshInstallationBrand() {
  const response = await fetch(`${SERVER_HOSTS['auth-service']}/brand`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'omit',
  });
  if (!response.ok)
    throw new Error(`Brand request failed (${response.status})`);
  applyBrandSnapshot(await response.json());
}

export function BrandProvider() {
  onMount(() => {
    void refreshInstallationBrand().catch(() => undefined);
    const interval = window.setInterval(() => {
      if (!document.hidden)
        void refreshInstallationBrand().catch(() => undefined);
    }, 30_000);
    const onFocus = () =>
      void refreshInstallationBrand().catch(() => undefined);
    const onVisibility = () => {
      if (!document.hidden) onFocus();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    onCleanup(() => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  });
  return null;
}

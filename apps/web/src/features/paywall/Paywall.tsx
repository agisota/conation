import { usePaywallState } from '@core/constant/PaywallState';
import { onMount } from 'solid-js';

/** Conation self-host has no Stripe checkout. Close if something opens it. */
export function Paywall() {
  const { hidePaywall } = usePaywallState();
  onMount(() => hidePaywall());
  return null;
}

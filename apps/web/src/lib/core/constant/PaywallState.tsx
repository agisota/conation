import { DOCS_BASE } from '@app/lib/constants/docs-links';
import { isConationPaywallEnabled } from '@core/auth/access-policy';
import { createSignal } from 'solid-js';

export enum PaywallKey {
  PROJECT_LIMIT = 'PROJECT_LIMIT',
  FILE_LIMIT = 'FILE_LIMIT',
  IMAGE_LIMIT = 'IMAGE_LIMIT',
  CHAT_LIMIT = 'CHAT_LIMIT',
  O1_LIMIT = 'O1_LIMIT',
  CANVAS_CLIKED = 'CANVAS_CLIKED',
  SAVED_PROMPT = 'SAVED_PROMPT',
  REMOVE_SIGNATURE = 'REMOVE_SIGNATURE',
  MULTI_INBOX = 'MULTI_INBOX',
  TEAMS = 'TEAMS',
}

export type PaywallMessageMetadata = {
  learnMoreUrl: string;
};

// User-visible paywall copy is locale-owned in `shell.paywall.limit.*`.
// This map contains only stable documentation destinations.
export const PaywallMessages: Partial<
  Record<PaywallKey, PaywallMessageMetadata>
> = {
  [PaywallKey.PROJECT_LIMIT]: {
    learnMoreUrl: `${DOCS_BASE}/product/folders`,
  },
  [PaywallKey.CHAT_LIMIT]: {
    learnMoreUrl: `${DOCS_BASE}/product/agents`,
  },
  [PaywallKey.IMAGE_LIMIT]: {
    learnMoreUrl: `${DOCS_BASE}/product/agents`,
  },
  [PaywallKey.O1_LIMIT]: {
    learnMoreUrl: `${DOCS_BASE}/product/agents`,
  },
  [PaywallKey.CANVAS_CLIKED]: {
    learnMoreUrl: `${DOCS_BASE}/product/canvas`,
  },
  [PaywallKey.SAVED_PROMPT]: {
    learnMoreUrl: `${DOCS_BASE}/product/snippets`,
  },
  [PaywallKey.REMOVE_SIGNATURE]: {
    learnMoreUrl: `${DOCS_BASE}/product/email`,
  },
  [PaywallKey.MULTI_INBOX]: {
    learnMoreUrl: `${DOCS_BASE}/product/inbox`,
  },
  [PaywallKey.TEAMS]: {
    learnMoreUrl: `${DOCS_BASE}/account/teams`,
  },
};

const [paywallOpen, setPaywallOpen] = createSignal(false);
// export const [paywallOpen, setPaywallOpen] = createControlledOpenSignal(false);
const [limitReached, _setLimitReached] = createSignal(false);
const [paywallKey, setPaywallKey] = createSignal<PaywallKey | null>(null);

export const usePaywallState = () => {
  const showPaywall = (errorKey?: PaywallKey | null) => {
    if (!isConationPaywallEnabled()) {
      setPaywallOpen(false);
      setPaywallKey(null);
      return;
    }
    if (errorKey) {
      setPaywallKey(errorKey);
    }
    setPaywallOpen(true);
  };

  const hidePaywall = () => {
    setPaywallOpen(false);
    setPaywallKey(null);
  };
  return { paywallOpen, showPaywall, hidePaywall, limitReached, paywallKey };
};

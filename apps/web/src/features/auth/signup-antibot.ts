import { Sha256 } from '@aws-crypto/sha256-js';
import { SERVER_HOSTS } from '@core/constant/servers';
import { platformFetch } from '@core/util/platformFetch';

export const SIGNUP_MAILBOX_LOCAL_KEY = 'conation.signup.mailboxLocal';

export type AntibotProof = {
  nonce: string;
  counter: number;
  expires_at: number;
  mac: string;
};

type SignupChallenge = {
  nonce: string;
  expires_at: number;
  difficulty: number;
  mac: string;
};

export function sha256Bytes(message: string): Uint8Array {
  const hash = new Sha256();
  hash.update(message);
  return hash.digestSync();
}

export function leadingZeroBits(digest: Uint8Array): number {
  let bits = 0;
  for (const byte of digest) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

export function solveCounter(nonce: string, difficulty: number): number {
  for (let counter = 0; counter < 2_000_000; counter++) {
    if (leadingZeroBits(sha256Bytes(`${nonce}:${counter}`)) >= difficulty) {
      return counter;
    }
  }
  throw new Error('antibot solve failed');
}

export function rememberSignupMailboxLocal(local: string | null | undefined) {
  try {
    const trimmed = local?.trim();
    if (trimmed) sessionStorage.setItem(SIGNUP_MAILBOX_LOCAL_KEY, trimmed);
    else sessionStorage.removeItem(SIGNUP_MAILBOX_LOCAL_KEY);
  } catch {
    // sessionStorage can throw in private mode; signup still proceeds.
  }
}

export function peekSignupMailboxLocal(): string | undefined {
  try {
    return sessionStorage.getItem(SIGNUP_MAILBOX_LOCAL_KEY) || undefined;
  } catch {
    return undefined;
  }
}

export function clearSignupMailboxLocal() {
  try {
    sessionStorage.removeItem(SIGNUP_MAILBOX_LOCAL_KEY);
  } catch {
    // ignore
  }
}

export async function solveSignupAntibot(email: string): Promise<AntibotProof> {
  const url = new URL(`${SERVER_HOSTS['auth-service']}/login/signup-challenge`);
  url.searchParams.set('email', email);
  const response = await platformFetch(url.toString());
  if (!response.ok) throw new Error(await response.text());
  const challenge = (await response.json()) as SignupChallenge;
  if (
    typeof challenge.nonce !== 'string' ||
    typeof challenge.mac !== 'string' ||
    typeof challenge.expires_at !== 'number' ||
    typeof challenge.difficulty !== 'number'
  ) {
    throw new Error('invalid signup challenge');
  }
  const counter = solveCounter(challenge.nonce, challenge.difficulty);
  return {
    nonce: challenge.nonce,
    counter,
    expires_at: challenge.expires_at,
    mac: challenge.mac,
  };
}

export function isAntibotReject(status: number, bodyText: string): boolean {
  if (status !== 403) return false;
  try {
    const parsed = JSON.parse(bodyText) as { message?: string };
    return (
      parsed.message === 'ANTIBOT_REQUIRED' ||
      parsed.message === 'ANTIBOT_EXPIRED' ||
      parsed.message === 'ANTIBOT_INVALID'
    );
  } catch {
    return bodyText.includes('ANTIBOT_');
  }
}

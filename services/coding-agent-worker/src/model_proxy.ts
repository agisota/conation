import type { Hono } from 'hono';

/** The only OpenAI-compatible inference route exposed to a managed sandbox. */
export const MODEL_PROXY_PATH = '/conation-model-proxy/v1/chat/completions';
const ROX_CHAT_COMPLETIONS_URL = 'https://api.rox.one/v1/chat/completions';
const MODEL_CAPABILITY_TTL_MS = 8 * 60 * 60 * 1000;
/** A sandbox request should never be able to buffer more than this in worker memory. */
export const MAX_MODEL_PROXY_REQUEST_BYTES = 1024 * 1024;
const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash',
  'nemotron-3-ultra',
  'gpt-5.6-luna',
]);

type Capability = { sessionId: string; expiresAt: number };

/** In-memory, process-local capabilities for active sandbox sessions. */
export class ModelCapabilityRegistry {
  private readonly capabilities = new Map<string, Capability>();

  mint(sessionId: string): string {
    this.revokeSession(sessionId);
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    this.capabilities.set(token, {
      sessionId,
      expiresAt: Date.now() + MODEL_CAPABILITY_TTL_MS,
    });
    return token;
  }

  validate(token: string | null | undefined): boolean {
    if (!token) return false;
    const capability = this.capabilities.get(token);
    if (!capability) return false;
    if (capability.expiresAt > Date.now()) return true;
    this.capabilities.delete(token);
    return false;
  }

  revokeSession(sessionId: string): boolean {
    let revoked = false;
    for (const [token, capability] of this.capabilities) {
      if (capability.sessionId === sessionId) {
        this.capabilities.delete(token);
        revoked = true;
      }
    }
    return revoked;
  }
}

/** Worker-owned registry; sandboxes never receive the OmniRoute secret. */
export const modelCapabilities = new ModelCapabilityRegistry();

/** Canonical endpoint injected into a sandbox, without leaking any credential. */
export function modelProxyBaseUrl(publicUrl: string): string {
  return `${publicUrl.replace(/\/+$/, '')}/conation-model-proxy/v1`;
}

function normalizeModel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const model = value.startsWith('rox/') ? value.slice('rox/'.length) : value;
  return ALLOWED_MODELS.has(model) ? model : undefined;
}

function safeResponseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  for (const name of ['content-type', 'cache-control']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function bearerToken(authorization: string | undefined): string | undefined {
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  return match?.[1];
}

class RequestTooLargeError extends Error {}

async function readBoundedBody(request: Request): Promise<string> {
  const declaredLength = request.headers.get('Content-Length');
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > MAX_MODEL_PROXY_REQUEST_BYTES
  ) {
    throw new RequestTooLargeError();
  }

  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_MODEL_PROXY_REQUEST_BYTES) {
        await reader.cancel().catch(() => {});
        throw new RequestTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export type ModelProxyOptions = {
  apiKey: string;
  capabilities: ModelCapabilityRegistry;
  fetcher?: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>;
};

/**
 * Register the fixed, capability-protected OmniRoute endpoint. The route
 * intentionally accepts only chat completions: it is not a general proxy.
 */
export function registerModelProxyRoute(
  app: Hono,
  { apiKey, capabilities, fetcher = fetch }: ModelProxyOptions
): void {
  app.post(MODEL_PROXY_PATH, async (context) => {
    const token = bearerToken(context.req.header('Authorization'));
    if (!capabilities.validate(token)) {
      return context.json({ error: 'Invalid or expired model capability.' }, 401);
    }
    if (!apiKey) {
      return context.json({ error: 'Model service is not configured.' }, 503);
    }

    let body: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(await readBoundedBody(context.req.raw));
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('body is not an object');
      }
      body = value as Record<string, unknown>;
    } catch (error) {
      if (error instanceof RequestTooLargeError) {
        return context.json({ error: 'Request body exceeds 1 MiB.' }, 413);
      }
      return context.json({ error: 'Request body must be a JSON object.' }, 400);
    }

    const model = normalizeModel(body.model);
    if (!model) {
      return context.json({ error: 'Unsupported model.' }, 400);
    }

    // Construct fresh headers instead of copying client headers. This excludes
    // Authorization, Cookie, X-API-Key, host, and all hop-by-hop headers.
    const headers = new Headers({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    });
    const accept = context.req.header('Accept');
    if (accept) headers.set('Accept', accept);

    let upstream: Response;
    try {
      upstream = await fetcher(ROX_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, model }),
        // A redirected provider response must fail closed. The fixed HTTPS
        // destination is part of this proxy's security boundary.
        redirect: 'error',
      });
    } catch {
      return context.json({ error: 'Model provider is unavailable.' }, 502);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: safeResponseHeaders(upstream),
    });
  });
}

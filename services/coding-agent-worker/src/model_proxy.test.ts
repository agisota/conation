import { expect, test } from 'bun:test';
import { Hono } from 'hono';
import {
  MODEL_PROXY_PATH,
  MAX_MODEL_PROXY_REQUEST_BYTES,
  ModelCapabilityRegistry,
  modelProxyBaseUrl,
  registerModelProxyRoute,
} from './model_proxy';

function proxyHarness() {
  const app = new Hono();
  const capabilities = new ModelCapabilityRegistry();
  const requests: Request[] = [];
  registerModelProxyRoute(app, {
    apiKey: 'worker-only-secret',
    capabilities,
    fetcher: async (input, init) => {
      requests.push(new Request(input, init));
      return new Response('data: streamed\n\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Set-Cookie': 'must-not-reach-sandbox=true',
          'X-Upstream-Debug': 'must-not-reach-sandbox',
        },
      });
    },
  });
  return { app, capabilities, requests };
}

function completionRequest(token: string, model = 'rox/gemini-2.5-flash') {
  return new Request(`http://worker.local${MODEL_PROXY_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Cookie: 'sandbox=session',
      'X-Api-Key': 'sandbox-api-key',
      Connection: 'keep-alive',
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, stream: true, messages: [] }),
  });
}

test('rejects missing, invalid, and revoked model capabilities', async () => {
  const { app, capabilities, requests } = proxyHarness();
  const missing = await app.request(
    `http://worker.local${MODEL_PROXY_PATH}`,
    { method: 'POST', body: '{}' }
  );
  expect(missing.status).toBe(401);

  const capability = capabilities.mint('session-a');
  capabilities.revokeSession('session-a');
  const revoked = await app.request(completionRequest(capability));
  expect(revoked.status).toBe(401);
  expect(requests).toHaveLength(0);
});

test('exposes no non-POST model proxy route', async () => {
  const { app, requests } = proxyHarness();
  const response = await app.request(
    `http://worker.local${MODEL_PROXY_PATH}`,
    { method: 'GET' }
  );
  expect(response.status).toBe(404);
  expect(requests).toHaveLength(0);
});

test('normalizes allowlisted model IDs and scrubs sandbox credentials', async () => {
  const { app, capabilities, requests } = proxyHarness();
  const response = await app.request(
    completionRequest(capabilities.mint('session-a'))
  );

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('x-upstream-debug')).toBeNull();
  expect(await response.text()).toBe('data: streamed\n\n');
  expect(requests).toHaveLength(1);

  const request = requests[0]!;
  expect(request.url).toBe('https://api.rox.one/v1/chat/completions');
  expect(request.method).toBe('POST');
  expect(request.redirect).toBe('error');
  expect(request.headers.get('authorization')).toBe('Bearer worker-only-secret');
  expect(request.headers.get('cookie')).toBeNull();
  expect(request.headers.get('x-api-key')).toBeNull();
  expect(request.headers.get('connection')).toBeNull();
  expect(await request.json()).toMatchObject({ model: 'gemini-2.5-flash' });
});

test('rejects unapproved models without contacting OmniRoute', async () => {
  const { app, capabilities, requests } = proxyHarness();
  const response = await app.request(
    completionRequest(capabilities.mint('session-a'), 'rox/not-approved')
  );
  expect(response.status).toBe(400);
  expect(requests).toHaveLength(0);
});

test('rejects oversized declared and streamed request bodies without contacting OmniRoute', async () => {
  const { app, capabilities, requests } = proxyHarness();
  const declaredTooLarge = new Request(
    'http://worker.local' + MODEL_PROXY_PATH,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + capabilities.mint('session-a'),
        'Content-Length': String(MAX_MODEL_PROXY_REQUEST_BYTES + 1),
        'Content-Type': 'application/json',
      },
      body: '{}',
    }
  );
  expect((await app.request(declaredTooLarge)).status).toBe(413);

  const oversizedStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_MODEL_PROXY_REQUEST_BYTES + 1));
      controller.close();
    },
  });
  const streamedTooLarge = new Request(
    'http://worker.local' + MODEL_PROXY_PATH,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + capabilities.mint('session-b'),
        'Content-Type': 'application/json',
      },
      body: oversizedStream,
    }
  );
  expect((await app.request(streamedTooLarge)).status).toBe(413);
  expect(requests).toHaveLength(0);
});

test('publishes the exact sandbox proxy base URL', () => {
  expect(modelProxyBaseUrl('https://worker.conation.dev/')).toBe(
    'https://worker.conation.dev/conation-model-proxy/v1'
  );
});

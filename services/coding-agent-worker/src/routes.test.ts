import { expect, test } from 'bun:test';
import { Hono } from 'hono';
import { registerWebhookRoute, WEBHOOK_PATH } from './routes';

test('registers only the canonical Conation webhook route', async () => {
  const app = new Hono();
  let delivered: Request | undefined;
  registerWebhookRoute(app, (request) => {
    delivered = request;
    return new Response('accepted');
  });

  const canonical = await app.request(`http://worker.local${WEBHOOK_PATH}`, {
    method: 'POST',
  });
  expect(canonical.status).toBe(200);
  expect(await canonical.text()).toBe('accepted');
  expect(delivered).toBeDefined();
  expect(new URL(delivered!.url).pathname).toBe(WEBHOOK_PATH);

  const legacy = await app.request('http://worker.local/macro-events', {
    method: 'POST',
  });
  expect(legacy.status).toBe(404);
});

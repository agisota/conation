import type { Hono } from 'hono';

/** The only public path accepted by the managed coding-agent webhook receiver. */
export const WEBHOOK_PATH = '/conation-events';

/** A verified SDK webhook delivery handler. */
export type WebhookReceiver = (
  request: Request
) => Response | Promise<Response>;

/** Register the canonical webhook endpoint without a legacy route alias. */
export function registerWebhookRoute(
  app: Hono,
  receiver: WebhookReceiver
): void {
  app.post(WEBHOOK_PATH, (context) => receiver(context.req.raw));
}

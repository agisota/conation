import { Macro } from '@macro-inc/sdk';
import { env } from './env';
import { WEBHOOK_PATH } from './routes';
import { ensureWebhook } from './webhook';

// Registration must happen before the client is built: the events receiver
// verifies delivery signatures with the returned secret.
const webhookSecret = await ensureWebhook(`${env.PUBLIC_URL}${WEBHOOK_PATH}`);
const client = new Macro({
  webhookSecret,
  auth: { type: 'bot', token: env.CONATION_BOT_TOKEN },
});

/** The one Conation SDK client, shared by everything in this worker. The SDK
 * resolves service hosts itself (CONATION_ENV, plus the local-stack portmap
 * when it's `local`). */
export const conation = client.requestedAs(
  client.users.byId(env.CONATION_USER_ID),
);

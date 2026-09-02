import { Macro } from '@conation/sdk';
import { env } from './env';
import { ensureWebhook } from './webhook';

// Registration must happen before the client is built: the events receiver
// verifies delivery signatures with the returned secret.
const webhookSecret = await ensureWebhook(`${env.PUBLIC_URL}/macro-events`);
const base = new Macro({ webhookSecret });

/** The one Conation SDK client, shared by everything in this worker. The SDK
 * resolves service hosts itself (CONATION_ENV, plus the local-stack portmap
 * when it's `local`). */
export const macro = base.requestedAs(base.users.byId(env.CONATION_USER_ID));

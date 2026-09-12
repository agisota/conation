import { Macro } from '@macro-inc/sdk';
import { env } from '../../src/env';

const base = new Macro({});
const conation = base.requestedAs(base.users.byId(env.CONATION_USER_ID));
const hooks = await conation.webhooks.list();
for (const h of hooks) {
  console.log({
    id: h.id,
    name: await h.name(),
    url: await h.endpointUrl(),
    status: await h.status(),
    createdAt: await h.createdAt(),
  });
}

import { msg } from '@conation/sdk';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { conation } from './src/conation';
import { env } from './src/env';
import { modelCapabilities, registerModelProxyRoute } from './src/model_proxy';
import { registerWebhookRoute } from './src/routes';
import { startSession } from './src/session';

// "start_agent_session <repo-url> [prompt...]" in any channel the bot can see.
const TRIGGER = /^start_agent_session\s+(\S+)(?:\s+([\s\S]+))?$/;

function normalizeMessageContent(content: string): string {
  return content
    .replaceAll('\\_', '_')
    .replace(/<m-link>(.*?)<\/m-link>/g, (link, json) => {
      try {
        const { url } = JSON.parse(json);
        return typeof url === 'string' ? url : link;
      } catch {
        return link;
      }
    });
}

function repoName(repoUrl: string): string | undefined {
  return repoUrl
    .split('/')
    .filter(Boolean)
    .at(-1)
    ?.replace(/\.git$/, '');
}

const app = new Hono();

app.use(logger());
registerModelProxyRoute(app, {
  apiKey: env.ROX_API_KEY,
  capabilities: modelCapabilities,
});

conation.events.on('channel.message_posted', async ({ metadata, message }) => {
  const content = await message.content();
  console.log('[ingress] channel.message_posted', { metadata, content });
  const match = content && normalizeMessageContent(content).match(TRIGGER);
  if (!match) return;
  const [, repoUrl, prompt] = match;

  const session = await conation.agentSessions.createExternal({
    repoUrl,
    workspace: '/workspace',
    instructions: repoName(repoUrl),
  });
  startSession({
    agentId: session.id,
    repoUrl,
    prompt: prompt ?? 'Look around the repo and summarize it.',
    onBoot: () =>
      message.reply(msg`Сессия ${session.id} запущена и готова к работе.`),
  });
  await message.reply(msg`AI-сессия запущена: ${session.id}`);
});
const receiver = conation.events.webhook();
registerWebhookRoute(app, receiver);

// With the local stack, webhooks arrive through the sdk-webhook-relay's SSH
// reverse tunnel, which delivers to this host port; 8787 otherwise.
export default {
  fetch: app.fetch,
  port: conation._client.localPortmap?.sdkWebhookHostReceiverPort ?? 8787,
};

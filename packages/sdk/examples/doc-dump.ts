import { type Env, HOSTS } from '../src/config';

const [docArg, actAs] = process.argv.slice(2);
const botToken = process.env.CONATION_BOT_TOKEN;
if (!docArg || !botToken) {
  console.error(
    'usage: CONATION_BOT_TOKEN=mbot_... bun examples/doc-dump.ts <doc-id-or-url> [acting-user-id]',
  );
  process.exit(1);
}
const docId = docArg.startsWith('http')
  ? (new URL(docArg).pathname.split('/').filter(Boolean).pop() ?? docArg)
  : docArg;

const env = (process.env.CONATION_ENV ?? 'dev') as Env;
const headers: Record<string, string> = {
  'x-conation-bot-token': botToken,
  'x-conation-bot-scope': actAs ? 'user' : 'team',
};
if (actAs) {
  headers['x-conation-bot-for-conation-user-id'] = actAs;
  console.error(`acting as ${actAs} (user scope)`);
} else {
  console.error('no acting user given (team scope)');
}

const res = await fetch(`${HOSTS[env].storage}/documents/${docId}/text`, {
  headers,
});
if (!res.ok) {
  console.error(`${res.status} ${await res.text()}`);
  process.exit(1);
}
const { text } = (await res.json()) as { text: string };
console.log(text);

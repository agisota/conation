import type { AnyMessage, Stream } from '@agentclientprotocol/sdk';
import { conation } from './conation';
import { env } from './env';
import type { AgentSandbox } from './interfaces';
import { modelCapabilities, modelProxyBaseUrl } from './model_proxy';
import type { AcpMessage } from './protocol/generated';
import { DaytonaProvider } from './providers/daytona';
import { UpstreamLink } from './upstream';

/** Frame router between the sandbox's ACP connection and the upstream link.
 * The worker itself never speaks ACP - it neither initializes the agent nor
 * creates a session; agent_proxy owns that handshake (and every ACP
 * session), sent down over the same upstream link this relays into the
 * sandbox. Every frame in either direction — upstream's, and every byte
 * opencode emits — is relayed verbatim. */
class SessionRouter {
  onAgentExit: () => void = () => {};

  private readonly writer: WritableStreamDefaultWriter<AnyMessage>;

  constructor(
    conn: Stream,
    private readonly link: UpstreamLink,
    private readonly sessionId: string
  ) {
    // The SDK's connection layer is deliberately not used: agent_proxy owns
    // the ACP session, so this end correlates nothing.
    this.writer = conn.writable.getWriter();
    link.onAcp = (frame) => this.writeToAgent(frame);
    void this.pump(conn.readable);
  }

  async close(): Promise<void> {
    // Closing the writable closes the underlying websocket.
    await this.writer.close().catch(() => {});
  }

  private writeToAgent(frame: AcpMessage) {
    console.log(`[session ${this.sessionId}] -> agent`, frame);
    // Relayed verbatim: agent_proxy owns the ACP session and its validation.
    void this.writer.write(frame as AnyMessage).catch((error) => {
      console.error(`[session ${this.sessionId}] write to agent failed`, error);
    });
  }

  private async pump(readable: ReadableStream<AnyMessage>): Promise<void> {
    const reader = readable.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          console.warn(
            `[session ${this.sessionId}] agent stream closed (done)`
          );
          break;
        }
        console.log(`[session ${this.sessionId}] <- agent`, value);
        this.link.acp(value);
      }
    } catch (error) {
      console.error(`[session ${this.sessionId}] agent stream failed`, error);
    }
    this.onAgentExit();
  }
}

type LiveSession = {
  sandbox: AgentSandbox;
  router: SessionRouter;
  link: UpstreamLink;
};
const sessions = new Map<string, LiveSession>();
const provider = new DaytonaProvider();

/** Kick off a session: returns the id immediately; all progress streams to the
 * session-scoped upstream WebSocket as tagged system and ACP messages.
 *
 * `agentId` is agent_proxy's chat/agent id and becomes the session id
 * verbatim (the shared runtime endpoint's `?id=` is matched against it on
 * the other end). */
export function startSession(opts: {
  repoUrl: string;
  prompt: string;
  agentId: string;
  /** Called once the sandbox is up and the agent is ready to work. */
  onBoot?: () => unknown;
}): string {
  void run(opts.agentId, opts);
  return opts.agentId;
}

async function run(
  sessionId: string,
  opts: {
    repoUrl: string;
    prompt: string;
    agentId: string;
    onBoot?: () => unknown;
  }
): Promise<void> {
  // agent_harness serves the runtime websocket on the same host as its HTTP
  // API, so the SDK's resolved host (env defaults / local portmap) is the
  // default; UPSTREAM_WS_URL only overrides it for the dev fixture.
  const upstreamUrl =
    env.UPSTREAM_WS_URL ||
    `${conation._client.hosts['agent-harness'].replace(/^http/, 'ws')}/runtime`;

  const link = new UpstreamLink(upstreamUrl, sessionId);
  let sandbox: AgentSandbox | null = null;
  try {
    await conation.agentSessions.byId(opts.agentId).control({
      type: 'prompt',
      prompt: opts.prompt,
    });

    link.status('booting');
    console.log(`[session ${sessionId}] spawning sandbox`, {
      repoUrl: opts.repoUrl,
    });

    sandbox = await provider.spawn({
      repoUrl: opts.repoUrl,
      envVars: {
        GITHUB_TOKEN: env.GITHUB_TOKEN,
        CONATION_MODEL_PROXY_URL: modelProxyBaseUrl(env.PUBLIC_URL),
        CONATION_MODEL_SESSION_TOKEN: modelCapabilities.mint(sessionId),
      },
    });
    console.log(
      `[session ${sessionId}] sandbox up, connecting to ACP sidecar`,
      { sandboxId: sandbox.id }
    );

    const conn = await sandbox.connect();
    console.log(
      `[session ${sessionId}] ACP sidecar connected, wiring session router`
    );
    const router = new SessionRouter(conn, link, sessionId);
    router.onAgentExit = () => void destroySession(sessionId);
    sessions.set(sessionId, { sandbox, router, link });

    link.status('acp_ready');
    await opts.onBoot?.();
  } catch (e) {
    console.error(`[session ${sessionId}] sandbox setup failed`, e);
    if (sessions.has(sessionId)) {
      await destroySession(sessionId);
    } else {
      modelCapabilities.revokeSession(sessionId);
      link.status('shutting_down');
      await sandbox?.release().catch(() => {});
      link.close();
    }
  }
}

async function destroySession(id: string): Promise<boolean> {
  const live = sessions.get(id);
  const capabilityRevoked = modelCapabilities.revokeSession(id);
  if (!live) return capabilityRevoked;
  sessions.delete(id);
  live.link.status('shutting_down');
  await live.router.close().catch(() => {});
  await live.sandbox.release().catch(() => {});
  live.link.close();
  return true;
}

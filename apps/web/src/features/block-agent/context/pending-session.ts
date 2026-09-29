/**
 * Sessions that exist on screen before they exist on the server.
 *
 * `POST /agent-sessions` does not answer until its Daytona sandbox is booted,
 * cloned and answering — minutes, not milliseconds. Waiting on that before
 * opening anything means staring at a spinner for the whole provision, so the
 * session's id is minted here and the block opens against it immediately;
 * the create carries the same id, so the URL, the sidebar row and every
 * reference are final from the first frame and nothing has to be adopted
 * or rewritten when the server answers.
 *
 * The registry is module-level on purpose: the create is in flight before any
 * block mounts, and must survive the mount either way round — resolving
 * before the block is on screen is normal, not a race. It is what tells a
 * block "not created yet" apart from "a session to load": an id in here is
 * waiting on its create; any other id is loaded as it is.
 *
 * Everything downstream of the block reads its session id as
 * `Accessor<string | undefined>`, so "not created yet" is the same absence
 * they already handle while the GET is in flight.
 */

import { AgentSession } from '@core/agent-session/AgentSession';
import { startSend } from '@core/agent-session/send-telemetry';
import { markMessageSent } from '@core/util/message-send-motion';
import { refetchSoupEntity } from '@queries/soup/normalized-cache';
import { agentHarnessServiceClient } from '@service-agent-harness/client';
import type {
  CreateAgentSessionRequest,
  PromptAttachment,
} from '@service-agent-harness/generated/schemas';
import { type Accessor, createSignal } from 'solid-js';
import { v7 as uuidv7 } from 'uuid';

export type PendingSession = {
  /** The session's id, once the create has made it real. */
  sessionId: Accessor<string | undefined>;
  /** The create failed — this block has nothing to become. */
  failed: Accessor<boolean>;
  /** The startup error returned by the service. */
  error: Accessor<string | undefined>;
  /**
   * The first prompt, so the block can show it as sent from the moment it
   * opens rather than once the create has answered.
   */
  prompt: string | undefined;
};

const pending = new Map<string, PendingSession>();

/**
 * Options captured by the preflight composer before a session exists.
 */
export type StartPendingSessionOptions = {
  /** Persisted managed persona to run; omitted for Macro Coder. */
  botId?: string;
  /** First prompt. */
  prompt?: string;
  /** Uploaded SFS files delivered with the first prompt. */
  attachments?: PromptAttachment[];
  /** The sender, so the first prompt is attributed as the log will. */
  userId?: string;
  /** Model to run on instead of the persona's, set as the session is created. */
  modelOverride?: string;
  /**
   * Explicit GitHub repository for the managed Cursor session.
   */
  repoUrl?: string;
  /** Starting branch for the selected repository. */
  repoBranch?: string;
};

/**
 * Start creating a managed session and return its id, to open a block
 * against right now. The POST runs unattended; nothing awaits it.
 *
 * The id is minted here and sent with the create - a v7 UUID like the ones
 * the harness mints for actions, so it sorts by time with the server's own.
 */
export function startPendingSession(
  options: StartPendingSessionOptions = {}
): string {
  const id = uuidv7();
  const [sessionId, setSessionId] = createSignal<string>();
  const [error, setError] = createSignal<string>();
  pending.set(id, {
    sessionId,
    failed: () => error() !== undefined,
    error,
    prompt: options.prompt?.trim() || undefined,
  });

  const prompt = options.prompt?.trim() ?? '';
  const attachments = options.attachments ?? [];
  const trace =
    prompt || attachments.length > 0
      ? startSend(id, {
          surface: 'new_chat',
          promptChars: prompt.length,
          attachmentCount: attachments.length,
        })
      : undefined;
  const fail = (message: string, cause?: unknown) => {
    trace?.end('failed', cause ?? message);
    setError(message);
  };

  const start = async () => {
    const result = await agentHarnessServiceClient.create({
      id,
      ...(options.botId ? { botId: options.botId } : {}),
      ...(options.modelOverride ? { model: options.modelOverride } : {}),
      ...(options.repoUrl
        ? { repoUrl: options.repoUrl, repoBranch: options.repoBranch }
        : {}),
    } satisfies CreateAgentSessionRequest);
    if (result.isErr()) {
      fail(
        result.error.map((error) => error.message).join(' ') ||
          'The agent session could not be created.'
      );
      return;
    }
    // A service that predates client-minted ids may answer with its own id.
    const created = result.value.session.id;
    trace?.adopt(created);
    trace?.created();
    void refetchSoupEntity(created, 'agentSession', { created: true });
    // Adopt before waiting on the runtime handshake: the shared session folds
    // the first prompt speculatively so the block shows it immediately.
    setSessionId(created);
    if (prompt || attachments.length > 0) {
      const session = AgentSession.acquire(created);
      try {
        const delivered = await session.issue(
          {
            type: 'prompt',
            prompt,
            ...(attachments.length > 0 ? { attachments } : {}),
          },
          { userId: options.userId }
        );
        if (delivered.isErr()) {
          fail(
            delivered.error.map((error) => error.message).join(' ') ||
              'The first message could not be sent.'
          );
          return;
        }
        trace?.prompted(delivered.value.actionId);
        markMessageSent(`agent:${created}:${delivered.value.actionId}`);
      } finally {
        session.release();
      }
    }
  };

  void (trace?.run(() => start()) ?? start()).catch(() =>
    fail(
      'Could not reach the agent service. Check your connection and try again.'
    )
  );

  return id;
}

/**
 * The create in flight for `id`, or undefined when there is none: the id is
 * a session to load as it is - including one whose create belonged to a tab
 * that is gone, which then loads (or fails to) like any other.
 */
export function pendingSession(id: string): PendingSession | undefined {
  return pending.get(id);
}

/**
 * Drop a settled create. Called once the block has seen it land or fail, so
 * the map does not grow for the life of the tab.
 */
export function forgetPendingSession(id: string): void {
  pending.delete(id);
}

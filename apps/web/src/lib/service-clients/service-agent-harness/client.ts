import { SERVER_HOSTS } from '@core/constant/servers';
import { fetchWithToken } from '@core/util/fetchWithToken';
import type { ResultError } from '@core/util/result';
import type {
  AgentActionId,
  AgentSessionLogResponse,
  AgentSessionResponse,
  ControlRequest,
  CreateAgentSessionRequest,
  CreateAgentSessionResponse,
  SandboxSize,
  SandboxSizeBody,
} from './generated/schemas';

export type { SandboxSize, SandboxSizeBody };

/** Control POST failures the composer can show instead of a generic send toast. */
export type HarnessControlErrorCode =
  | 'RUNTIME_DISCONNECTED'
  | 'MISSING_PROVIDER_KEY';

const agentHarnessHost = SERVER_HOSTS['agent-harness'];

function classifyHarnessControlError(
  status: number,
  body: string
): ResultError<HarnessControlErrorCode | 'HTTP_ERROR'> {
  const message = body.trim();
  if (
    status === 409 ||
    /not connected|failed to contact|не получилось связаться/i.test(message)
  ) {
    return {
      code: 'RUNTIME_DISCONNECTED',
      message: message || 'the agent is not connected',
    };
  }
  if (
    /api.?key|x-api-key|ROX_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY|not configured|missing.*key|authentication_error/i.test(
      message
    )
  ) {
    return { code: 'MISSING_PROVIDER_KEY', message };
  }
  return {
    code: 'HTTP_ERROR',
    message: message || `HTTP error! status: ${status}`,
  };
}

/** Authenticated client for controlling live agent sessions. */
export const agentHarnessServiceClient = {
  create(request: CreateAgentSessionRequest) {
    return fetchWithToken<CreateAgentSessionResponse>(
      `${agentHarnessHost}/agent-sessions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }
    );
  },

  get(sessionId: string) {
    return fetchWithToken<AgentSessionResponse>(
      `${agentHarnessHost}/agent-sessions/${sessionId}`,
      { method: 'GET' }
    );
  },

  getLog(sessionId: string) {
    return fetchWithToken<AgentSessionLogResponse>(
      `${agentHarnessHost}/agent-sessions/${sessionId}/log`,
      { method: 'GET' }
    );
  },

  rename(sessionId: string, name: string) {
    return fetchWithToken<Record<string, never>>(
      `${agentHarnessHost}/agent-sessions/${sessionId}/name`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }
    ).then((result) => result.map(() => undefined));
  },

  /**
   * Returns the accepted action's id, which the fold stamps as `requestId`
   * on the folded message the action derives — the correlation handle for
   * watching that action's outcome.
   */
  control(sessionId: string, request: ControlRequest) {
    // The endpoint answers with a bare JSON string (`AgentActionId`), which
    // `fetchWithToken`'s object-or-bytes constraint cannot name; the cast is
    // the whole accommodation.
    return fetchWithToken<Record<string, never>, HarnessControlErrorCode>(
      `${agentHarnessHost}/agent-sessions/${sessionId}/control`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        errorResponseHandler: async (response) => {
          const body = await response.text().catch(() => '');
          return classifyHarnessControlError(response.status, body);
        },
      }
    ).then((result) => result.map((id) => id as unknown as AgentActionId));
  },

  delete(sessionId: string) {
    return fetchWithToken<Record<string, never>>(
      `${agentHarnessHost}/agent-sessions/${sessionId}`,
      { method: 'DELETE' }
    ).then((result) => result.map(() => undefined));
  },

  getSandboxSize() {
    return fetchWithToken<SandboxSizeBody>(
      `${agentHarnessHost}/agent-sandbox-size`,
      {
        method: 'GET',
      }
    );
  },

  setSandboxSize(size: SandboxSize) {
    return fetchWithToken<SandboxSizeBody>(
      `${agentHarnessHost}/agent-sandbox-size`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size }),
      }
    );
  },

  setSessionSandboxSize(sessionId: string, size: SandboxSize) {
    return fetchWithToken<SandboxSizeBody>(
      `${agentHarnessHost}/agent-sessions/${sessionId}/sandbox-size`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size }),
      }
    );
  },
};

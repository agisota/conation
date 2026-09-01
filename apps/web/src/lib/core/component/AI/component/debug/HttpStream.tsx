import { formatDateTime, t } from '@app/lib/i18n';
import { WebsocketConnectionState } from '@conation/collaboration/websocket';
import { SERVER_HOSTS } from '@core/constant/servers';
import { platformFetch } from '@core/util/platformFetch';
import { connectionGatewayClient } from '@service-connection/client';
import {
  state as connectionState,
  createConnectionWebsocketEffect,
  type FromWebsocketMessage,
} from '@service-connection/websocket';
import { makePersisted } from '@solid-primitives/storage';
import { Button, cn } from '@ui';
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';

interface StreamChunk {
  timestamp: Date;
  raw: unknown;
}

export default function HttpStreamDebug() {
  const [chatId, setChatId] = makePersisted(createSignal(''), {
    name: 'http-stream-debug-chat-id',
    storage: localStorage,
  });
  const [messageContent, setMessageContent] = createSignal('Hello, world!');
  const [streamId, setStreamId] = createSignal<string | null>(null);
  const [chunks, setChunks] = createSignal<StreamChunk[]>([]);
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Resubscribe to the entity when we have a chatId and the ws is connected
  createEffect(() => {
    const id = chatId();
    const connected = connectionState() === WebsocketConnectionState.Open;
    if (id && connected) {
      connectionGatewayClient.trackEntity({
        entity_type: 'chat',
        entity_id: id,
        action: 'open',
      });
    }
  });

  // Concatenated text response derived from chunks
  const responseText = createMemo(() => {
    let text = '';
    for (const chunk of chunks()) {
      const raw = chunk.raw as Record<string, unknown>;
      if (
        raw?.type === 'chat_message_response' &&
        (raw.content as Record<string, unknown>)?.type === 'text'
      ) {
        text += (raw.content as Record<string, unknown>).text;
      }
    }
    return text;
  });

  // Listen for messages on connection gateway
  // Stream messages arrive as { type: "stream", data: "<json>" }
  // where the parsed data is a StreamItem: { id: { entity_type, entity_id, stream_id }, payload: <value> }
  createConnectionWebsocketEffect((data: FromWebsocketMessage) => {
    if (data.type !== 'stream') return;

    let msgData = data.data;
    if (typeof msgData === 'string') {
      try {
        msgData = JSON.parse(msgData);
      } catch {
        return;
      }
    }
    if (msgData.id?.entity_id !== chatId()) return;
    if (msgData.id?.stream_id) setStreamId(msgData.id.stream_id);

    setChunks((prev) => [
      ...prev,
      { timestamp: new Date(), raw: msgData.payload },
    ]);

    if (msgData.payload?.type === 'stream_end') {
      setIsStreaming(false);
    }
  });

  const sendMessage = async () => {
    setError(null);
    setChunks([]);
    setIsStreaming(true);

    try {
      const response = await platformFetch(
        `${SERVER_HOSTS['cognition-service']}/stream/chat/message`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId(),
            content: messageContent(),
            model: 'anthropic/claude-haiku-4-5',
            token: '',
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        setError(`HTTP ${response.status}: ${errorText}`);
        setIsStreaming(false);
        return;
      }

      const data = await response.json();
      // message_id is the same as stream_id
      setStreamId(data.message_id);
      // Update chat ID if a new one was created
      if (data.chat_id) {
        setChatId(data.chat_id);
      }
      // Subscribe to the chat entity so the connection gateway routes messages to us
      connectionGatewayClient.trackEntity({
        entity_type: 'chat',
        entity_id: data.chat_id || chatId(),
        action: 'open',
      });
    } catch (err) {
      setError(t('ai.debug.http.error', { error: String(err) }));
      setIsStreaming(false);
    }
  };

  return (
    <div class="size-full overflow-auto p-4">
      <div class="max-w-5xl mx-auto space-y-4">
        <h1 class="text-lg font-medium">{t('ai.debug.http.title')}</h1>

        {/* Connection Status */}
        <div class="flex items-center gap-2">
          <span class="text-sm">{t('ai.debug.http.connectionGateway')}</span>
          <span
            class={cn(
              'text-sm px-2 py-1 rounded',
              connectionState() === WebsocketConnectionState.Open
                ? 'bg-success-bg text-success-ink'
                : 'bg-failure-bg text-failure-ink'
            )}
          >
            {connectionState() === WebsocketConnectionState.Open
              ? t('ai.debug.http.connected')
              : t('ai.debug.http.disconnected')}
          </span>
        </div>

        {/* Form */}
        <div class="space-y-3 p-4 border border-edge rounded-lg">
          <div>
            <div class="block text-sm mb-1">{t('ai.debug.http.message')}</div>
            <textarea
              value={messageContent()}
              onInput={(e) => setMessageContent(e.currentTarget.value)}
              placeholder={t('ai.debug.http.messagePlaceholder')}
              rows={3}
              class="w-full px-3 py-2 border border-edge rounded bg-surface resize-none"
            />
          </div>
          <div class="flex gap-2">
            <Button
              onClick={sendMessage}
              variant="accent"
              disabled={isStreaming()}
            >
              {t(
                isStreaming()
                  ? 'ai.debug.http.streaming'
                  : 'ai.debug.http.sendMessage'
              )}
            </Button>
            <Button
              onClick={() => {
                setChatId('');
                setStreamId(null);
                setChunks([]);
                setError(null);
                setIsStreaming(false);
              }}
              variant="outline"
            >
              {t('ai.debug.actions.reset')}
            </Button>
          </div>
        </div>

        {/* Chat ID */}
        <Show when={chatId()}>
          <div class="text-sm p-2 bg-surface rounded font-mono break-all">
            {t('ai.debug.http.chatId')}: {chatId()}
          </div>
        </Show>

        {/* Stream ID */}
        <Show when={streamId()}>
          <div class="text-sm p-2 bg-surface rounded font-mono break-all">
            {t('ai.debug.http.streamId')}: {streamId()}
          </div>
        </Show>

        {/* Error */}
        <Show when={error()}>
          <div class="text-sm p-2 bg-failure-bg text-failure-ink rounded">
            {error()}
          </div>
        </Show>

        {/* Response + Chunks side by side */}
        <div class="flex gap-4">
          {/* Response (left) */}
          <div class="flex-1 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">
                {t('ai.debug.http.response')}
              </span>
              <Show when={isStreaming()}>
                <span class="text-sm text-accent animate-pulse">
                  {t('ai.debug.http.streaming')}
                </span>
              </Show>
            </div>
            <div class="border border-edge rounded-lg max-h-96 overflow-auto">
              <Show
                when={responseText()}
                fallback={
                  <div class="p-4 text-center text-sm text-ink-muted">
                    {t('ai.debug.http.noResponse')}
                  </div>
                }
              >
                <div class="p-3 text-sm whitespace-pre-wrap">
                  {responseText()}
                </div>
              </Show>
            </div>
          </div>

          {/* Chunks (right) */}
          <div class="flex-1 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">
                {t('ai.debug.http.chunkCount', { count: chunks().length })}
              </span>
              <Show when={isStreaming()}>
                <span class="text-sm text-accent animate-pulse">
                  {t('ai.debug.http.receiving')}
                </span>
              </Show>
            </div>
            <div class="border border-edge rounded-lg max-h-96 overflow-auto">
              <Show
                when={chunks().length > 0}
                fallback={
                  <div class="p-4 text-center text-sm text-ink-muted">
                    {t('ai.debug.http.noChunks')}
                  </div>
                }
              >
                <For each={chunks()}>
                  {(chunk) => (
                    <div class="p-3 border-b border-edge last:border-b-0">
                      <div class="text-xs text-ink-muted mb-1">
                        {formatDateTime(chunk.timestamp, {
                          hour: 'numeric',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </div>
                      <pre class="text-xs font-mono whitespace-pre-wrap break-all">
                        {JSON.stringify(chunk.raw, null, 2)}
                      </pre>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

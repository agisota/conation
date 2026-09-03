import { t } from '@app/lib/i18n';
import { getConfiguredClientProfile } from '@core/constant/clientProfile';
import { SidePanel } from '@components/app/side-panel';
import { SplitPanelContext } from '@components/app/split-layout/context';
import { useBlockId } from '@core/block';
import { LoadErrorPanel } from '@core/component/EntityLoadGate';
import { StaticMarkdownContext } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { LinkedConversationDrawer } from '@core/linked-conversation';
import EmptyStateAiGraphic from '@design/empty-state-ai.svg';
import { EmptyStatePanel } from '@ui';
import { Show, useContext } from 'solid-js';

import {
  AgentSessionProvider,
  useAgentSession,
} from '../context/AgentSessionContext';
import {
  ORIGIN_THREAD_DRAWER_ID,
  sessionOriginThread,
} from '../context/origin-thread';
import { forgetPendingSession } from '../context/pending-session';
import { AgentComposer } from './AgentComposer';
import { AgentSplitHeader } from './AgentSplitHeader';
import { AgentSidePanelSections } from './sidepanel/AgentSidePanelSections';
import { Transcript } from './Transcript';

function AgentBlockContent() {
  const { session, metadata, loadFailed, loadRetryable, pending, retryLoad } =
    useAgentSession();

  // Nothing loaded and no way forward: the load failed outright, or the
  // device is offline and the pending load cannot complete until
  // connectivity returns (that one resumes by itself, so no Retry). Gating
  // the whole block — like the other entity blocks — keeps the composer and
  // header from rendering against a session that never loaded.
  const loadUnavailable = () =>
    loadFailed() ||
    (nativeNetworkStatus() === 'offline' && !session() && !pending());
  // Create failed with nothing to retry: on standalone that is a missing
  // model key, not a document that failed to load.

  return (
    <Show
      when={!loadUnavailable()}
      fallback={
        loadFailed() &&
        !loadRetryable() &&
        getConfiguredClientProfile() === 'standalone' ? (
          <EmptyStatePanel
            centered
            graphic={EmptyStateAiGraphic}
            title={t('agent.empty.noModelKey')}
            description={t('agent.empty.noModelKeyDescription')}
          />
        ) : (
          <LoadErrorPanel
            title={t('agent.document.loadFailed')}
            onRetry={loadRetryable() ? retryLoad : undefined}
          />
        )
      }
    >
      {/* One shared static-markdown editor for every text part, rather than
          one per part — the same scoping the channel does around its message
          tree. */}
      <StaticMarkdownContext>
        <div class="size-full overflow-hidden flex">
          {/* Collapsed by default, like the other conversation-shaped blocks —
            the transcript wants the width; `]` or the header button opens it. */}
          <SidePanel.Layout defaultOpen={false}>
            <AgentSidePanelSections />
            <AgentSplitHeader
              session={session()}
              title={metadata()?.title ?? undefined}
            />
            <div class="size-full min-w-0 flex flex-col">
              <Transcript />
              <div class="shrink-0 w-full max-w-3xl mx-auto px-4 pb-4">
                <AgentComposer />
              </div>
            </div>
            <Show when={sessionOriginThread(session())}>
              {(origin) => (
                <LinkedConversationDrawer
                  id={ORIGIN_THREAD_DRAWER_ID}
                  channelId={origin().channelId}
                  messageId={origin().messageId}
                />
              )}
            </Show>
          </SidePanel.Layout>
        </div>
      </StaticMarkdownContext>
    </Show>
  );
}

export default function BlockAgent() {
  const blockId = useBlockId();
  const split = useContext(SplitPanelContext);

  // A block opened from the create menu mounts against a placeholder while
  // `POST /agent-sessions` provisions its sandbox — minutes, during which the
  // user is already typing. When the real id lands the split adopts it in
  // place: the URL becomes the session's, this mount keeps running, and the
  // placeholder is gone from history rather than being a back step to
  // nowhere.
  const adoptSessionId = (sessionId: string) => {
    split?.handle.adoptContentId({ type: 'agent', nextId: sessionId });
    forgetPendingSession(blockId);
  };

  return (
    <Show when={blockId}>
      {(id) => (
        <AgentSessionProvider blockId={id()} onSessionId={adoptSessionId}>
          <AgentBlockContent />
        </AgentSessionProvider>
      )}
    </Show>
  );
}

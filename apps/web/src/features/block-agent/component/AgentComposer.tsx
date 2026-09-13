/**
 * The block's composer container: reads the composer controller from the
 * session context and drives the dumb `AgentInput` and `QueuedPromptList`
 * with derived props. All block-level state stays on this side of the
 * boundary.
 */

import { t } from '@app/lib/i18n';
import { createEffect, createSignal, Show } from 'solid-js';
import type { AgentMode } from '../agent-mode-prefs';
import { useAgentSession } from '../context/AgentSessionContext';
import { useAgentModePrefs } from '../context/use-agent-mode-prefs';
import {
  AgentInput,
  AgentModelSelector,
  AgentModeSelector,
  ComposerNotice,
  QueuedPromptList,
} from '../ui';

export function AgentComposer() {
  const {
    composer,
    loadFailed,
    metadata,
    pending,
    resuming,
    registerQuoteInsert,
  } = useAgentSession();
  const modePrefs = useAgentModePrefs();
  const [sessionMode, setSessionMode] = createSignal<AgentMode>('yolo');
  const [modeHydrated, setModeHydrated] = createSignal(false);

  createEffect(() => {
    const loaded = modePrefs.loaded();
    if (loaded === undefined || modeHydrated()) return;
    setSessionMode(loaded);
    setModeHydrated(true);
  });

  // A session still being created was created by this user, one action ago,

  // A session still being created was created by this user, one action ago,
  // and has an empty transcript: the only thing to do with it is type. The
  // wait for the sandbox is exactly when that matters most.
  const autofocus = pending();

  return (
    <>
      <Show when={resuming()}>
        <ComposerNotice text={t('agent.composer.resuming')} active />
      </Show>
      <QueuedPromptList
        prompts={composer.queue()}
        sendingId={composer.sendingId()}
        failed={composer.sendFailed()}
        onRetry={composer.retry}
        onRemove={composer.remove}
      />
      <AgentInput
        placeholder={t('agent.composer.placeholder')}
        autofocus={autofocus}
        busy={composer.busy()}
        disabled={loadFailed()}
        commands={() => metadata()?.availableCommands ?? []}
        onSend={composer.send}
        onStop={composer.stop}
        registerQuoteInsert={registerQuoteInsert}
        modelControl={
          <div class="flex items-center gap-1">
            <AgentModeSelector
              value={sessionMode()}
              disabled={loadFailed()}
              onSelect={setSessionMode}
              onApplyToAll={(mode) => {
                setSessionMode(mode);
                modePrefs.persist(mode);
              }}
            />
            <AgentModelSelector
              model={metadata()?.model ?? null}
              changingTo={composer.changingModel()}
              options={metadata()?.supportedModels ?? []}
              disabled={loadFailed()}
              onSelect={composer.setModel}
            />
          </div>
        }
      />
    </>
  );
}

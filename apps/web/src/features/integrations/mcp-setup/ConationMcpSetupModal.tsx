import { AiChatEmptyState } from '@core/component/AI/component/AIChatEmptyState';
import { createControlledOpenSignal } from '@core/util/createControlledOpenSignal';
import { Dialog, Surface } from '@ui';
import { Show } from 'solid-js';

const [conationMcpSetupOpen, setConationMcpSetupOpen] =
  createControlledOpenSignal(false, {
    id: 'conation-mcp-setup',
  });

export const openConationMcpSetupModal = () => {
  setConationMcpSetupOpen(true);
};

const _closeConationMcpSetupModal = () => {
  setConationMcpSetupOpen(false);
};

export function ConationMcpSetupModal() {
  return (
    <Show when={conationMcpSetupOpen()}>
      <Dialog
        open={conationMcpSetupOpen()}
        onOpenChange={setConationMcpSetupOpen}
        class="w-190"
      >
        <Surface depth={2} class="rounded-xl">
          <div class="*:max-h-[75vh]">
            <AiChatEmptyState />
          </div>
        </Surface>
      </Dialog>
    </Show>
  );
}

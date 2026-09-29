import type { PasteNodeDecoratorProps } from '@macro-inc/lexical-core';
import { cn, Layer } from '@ui';
import { createSignal, Show } from 'solid-js';
import { PasteActionsMenu } from './paste/PasteActionsMenu';
import { PasteTextViewer } from './paste/PasteTextViewer';
import { ReferencedText } from './paste/ReferencedText';
import { usePasteNode } from './paste/usePasteNode';

/**
 * Block-level decorator for a {@link PasteNode}. A clipboard paste renders
 * as the collapsed code-fence chip below; text referenced from a
 * conversation renders as a quote reply ({@link ReferencedText}), the same
 * row a channel reply uses.
 */
export function PasteNode(props: PasteNodeDecoratorProps) {
  return (
    <Show
      when={props.origin === 'referenced'}
      fallback={<PastedText {...props} />}
    >
      <ReferencedText {...props} />
    </Show>
  );
}

/**
 * A compact collapsed monospace preview that fades to the background and
 * opens the full passage. The preview control is separate from its action
 * menu so the menu's buttons are never nested inside an activatable control.
 */
function PastedText(props: PasteNodeDecoratorProps) {
  const node = usePasteNode(props);
  const [open, setOpen] = createSignal(false);

  const openViewer = (event: MouseEvent | KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    node.selectNode();
    setOpen(true);
  };

  return (
    <Layer depth={2}>
      <div class="relative my-2">
        <button
          type="button"
          contentEditable={false}
          aria-label={`Open ${node.origin()} text`}
          on:keydown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              openViewer(event);
            }
          }}
          on:click={openViewer}
          class={cn(
            'block w-full rounded border border-edge bg-surface no-select-children select-none overflow-hidden text-left',
            node.isSelectedAsNode() && 'bg-active outline-edge outline-4'
          )}
        >
          <div class="relative max-h-28 overflow-hidden">
            <pre class="font-mono text-xs leading-relaxed bg-message p-3 m-0 whitespace-pre overflow-hidden">
              {props.content}
            </pre>
            <div class="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-message" />
          </div>

          <span class="absolute bottom-2 left-2 inline-flex items-center px-2 py-1 text-xs leading-none rounded-full border border-edge bg-surface">
            {node.origin()}
          </span>
        </button>

        <Show when={node.isEditable()}>
          <PasteActionsMenu
            class="absolute top-1 right-1"
            onCopy={node.copyText}
            onConvertToText={node.convertToText}
            onDelete={node.deleteNode}
          />
        </Show>
      </div>

      <PasteTextViewer
        open={open()}
        onOpenChange={setOpen}
        title="Pasted text"
        content={props.content}
        onCopy={node.copyText}
      />
    </Layer>
  );
}

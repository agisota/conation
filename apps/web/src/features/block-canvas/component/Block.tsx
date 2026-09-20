import { useBlockEntityCommands } from '@app/features/next-soup/actions';
import { t } from '@app/lib/i18n';
import { FileSidePanelSections, SidePanel } from '@components/app/side-panel';
import {
  useBlockId,
  useBlockNestedContext,
  useIsNestedBlock,
} from '@core/block';
import { DocumentBlockContainer } from '@core/component/DocumentBlockContainer';
import { createMethodRegistration } from '@core/orchestrator';
import { blockHotkeyScopeSignal } from '@core/signal/blockElement';
import { blockFileSignal, blockHandleSignal } from '@core/signal/load';
import { useCanEdit } from '@core/signal/permissions';
import { useSearchParams } from '@solidjs/router';
import {
  createEffect,
  createSignal,
  onCleanup,
  Show,
  type JSX,
} from 'solid-js';
import type { CanvasView } from '../context/canvas-document-context';
import { useSaveCanvasDataImmediate } from '../store/canvasData';
import { peekOfflineCanvas } from '../store/offline-canvas';
import { CanvasDocument, type CanvasDocumentMethods } from './CanvasDocument';
import { ModalsProvider } from './ModalsProvider';
import { TopBar } from './TopBar';

export type BlockCanvasProps = {
  view?: CanvasView;
};

function CanvasShell(props: {
  content: JSX.Element;
  isNested: boolean;
  documentId: string;
}) {
  const saveCanvasDataImmediate = useSaveCanvasDataImmediate();
  const [offline, setOffline] = createSignal(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [pendingOffline, setPendingOffline] = createSignal(
    !!peekOfflineCanvas(props.documentId)
  );

  createEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    onCleanup(() => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    });
  });

  return (
    <div
      class="size-full select-none flex flex-col"
      on:click={(event) => {
        if (props.isNested) event.stopPropagation();
      }}
    >
      <ModalsProvider>
        <Show when={!props.isNested} fallback={props.content}>
          <SidePanel.Layout defaultOpen={false}>
            <FileSidePanelSections />
            <div class="flex size-full min-w-0 flex-col overflow-hidden">
              <TopBar />
              <Show when={offline() || pendingOffline()}>
                <div
                  role="status"
                  class="flex items-center justify-between gap-3 border-b border-alert/20 bg-alert-bg px-3 py-2 text-sm text-alert-ink"
                >
                  <span>
                    {offline()
                      ? t('canvas.collaboration.offlineDescription')
                      : t('canvas.collaboration.pendingDescription')}
                  </span>
                  <button
                    type="button"
                    class="shrink-0 underline"
                    onClick={() => {
                      void saveCanvasDataImmediate().then(() => {
                        setPendingOffline(!!peekOfflineCanvas(props.documentId));
                      });
                    }}
                  >
                    {t('canvas.collaboration.retry')}
                  </button>
                </div>
              </Show>
              {props.content}
            </div>
          </SidePanel.Layout>
        </Show>
      </ModalsProvider>
    </div>
  );
}

export default function BlockCanvas(props: BlockCanvasProps) {
  useBlockEntityCommands();
  const documentId = useBlockId();
  const isNested = useIsNestedBlock();
  const nestedContext = useBlockNestedContext<'canvas'>();
  const canEdit = useCanEdit();
  const hotkeyScope = blockHotkeyScopeSignal.get;
  const file = blockFileSignal.get;
  const blockHandle = blockHandleSignal.get;
  const [locationParams] = useSearchParams();

  const registerMethods = (methods: Partial<CanvasDocumentMethods>) => {
    createMethodRegistration(blockHandle, methods);
  };

  return (
    <DocumentBlockContainer>
      <CanvasDocument
        documentId={documentId}
        file={file()}
        canEdit={canEdit()}
        hotkeyScope={hotkeyScope()}
        isNested={isNested}
        portalScope="block"
        view={props.view}
        locationParams={locationParams}
        onLocationChange={
          nestedContext?.parentContext?.canvas?.onLocationChange
        }
        registerMethods={registerMethods}
      >
        {(content) => (
          <CanvasShell
            content={content}
            isNested={isNested}
            documentId={documentId}
          />
        )}
      </CanvasDocument>
    </DocumentBlockContainer>
  );
}

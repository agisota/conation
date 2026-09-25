import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { CanvasDocument } from '@block-canvas/component/CanvasDocument';
import { useCanvasDocument } from '@block-canvas/context/canvas-document-context';
import {
  type Canvas,
  validateCanvasImport,
} from '@block-canvas/model/CanvasModel';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import {
  getPermissions,
  hasPermissions,
  Permissions,
} from '@core/component/SharePermissions';
import { createCanvasFileFromJsonString } from '@core/util/create';
import { contentHash } from '@core/util/hash';
import { downloadFile } from '@filesystem/download';
import { fetchBinaryDocumentData } from '@queries/storage/binary-document';
import { waitForDocumentContentReady } from '@queries/storage/document-location';
import { useProjectsQuery } from '@queries/storage/projects';
import { storageServiceClient } from '@service-storage/client';
import { FileTypeMap } from '@service-storage/fileTypeMap';
import { fetchBinary } from '@service-storage/util/fetchBinary';
import { uploadToPresignedUrl } from '@service-storage/util/uploadToPresignedUrl';
import { useSearchParams } from '@solidjs/router';
import { Button, Dialog, Surface } from '@ui';
import { createSignal, For, Show, type JSX } from 'solid-js';
import {
  FileDetailLayout,
  FileDetailLoadGate,
  type FileDetailShareProps,
} from '../components/FileDetail';
import { downloadFileOperation } from '../components/file-detail-operations';
import {
  type CanvasDocumentData,
  loadCanvasDocument,
} from '../queries/canvas-document';
import { documentDownloadName } from '../util/document-download-name';
import type { FileDetailContext } from '../util/file-detail-context';

export type CanvasDetailContext = FileDetailContext<CanvasDocumentData>;

async function importCanvasWithMedia(args: {
  json: string;
  title: string;
  projectId: string;
}): Promise<string> {
  // Preserve the exported graph verbatim apart from DSS media document IDs.
  const board = JSON.parse(args.json) as Canvas;
  const media = new Map<string, 'image' | 'video'>();
  for (const node of board.nodes ?? []) {
    if (node.type !== 'image' && node.type !== 'video') continue;
    if (node.status === 'static') {
      throw new Error(
        'This board contains static media, which cannot be copied into the destination folder safely.'
      );
    }
    if (!node.uuid) {
      throw new Error('This board contains media without a document ID.');
    }
    const previousType = media.get(node.uuid);
    if (previousType && previousType !== node.type) {
      throw new Error('A media document is used as both an image and a video.');
    }
    media.set(node.uuid, node.type);
  }

  const copied = new Map<string, string>();
  const created: string[] = [];
  let boardId: string | undefined;
  try {
    for (const [sourceId, kind] of media) {
      const source = await fetchBinaryDocumentData(sourceId);
      if (source.isErr()) {
        throw new Error(`Cannot access the original ${kind} (${sourceId}).`);
      }
      const metadata = source.value.documentMetadata;
      const fileType = metadata.fileType;
      const format = fileType
        ? FileTypeMap[fileType as keyof typeof FileTypeMap]
        : undefined;
      if (!format || format.app !== kind) {
        throw new Error(
          `The original ${kind} (${sourceId}) has an invalid file type.`
        );
      }
      const downloaded = await fetchBinary(source.value.blobUrl, 'arraybuffer');
      if (downloaded.isErr()) {
        throw new Error(`Cannot download the original ${kind} (${sourceId}).`);
      }
      const bytes = downloaded.value;
      const sha = await contentHash(bytes);
      if (metadata.sha && metadata.sha !== sha) {
        throw new Error(`The original ${kind} (${sourceId}) failed its checksum.`);
      }

      const destination = await storageServiceClient.createDocument({
        documentName: metadata.documentName,
        fileType,
        projectId: args.projectId,
        sha,
        restrictToProject: true,
      });
      if (destination.isErr()) {
        throw new Error(
          `Could not create a destination copy of ${kind} (${sourceId}).`
        );
      }
      const { metadata: copy, presignedUrl, contentType } = destination.value;
      created.push(copy.documentId);
      const uploaded = await uploadToPresignedUrl({
        presignedUrl,
        buffer: bytes,
        sha,
        type: contentType,
      });
      if (uploaded.isErr()) {
        throw new Error(
          `Could not upload the destination copy of ${kind} (${sourceId}).`
        );
      }
      const ready = await waitForDocumentContentReady({
        documentId: copy.documentId,
        versionId: copy.documentVersionId,
      });
      if (ready.content.state !== 'ready') {
        throw new Error(
          `The destination copy of ${kind} (${sourceId}) did not become ready.`
        );
      }
      const stored = await fetchBinaryDocumentData(copy.documentId);
      if (
        stored.isErr() ||
        stored.value.documentMetadata.projectId !== args.projectId ||
        stored.value.documentMetadata.sha !== sha
      ) {
        throw new Error(
          `The destination copy of ${kind} (${sourceId}) could not be verified.`
        );
      }
      const readback = await fetchBinary(stored.value.blobUrl, 'arraybuffer');
      if (readback.isErr() || (await contentHash(readback.value)) !== sha) {
        throw new Error(
          `The destination copy of ${kind} (${sourceId}) failed its checksum.`
        );
      }
      copied.set(sourceId, copy.documentId);
    }

    if (copied.size) {
      for (const node of board.nodes ?? []) {
        if (node.type === 'image' || node.type === 'video') {
          node.uuid = copied.get(node.uuid)!;
        }
      }
    }
    const importedJson = copied.size ? JSON.stringify(board) : args.json;
    const result = await createCanvasFileFromJsonString({
      json: importedJson,
      title: args.title,
      projectId: args.projectId,
      restrictToProject: true,
      source: 'canvas-import',
    });
    if ('error' in result) throw new Error(result.error);
    boardId = result.documentId;
    const ready = await waitForDocumentContentReady({
      documentId: boardId,
    });
    if (ready.content.state !== 'ready') {
      throw new Error('The imported Canvas did not become ready.');
    }
    const stored = await fetchBinaryDocumentData(boardId);
    if (
      stored.isErr() ||
      stored.value.documentMetadata.projectId !== args.projectId ||
      stored.value.documentMetadata.sha !==
        (await contentHash(new TextEncoder().encode(importedJson)))
    ) {
      throw new Error('The imported Canvas could not be verified.');
    }
    const readback = await fetchBinary(stored.value.blobUrl, 'arraybuffer');
    if (
      readback.isErr() ||
      new TextDecoder().decode(readback.value) !== importedJson
    ) {
      throw new Error('The imported Canvas did not retain its content.');
    }
    return boardId;
  } catch (error) {
    const cleanup = await Promise.allSettled(
      [...created, ...(boardId ? [boardId] : [])].map((documentId) =>
        storageServiceClient.deleteDocument({ documentId })
      )
    );
    const incompleteCleanup = cleanup.some(
      (result) => result.status === 'rejected' || result.value.isErr()
    );
    const message =
      error instanceof Error ? error.message : 'Canvas import failed.';
    throw new Error(
      incompleteCleanup
        ? `${message} Some incomplete Canvas or media copies could not be removed; contact support.`
        : message
    );
  }
}

function CanvasDetailContent(props: {
  data: CanvasDocumentData;
  children?: (context: CanvasDetailContext) => JSX.Element;
  content: JSX.Element;
}) {
  const [importOpen, setImportOpen] = createSignal(false);
  const [projectId, setProjectId] = createSignal('');
  const [file, setFile] = createSignal<File>();
  const [importing, setImporting] = createSignal(false);
  const [importError, setImportError] = createSignal('');
  const [importedId, setImportedId] = createSignal('');
  let fileInput: HTMLInputElement | undefined;
  const projects = useProjectsQuery();

  const importCanvas = async () => {
    const selectedFile = file();
    if (!selectedFile || !projectId() || importing()) {
      setImportError('Choose a Canvas file and a destination folder.');
      return;
    }
    setImporting(true);
    setImportError('');
    try {
      const json = validateCanvasImport(await selectedFile.text());
      const documentId = await importCanvasWithMedia({
        json,
        title: selectedFile.name.replace(/\.canvas$/i, '') || 'Imported Canvas',
        projectId: projectId(),
      });
      setImportedId(documentId);
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : 'Canvas import failed.'
      );
    } finally {
      setImporting(false);
    }
  };

  const closeImport = () => {
    if (importing()) return;
    setImportOpen(false);
    setProjectId('');
    if (fileInput) fileInput.value = '';
    setFile(undefined);
    setImportError('');
    setImportedId('');
  };
  const analytics = useAnalytics();
  const [savedFile] = useCanvasDocument().state.signals.currentSavedFile;
  const downloadName = documentDownloadName(
    props.data.documentMetadata,
    'Unknown Filename'
  );
  const operations = [
    downloadFileOperation(() => {
      downloadFile(savedFile() ?? props.data.file, downloadName);
      analytics.track('download', { blockType: 'canvas' });
    }),
  ];

  return (
    <>
      {props.children?.({
        data: props.data,
        documentMetadata: props.data.documentMetadata,
        userAccessLevel: props.data.userAccessLevel,
        operations,
      })}
      <div class="flex size-full min-h-0 min-w-0 flex-col overflow-hidden">
        <div class="flex shrink-0 justify-end border-b border-edge px-3 py-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            Import .canvas
          </Button>
        </div>
        <div class="min-h-0 min-w-0 flex-1">{props.content}</div>
      </div>
      <Dialog
        open={importOpen()}
        onOpenChange={(open) => !open && closeImport()}
      >
        <Surface depth={2} class="w-[min(28rem,calc(100vw-2rem))] rounded-xl p-5">
          <Dialog.Title class="text-base font-semibold text-ink">
            Import Canvas board
          </Dialog.Title>
          <p class="mt-2 text-sm text-ink-muted">
            Create a separate board and copies of its document media in the
            destination folder. You need access to the originals; they stay
            unchanged.
          </p>
          <div class="mt-5 flex flex-col gap-4">
            <label class="flex flex-col gap-1 text-sm font-medium text-ink">
              Canvas file
              <input
                type="file"
                accept=".canvas,application/json"
                ref={fileInput}
                disabled={importing() || !!importedId()}
                class="min-w-0 text-sm font-normal"
                onChange={(event) => {
                  setFile(event.currentTarget.files?.[0]);
                  setImportError('');
                }}
              />
            </label>
            <label class="flex flex-col gap-1 text-sm font-medium text-ink">
              Destination folder
              <select
                value={projectId()}
                disabled={importing() || !!importedId()}
                onChange={(event) => {
                  setProjectId(event.currentTarget.value);
                  setImportError('');
                }}
                class="min-h-10 rounded-md border border-edge bg-surface px-2 text-sm font-normal text-ink"
              >
                <option value="">Choose a folder</option>
                <For each={projects.data ?? []}>
                  {(project) => (
                    <option value={project.id}>{project.name}</option>
                  )}
                </For>
              </select>
            </label>
          </div>
          <Show when={projects.isError}>
            <p role="alert" class="mt-3 text-sm text-failure">
              Couldn’t load destination folders. Close and try again.
            </p>
          </Show>
          <Show when={importError()}>
            <p role="alert" class="mt-3 text-sm text-failure">
              {importError()}
            </p>
          </Show>
          <Show when={importedId()}>
            <p role="status" class="mt-3 text-sm text-ink">
              Canvas imported to the selected folder.
            </p>
          </Show>
          <div class="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={closeImport} disabled={importing()}>
              {importedId() ? 'Done' : 'Cancel'}
            </Button>
            <Show when={!importedId()}>
              <Button
                onClick={() => void importCanvas()}
                disabled={importing() || !file() || !projectId()}
              >
                {importing() ? 'Importing…' : 'Import board'}
              </Button>
            </Show>
          </div>
        </Surface>
      </Dialog>
    </>
  );
}

export function CanvasDetailDocument(
  props: FileDetailShareProps & {
    documentId: string;
    data: CanvasDocumentData;
    children?: (context: CanvasDetailContext) => JSX.Element;
  }
) {
  const panel = useSplitPanelOrThrow();
  const [searchParams] = useSearchParams();
  const canEdit = () =>
    hasPermissions(
      getPermissions(props.data.userAccessLevel),
      Permissions.CAN_EDIT
    );

  return (
    <FileDetailLayout
      documentId={props.documentId}
      documentMetadata={props.data.documentMetadata}
      userAccessLevel={props.data.userAccessLevel}
      blockType="canvas"
      shareOpen={props.shareOpen}
      onShareOpenChange={props.onShareOpenChange}
    >
      <CanvasDocument
        documentId={props.documentId}
        file={props.data.file}
        canEdit={canEdit()}
        hotkeyScope={panel.splitHotkeyScope}
        portalScope="split"
        locationParams={searchParams}
      >
        {(content) => (
          <CanvasDetailContent
            data={props.data}
            children={props.children}
            content={content}
          />
        )}
      </CanvasDocument>
    </FileDetailLayout>
  );
}

export function CanvasDetail(
  props: FileDetailShareProps & {
    documentId: string;
    children?: (context: CanvasDetailContext) => JSX.Element;
  }
) {
  return (
    <FileDetailLoadGate
      documentId={props.documentId}
      label="canvas"
      load={loadCanvasDocument}
    >
      {(data) => (
        <CanvasDetailDocument
          documentId={props.documentId}
          data={data}
          shareOpen={props.shareOpen}
          onShareOpenChange={props.onShareOpenChange}
          children={props.children}
        />
      )}
    </FileDetailLoadGate>
  );
}

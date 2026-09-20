import { t } from '@app/lib/i18n';
import {
  defineBlock,
  type ExtractLoadType,
  LoadErrors,
  loadResult,
} from '@core/block';
import { ENABLE_MARKDOWN_LIVE_COLLABORATION } from '@core/constant/featureFlags';
import { ThrownResultError } from '@core/util/result';
import { isLocalFirstId } from '@core/util/offline-create';
import { fetchDocumentLocation } from '@queries/storage/document-location';
import { fetchDocumentLoadBundle } from '@queries/storage/documentLoad/documentLoadBundle';
import { makeFileFromBlob } from '@service-storage/util/makeFileFromBlob';
import { createSyncServiceSource } from '@service-sync/source';
import { err, ok } from 'neverthrow';
import MarkdownBlock from './component/Block';
import {
  endDocumentSpan,
  registerDocumentSpan,
  resumeDocumentSpan,
  startDocumentSpan,
} from './observability';
import type { Diff } from './types';

export const definition = defineBlock({
  name: 'md',
  get description() {
    return t('markdown.document.description');
  },
  get defaultFilename() {
    return t('markdown.document.newNote');
  },
  aliases: [
    {
      name: 'task',
      get defaultFileName() {
        return t('markdown.task.new');
      },
    },
    {
      name: 'snippet',
      get defaultFileName() {
        return t('markdown.snippet.new');
      },
    },
    {
      name: 'skill',
      get defaultFileName() {
        return t('markdown.skill.new');
      },
    },
  ],
  component: MarkdownBlock,
  accepted: {
    md: 'text/markdown',
  },
  async load(source, intent) {
    if (source.type === 'sync-service') {
      const documentId = source.id;
      if (isLocalFirstId(documentId)) {
        return LoadErrors.INVALID;
      }
      if (intent === 'preload') {
        return ok({
          type: 'preload',
          origin: source,
        });
      }

      let rootSpan = resumeDocumentSpan(documentId);
      if (!rootSpan) {
        rootSpan = startDocumentSpan('doc.open');
        rootSpan.setAttr('doc.type', 'md');
        rootSpan.setAttr('document.id', documentId);
        registerDocumentSpan(documentId, rootSpan);
      }
      return rootSpan.span('doc.load', async (loadSpan) => {
        const loadBundle = () =>
          loadSpan.span('doc.load.bundle', async (bundleSpan) => {
            const result = await fetchDocumentLoadBundle(documentId);
            if (result.isErr()) {
              bundleSpan.error(new ThrownResultError(result.error));
            }
            return result;
          });

        const loadLocation = () =>
          loadSpan.span('doc.load.location', async (locationSpan) => {
            const result = await loadResult(
              fetchDocumentLocation({ documentId })
            );
            if (result.isErr()) {
              locationSpan.error(new ThrownResultError(result.error));
              return result;
            }
            const location = result.value;
            if (location.type !== 'syncServiceContent') {
              locationSpan.error('markdown document not in sync-service');
              return LoadErrors.INVALID;
            }
            return ok(location);
          });

        const [maybeBundle, maybeLocation] = await Promise.all([
          loadBundle(),
          loadLocation(),
        ]);
        if (maybeBundle.isErr()) {
          loadSpan.error('load bundle failed');
          rootSpan.error('load bundle failed');
          endDocumentSpan(documentId);
          return err(maybeBundle.error);
        }
        const { token, documentMetadata, userAccessLevel } = maybeBundle.value;

        if (maybeLocation.isErr()) {
          loadSpan.error('load location failed');
          rootSpan.error('load location failed');
          endDocumentSpan(documentId);
          return err(maybeLocation.error);
        }

        const location = maybeLocation.value;

        // Markdown initialization and lifecycle persistence are backend-owned.
        // If a markdown document still resolves to object storage here, opening
        // it would require a backend repair/backfill path rather than a frontend
        // sync-service mutation that leaves DB content metadata inconsistent.
        if (location.type !== 'syncServiceContent') {
          console.error(
            'Markdown document is not available in sync-service',
            documentId,
            location.content
          );
          loadSpan.error('markdown document not in sync-service');
          rootSpan.error('markdown document not in sync-service');
          endDocumentSpan(documentId);
          return LoadErrors.INVALID;
        }

        const { source: syncSource, doInitialSync } = createSyncServiceSource(
          source.id,
          token
        );

        // HACK: unfortunately, most blocks still rely on a dssFile for things like
        // metadata and fileName. so I'm creating an empty blob file to get around that.
        const fileWithoutBlob = await makeFileFromBlob({
          blob: new Blob([]),
          documentKeyParts: {
            owner: documentMetadata.owner,
            documentId: documentMetadata.documentId,
            documentVersionId: documentMetadata.documentVersionId.toString(),
            // @ts-ignore: TODO: fix / replace @conation/document-processing-job-types
            fileType: 'md',
          },
          fileName: documentMetadata.documentName,
          mimeType: definition.accepted['md']!,
          // @ts-ignore: TODO: fix / replace @conation/document-processing-job-types
          metadata: documentMetadata,
        });

        return ok({
          dssFile: fileWithoutBlob,
          userAccessLevel,
          syncSource,
          doInitialSync,
          documentMetadata,
        });
      });
    }
    return LoadErrors.INVALID;
  },
  liveTrackingEnabled: true,
  syncServiceEnabled: ENABLE_MARKDOWN_LIVE_COLLABORATION,
  editPermissionEnabled: ENABLE_MARKDOWN_LIVE_COLLABORATION,
});

export type MarkdownData = ExtractLoadType<(typeof definition)['load']>;

export type MarkdownBlockSpec = {
  setPatches: (args: { patches: Diff[] }) => Promise<void>;
  setIsRewriting: () => Promise<void>;
};

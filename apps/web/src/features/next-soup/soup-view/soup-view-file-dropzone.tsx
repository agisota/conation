import { t } from '@app/lib/i18n';
import { useHandleFileUpload } from '@app/util/handleFileUpload';
import { FileDropOverlay } from '@core/component/FileDropOverlay';
import { fileFolderDrop } from '@core/directive/fileFolderDrop';
import { handleFileFolderDrop } from '@core/util/upload';
import { createSignal, type FlowComponent, Show } from 'solid-js';

false && fileFolderDrop;

export const SoupViewFileDropzone: FlowComponent = (props) => {
  const [isDragging, setIsDragging] = createSignal(false);
  const [isValidDrag, setIsValidDrag] = createSignal(true);

  const handleFileUpload = useHandleFileUpload();

  return (
    <div
      class="relative flex flex-col size-full"
      use:fileFolderDrop={{
        onDrop: (fileEntries, folderEntries) => {
          handleFileFolderDrop(fileEntries, folderEntries, handleFileUpload);
        },
        onDragStart: () => {
          setIsValidDrag(true);
          setIsDragging(true);
        },
        onDragEnd: () => setIsDragging(false),
      }}
    >
      <Show when={isDragging()}>
        <FileDropOverlay valid={isValidDrag()}>
          <Show when={!isValidDrag()}>
            <div class="text-failure">{t('soup.upload.invalidFileType')}</div>
          </Show>
          <div>{t('soup.upload.dropToWorkspace')}</div>
        </FileDropOverlay>
      </Show>
      {props.children}
    </div>
  );
};

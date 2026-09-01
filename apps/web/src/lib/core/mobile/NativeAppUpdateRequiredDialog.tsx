import { t } from '@app/lib/i18n';
import { Button, Dialog, Surface } from '@ui';

export function NativeAppUpdateRequiredDialog(props: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      class="w-[90%] max-w-120"
      position="center"
    >
      <Surface depth={2}>
        <div class="flex flex-col gap-4 px-4 py-5">
          <div class="flex flex-col gap-2">
            <Dialog.Title class="text-lg font-semibold text-ink">
              {t('mobile.updateRequired.title')}
            </Dialog.Title>
            <Dialog.Description class="text-sm leading-5 text-ink-extra-muted">
              {t('mobile.updateRequired.description')}
            </Dialog.Description>
          </div>
          <div class="flex justify-end">
            <Dialog.CloseButton as={Button} variant="accent" size="sm">
              {t('mobile.updateRequired.confirm')}
            </Dialog.CloseButton>
          </div>
        </div>
      </Surface>
    </Dialog>
  );
}

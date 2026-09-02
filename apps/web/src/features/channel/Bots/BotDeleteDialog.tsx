import { t } from '@app/lib/i18n';
import TrashIcon from '@phosphor/trash.svg';
import { Button, Dialog, Surface } from '@ui';

export function BotDeleteDialog(props: {
  open: boolean;
  botName?: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => !open && !props.pending && props.onClose()}
      position="center"
      class="w-[90%] max-w-120"
    >
      <Surface depth={2} class="rounded-xl text-ink">
        <div class="border-b border-edge-muted px-5 py-3">
          <Dialog.Title class="text-sm font-semibold">
            {t('channel.bots.delete.confirmTitle', {
              name: props.botName ?? t('channel.bots.botFallbackName'),
            })}
          </Dialog.Title>
        </div>
        <div class="flex flex-col gap-4 p-5">
          <Dialog.Description class="text-sm leading-5 text-ink-muted">
            {t('channel.bots.delete.description')}
          </Dialog.Description>
          <div class="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={props.pending}
              onClick={props.onClose}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={props.pending}
              onClick={props.onConfirm}
            >
              <TrashIcon />
              {props.pending
                ? t('channel.bots.delete.deleting')
                : t('channel.bots.delete.submit')}
            </Button>
          </div>
        </div>
      </Surface>
    </Dialog>
  );
}

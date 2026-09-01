import TrashIcon from '@phosphor/trash.svg';
import { t } from '@app/lib/i18n';
import { Button } from '@ui';

type BotDetailActionsProps = {
  dirty: boolean;
  pending: boolean;
  saving: boolean;
  onBack: () => void;
  onDelete: () => void;
};

export function BotDetailActions(props: BotDetailActionsProps) {
  return (
    <div class="flex items-center justify-between gap-3 pt-1">
      <Button
        type="button"
        variant="danger"
        size="sm"
        disabled={props.pending}
        onClick={props.onDelete}
      >
        <TrashIcon />{t('auto.delete_bot')}</Button>
      <div class="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={props.pending}
          onClick={props.onBack}
        >{t('auto.back')}</Button>
        <Button
          type="submit"
          variant="cta"
          size="sm"
          disabled={!props.dirty || props.pending}
        >
          {props.saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

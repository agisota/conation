import { t } from '@app/lib/i18n';
import { formatRelativeDate } from '@core/util/time';
import { Show } from 'solid-js';
import { isDateDividerVisible } from './DateDivider';
import type { ChannelMessageListMeta } from './list-meta';
import { MessageFlag } from './MessageFlag';

type NewDividerProps = {
  createdAt: string;
  listMeta?: ChannelMessageListMeta;
  isReply?: boolean;
  onDismiss?: () => void;
};

export function NewDivider(props: NewDividerProps) {
  const isVisible = () =>
    !props.isReply && props.listMeta?.isFirstNewMessage === true;
  const text = () =>
    isDateDividerVisible(props.createdAt, props.listMeta, props.isReply)
      ? t('channel.message.newSince', {
          date: formatRelativeDate(props.createdAt),
        })
      : t('channel.message.new');

  return (
    <Show when={isVisible()}>
      <button
        type="button"
        class="w-full text-left"
        title={t('channel.message.markAsRead')}
        onClick={props.onDismiss}
      >
        <MessageFlag text={text()} highlight />
      </button>
    </Show>
  );
}

import { isOwnMessage } from '@channel/Thread/utils/message-actions';
import { useUserId } from '@core/context/user';
import { useUnfurl } from '@core/signal/unfurl';
import { extractDomain, openExternalUrl } from '@core/util/url';
import GlobeIcon from '@phosphor/globe-simple.svg';
import XIcon from '@phosphor/x.svg';
import { useSuppressLinkPreviewMutation } from '@queries/channel/message';
import { proxyResource } from '@service-unfurl/client';
import type { GetUnfurlResponse } from '@service-unfurl/generated/schemas/getUnfurlResponse';
import { cn } from '@ui';
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  Show,
} from 'solid-js';
import { useMessage } from './context';
import {
  hideLinkPreview,
  isLinkPreviewHidden,
  showLinkPreviews,
  unhideLinkPreview,
} from './link-preview-visibility';
import { extractUnfurlableUrls, shouldRenderUnfurl } from './link-previews';

function openLink(url: string): JSX.EventHandler<HTMLElement, MouseEvent> {
  return (e) => {
    // Modified/middle clicks keep native anchor behavior (background tab
    // etc.); plain clicks go through openExternalUrl so links open in the
    // system browser under Tauri.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openExternalUrl(url);
  };
}

function LinkPreviewCard(props: {
  unfurled: GetUnfurlResponse;
  onHide?: () => void;
}) {
  const [faviconFailed, setFaviconFailed] = createSignal(false);
  const [imageFailed, setImageFailed] = createSignal(false);
  const domain = () => extractDomain(props.unfurled.url);

  return (
    <div
      class="group/preview mb-2 flex min-w-0 flex-col gap-0.5 border-l-2 border-edge py-0.5 pl-3"
      data-link-preview={props.unfurled.url}
    >
      <div class="flex min-w-0 items-center gap-1.5">
        <Show
          when={props.unfurled.favicon_url && !faviconFailed()}
          fallback={<GlobeIcon class="size-3.5 shrink-0 text-ink-muted" />}
        >
          {(_) => (
            <img
              src={proxyResource(props.unfurled.favicon_url!)}
              class="size-3.5 shrink-0 rounded-xs object-cover"
              crossorigin="anonymous"
              alt=""
              draggable={false}
              on:error={() => setFaviconFailed(true)}
            />
          )}
        </Show>
        <span class="min-w-0 flex-1 truncate text-xs font-medium text-ink">
          {domain()}
        </span>
        <Show when={props.onHide}>
          <button
            type="button"
            aria-label="Remove link previews"
            class="shrink-0 rounded p-0.5 text-ink-extra-muted opacity-0 hover:text-ink focus-visible:opacity-100 group-hover/preview:opacity-100 touch:opacity-100"
            onClick={props.onHide}
          >
            <XIcon class="size-3.5" />
          </button>
        </Show>
      </div>
      <a
        href={props.unfurled.url}
        target="_blank"
        rel="noopener"
        class="line-clamp-2 wrap-break-word text-sm font-medium text-accent hover:underline"
        draggable={false}
        onClick={openLink(props.unfurled.url)}
      >
        {props.unfurled.title || domain()}
      </a>
      <Show when={props.unfurled.description}>
        <p class="line-clamp-3 wrap-break-word text-xs text-ink-muted">
          {props.unfurled.description}
        </p>
      </Show>
      <Show when={props.unfurled.image_url && !imageFailed()}>
        {(_) => (
          <img
            src={proxyResource(props.unfurled.image_url!)}
            class="mt-1 max-h-64 w-auto max-w-full cursor-pointer self-start rounded-md border border-edge-muted"
            crossorigin="anonymous"
            alt={props.unfurled.title}
            draggable={false}
            onClick={openLink(props.unfurled.url)}
            on:error={() => setImageFailed(true)}
          />
        )}
      </Show>
    </div>
  );
}

function LinkPreview(props: {
  url: string;
  onRemove: (() => void) | undefined;
}) {
  const [unfurlData] = useUnfurl(props.url);
  const renderable = createMemo(() => {
    const data = unfurlData();
    if (data?.type !== 'success') return undefined;
    return shouldRenderUnfurl(data.data) ? data.data : undefined;
  });

  return (
    <Show when={renderable()}>
      {(unfurled) => (
        <LinkPreviewCard unfurled={unfurled()} onHide={props.onRemove} />
      )}
    </Show>
  );
}

type LinkPreviewsProps = {
  /** Enables the sender's "remove preview" action on this message's cards. */
  channelId?: string;
  class?: string;
};

/**
 * Slack-style rich previews for external links in the message body, rendered
 * below the content. Previews pop in once the unfurl service responds;
 * links with no usable metadata, and messages whose sender removed previews,
 * render nothing.
 */
export function LinkPreviews(props: LinkPreviewsProps) {
  const message = useMessage();
  const userId = useUserId();
  const suppressPreviews = useSuppressLinkPreviewMutation();
  const urls = createMemo(() => {
    if (
      !showLinkPreviews() ||
      message().deleted_at ||
      message().suppress_link_previews ||
      isLinkPreviewHidden(message().id)
    ) {
      return [];
    }
    return extractUnfurlableUrls(message().content ?? '');
  });

  // Discord's suppress-embeds model: only the sender gets the ×, and it
  // removes every preview on the message for every participant. The local
  // hide is the optimistic layer, rolled back if the server rejects it.
  const removeForEveryone = () => {
    const messageId = message().id;
    const channelId = props.channelId;
    if (!channelId) return;
    hideLinkPreview(messageId);
    suppressPreviews.mutate(
      { channelID: channelId, messageID: messageId },
      { onError: () => unhideLinkPreview(messageId) }
    );
  };
  const canRemove = () =>
    props.channelId !== undefined && isOwnMessage(message(), userId());

  // Once the server-confirmed suppression reaches the cache, the optimistic
  // entry is redundant — drop it so it can't shadow a future unsuppress.
  createEffect(() => {
    const { id, suppress_link_previews } = message();
    if (suppress_link_previews && isLinkPreviewHidden(id)) {
      unhideLinkPreview(id);
    }
  });

  return (
    <Show when={urls().length > 0}>
      {/* Spacing lives on the cards: with every unfurl still loading or
          failed this container is empty and must take up no height. */}
      <div
        class={cn('flex min-w-0 max-w-md flex-col', props.class)}
        data-message-link-previews
      >
        <For each={urls()}>
          {(url) => (
            <LinkPreview
              url={url}
              onRemove={canRemove() ? removeForEveryone : undefined}
            />
          )}
        </For>
      </div>
    </Show>
  );
}

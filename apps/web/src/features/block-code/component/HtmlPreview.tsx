import { blockTextSignal } from '@core/signal/load';
import { t } from '@app/lib/i18n';
import { createEffect, createMemo } from 'solid-js';

export function HtmlPreview() {
  const blockText = createMemo(blockTextSignal.get);
  createEffect(() => {
    console.log(blockText());
  });

  return (
    // Static pads on mobile/tablet: the iframe scrolls internally, so its content
    // can't under-scroll the floating chrome — the viewport sits between it.
    <div class="size-full bg-surface overflow-auto touch:pt-(--mobile-content-inset-top) touch:pb-(--mobile-content-inset-bottom)">
      <iframe
        title={t('auto.html_preview')}
        class="size-full border-0"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcdoc={blockText() ?? ''}
      />
    </div>
  );
}

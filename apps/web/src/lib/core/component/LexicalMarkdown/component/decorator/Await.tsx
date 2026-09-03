import type { AwaitDecoratorProps } from '@conation/lexical-core';
import type { Component } from 'solid-js';

export const Await: Component<AwaitDecoratorProps> = (props) => {
  return (
    <span
      class="animate-pulse text-current/50 select-none bg-current/5 rounded-xs"
      inert
      data-await-id={props.awaitId}
    >
      {props.text ?? t('editor.await.waiting')}
    </span>
  );
};

import { t } from '@app/lib/i18n';

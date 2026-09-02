import { ConationMark } from '@app/components/brand';
import { cn } from '@ui';
import { createSignal, onMount } from 'solid-js';

export function LoadingSpinner(props: { class?: string }) {
  return (
    <div class={cn('text-accent size-48 p-14', props.class)}>
      <ConationMark
        class="size-full animate-pulse motion-reduce:animate-none"
        alt=""
      />
    </div>
  );
}

export function LoadingPanel() {
  const [showSpinner, setShowSpinner] = createSignal(false);

  onMount(() => {
    const timeoutId = setTimeout(() => {
      setShowSpinner(true);
    }, 500);

    return () => clearTimeout(timeoutId);
  });

  return (
    <div
      class="flex flex-col size-full justify-center items-center relative font-mono"
      classList={{
        'opacity-100': showSpinner(),
        'opacity-0': !showSpinner(),
      }}
    >
      <LoadingSpinner />
    </div>
  );
}

import { t } from '@app/lib/i18n';
import { type Accessor, createSignal, onCleanup, onMount } from 'solid-js';

function composerTips(canChooseAgent: boolean) {
  const shared = [
    t('agents.composer.tips.connectApps'),
    t('agents.composer.tips.mention'),
  ];
  return canChooseAgent
    ? [
        shared[0],
        t('agents.composer.tips.typeSkill'),
        shared[1],
        t('agents.composer.tips.chooseAgent'),
      ]
    : [shared[0], t('agents.composer.tips.referenceSkill'), shared[1]];
}

/** Cycle one hint at a time, pausing while the user has a draft. */
export function createChatComposerTip(
  empty: Accessor<boolean>,
  canChooseAgent = true
) {
  const [index, setIndex] = createSignal(0);
  onMount(() => {
    const interval = setInterval(() => {
      if (empty()) {
        setIndex(
          (current) => (current + 1) % composerTips(canChooseAgent).length
        );
      }
    }, 6000);
    onCleanup(() => clearInterval(interval));
  });
  return () => composerTips(canChooseAgent)[index()];
}

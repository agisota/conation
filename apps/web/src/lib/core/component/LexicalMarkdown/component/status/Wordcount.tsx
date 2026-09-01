import { formatNumber, t } from '@app/lib/i18n';
import {
  createContext,
  type JSX,
  type ParentProps,
  Show,
  useContext,
} from 'solid-js';
import type { Store } from 'solid-js/store';
import type { WordcountStats } from '../../plugins';

type WordcountContextValue = {
  stats: Store<WordcountStats>;
};

const WordcountContext = createContext<WordcountContextValue>();

function useWordcountContext(): WordcountContextValue {
  const ctx = useContext(WordcountContext);
  if (!ctx) {
    throw new Error(
      'Wordcount compound components must be used within <Wordcount.Root>'
    );
  }
  return ctx;
}

function Root(props: ParentProps<{ stats: Store<WordcountStats> }>) {
  return (
    <WordcountContext.Provider value={{ stats: props.stats }}>
      {props.children}
    </WordcountContext.Provider>
  );
}

/**
 * Renders the word count, showing selected/total when text is selected.
 */
function Words(props: { class?: string }): JSX.Element {
  const { stats } = useWordcountContext();

  return (
    <span class={props.class}>
      <Show
        when={stats.selectedWords !== null}
        fallback={<span>{formatNumber(stats.totalWords)}</span>}
      >
        <span>{formatNumber(stats.selectedWords ?? 0)}</span>
        <span class="opacity-50"> / {formatNumber(stats.totalWords)}</span>
      </Show>
    </span>
  );
}

/**
 * Renders the character count, showing selected/total when text is selected.
 */
function Characters(props: { class?: string }): JSX.Element {
  const { stats } = useWordcountContext();

  return (
    <span class={props.class}>
      <Show
        when={stats.selectedCharacters !== null}
        fallback={<span>{formatNumber(stats.totalCharacters)}</span>}
      >
        <span>{formatNumber(stats.selectedCharacters ?? 0)}</span>
        <span class="opacity-50"> / {formatNumber(stats.totalCharacters)}</span>
      </Show>
    </span>
  );
}

/**
 * Simple word count value (selected if available, otherwise total).
 */
function SimpleWordCount(props: { class?: string }): JSX.Element {
  const { stats } = useWordcountContext();
  const count = () =>
    stats.selectedWords !== null ? stats.selectedWords : stats.totalWords;

  return <span class={props.class}>{formatNumber(count())}</span>;
}

/**
 * Renders "word" or "words" based on count (for labels).
 */
function WordLabel(): JSX.Element {
  const { stats } = useWordcountContext();
  const count = () =>
    stats.selectedWords !== null ? stats.selectedWords : stats.totalWords;

  return <>{t('editor.wordcount.words', { count: count() })}</>;
}

/**
 * Simple character count value (selected if available, otherwise total).
 */
function SimpleCharacterCount(props: { class?: string }): JSX.Element {
  const { stats } = useWordcountContext();
  const count = () =>
    stats.selectedCharacters !== null
      ? stats.selectedCharacters
      : stats.totalCharacters;

  return <span class={props.class}>{formatNumber(count())}</span>;
}

/**
 * Renders "character" or "characters" based on count (for labels).
 */
function CharacterLabel(): JSX.Element {
  const { stats } = useWordcountContext();
  const count = () =>
    stats.selectedCharacters !== null
      ? stats.selectedCharacters
      : stats.totalCharacters;

  return <>{t('editor.wordcount.characters', { count: count() })}</>;
}

export const Wordcount = {
  Root,
  Words,
  Characters,
  SimpleWordCount,
  WordLabel,
  SimpleCharacterCount,
  CharacterLabel,
};

import { getDateLocale } from '@core/i18n';
import { debounce } from '@solid-primitives/scheduled';
import {
  $getRoot,
  $getSelection,
  type LexicalEditor,
  type UpdateListener,
} from 'lexical';
import { createStore, type SetStoreFunction } from 'solid-js/store';

export type WordcountStats = {
  totalWords: number;
  totalCharacters: number;
  selectedWords: number | null;
  selectedCharacters: number | null;
};

export function createWordcountStatsStore() {
  return createStore<WordcountStats>({
    totalWords: 0,
    totalCharacters: 0,
    selectedWords: null,
    selectedCharacters: null,
  });
}

type WordcountPluginProps = {
  setStore: SetStoreFunction<WordcountStats>;
  debounceTime: number;
};

function countSegmentedWords(text: string, segmenter: Intl.Segmenter): number {
  let wordCount = 0;
  for (const segment of segmenter.segment(text)) {
    if (segment.isWordLike) wordCount++;
  }
  return wordCount;
}

function registerWordcountPlugin(
  editor: LexicalEditor,
  props: WordcountPluginProps
) {
  const countWords: UpdateListener = ({ editorState }) => {
    const [all, selected] = editorState.read(() => {
      const root = $getRoot();
      let childText = root.getChildren().map((child) => child.getTextContent());
      return [childText.join('\n'), $getSelection()?.getTextContent() ?? null];
    });

    const segmenter = new Intl.Segmenter(getDateLocale(), {
      granularity: 'word',
    });

    props.setStore('totalWords', countSegmentedWords(all, segmenter));
    props.setStore('totalCharacters', all.length);

    if (selected) {
      props.setStore('selectedWords', countSegmentedWords(selected, segmenter));
      props.setStore('selectedCharacters', selected.length);
    } else {
      props.setStore('selectedWords', null);
      props.setStore('selectedCharacters', null);
    }
  };

  const deboundecCountWords = debounce(countWords, props.debounceTime);
  return editor.registerUpdateListener(deboundecCountWords);
}
export function wordcountPlugin(props: WordcountPluginProps) {
  return (editor: LexicalEditor) => registerWordcountPlugin(editor, props);
}

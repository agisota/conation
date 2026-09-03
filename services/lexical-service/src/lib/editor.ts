import { createHeadlessEditor } from '@lexical/headless';
import { SupportedNodeTypes } from '@conation/lexical-core';

export function createEditor() {
  const editor = createHeadlessEditor({
    nodes: SupportedNodeTypes,
  });

  return editor;
}

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { AiGenerationWidget } from './AiGenerationWidget';

export interface AiGenerationOptions {
  // Reserved for future configuration (e.g., custom system prompts)
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiGeneration: {
      insertAiWidget: (attrs: {
        prompt: string;
        length: string;
        ownerId: string;
        webSearch?: boolean;
      }) => ReturnType;
      removeAiWidget: () => ReturnType;
    };
  }
}

export const AiGenerationExtension = Node.create<AiGenerationOptions>({
  name: 'aiGeneration',

  group: 'block',

  atom: true,

  selectable: true,

  draggable: false,

  addAttributes() {
    return {
      prompt: { default: '' },
      status: { default: 'loading' }, // loading | streaming | complete | error
      content: { default: '' },
      errorMessage: { default: null },
      ownerId: { default: '' },
      length: { default: 'medium' },
      webSearch: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-ai-generation]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-ai-generation': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AiGenerationWidget);
  },

  addCommands() {
    return {
      insertAiWidget:
        (attrs) =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: {
                prompt: attrs.prompt,
                length: attrs.length,
                ownerId: attrs.ownerId,
                webSearch: attrs.webSearch ?? false,
                status: 'loading',
                content: '',
                errorMessage: null,
              },
            })
            .run();
        },
      removeAiWidget:
        () =>
        ({ state, dispatch }) => {
          if (!dispatch) return true;
          const { selection } = state;
          const node = state.doc.nodeAt(selection.from);
          if (node?.type.name === this.name) {
            const tr = state.tr.delete(selection.from, selection.from + node.nodeSize);
            dispatch(tr);
            return true;
          }
          // Find the nearest AI widget
          let found = false;
          state.doc.descendants((node, pos) => {
            if (found) return false;
            if (node.type.name === this.name) {
              const tr = state.tr.delete(pos, pos + node.nodeSize);
              dispatch(tr);
              found = true;
              return false;
            }
          });
          return found;
        },
    };
  },
});

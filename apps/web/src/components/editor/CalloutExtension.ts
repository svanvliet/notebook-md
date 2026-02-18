import { Node, mergeAttributes } from '@tiptap/core';

export interface CalloutOptions {
  types: string[];
  HTMLAttributes: Record<string, string>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs?: { type?: string }) => ReturnType;
      toggleCallout: (attrs?: { type?: string }) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

const CALLOUT_ICONS: Record<string, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  tip: '💡',
  note: '📝',
};

export const Callout = Node.create<CalloutOptions>({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addOptions() {
    return {
      types: ['info', 'warning', 'tip', 'note'],
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      type: {
        default: 'info',
        parseHTML: (element) => element.getAttribute('data-callout-type') || 'info',
        renderHTML: (attributes) => ({ 'data-callout-type': attributes.type }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const type = node.attrs.type || 'info';
    const icon = CALLOUT_ICONS[type] || CALLOUT_ICONS.info;
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-callout': '',
        'data-callout-type': type,
        class: `callout callout-${type}`,
      }),
      ['span', { class: 'callout-icon', contenteditable: 'false' }, icon],
      ['div', { class: 'callout-content' }, 0],
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) =>
          commands.wrapIn(this.name, attrs),
      toggleCallout:
        (attrs) =>
        ({ commands }) =>
          commands.toggleWrap(this.name, attrs),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});

import { Extension } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface SlashCommand {
  title: string;
  description: string;
  icon: string;
  action: (editor: Editor) => void;
}

export const slashCommands: SlashCommand[] = [
  {
    title: 'Paragraph',
    description: 'Plain text block',
    icon: '¶',
    action: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    title: 'Heading 1',
    description: 'Large heading',
    icon: 'H1',
    action: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    description: 'Medium heading',
    icon: 'H2',
    action: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    description: 'Small heading',
    icon: 'H3',
    action: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: 'Bullet List',
    description: 'Unordered list',
    icon: '•',
    action: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    title: 'Numbered List',
    description: 'Ordered list',
    icon: '1.',
    action: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    title: 'Task List',
    description: 'Checklist with checkboxes',
    icon: '☑',
    action: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    title: 'Blockquote',
    description: 'Quoted text block',
    icon: '❝',
    action: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    title: 'Code Block',
    description: 'Fenced code with syntax highlighting',
    icon: '{ }',
    action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: 'Table',
    description: 'Insert a 3×3 table',
    icon: '⊞',
    action: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: 'Horizontal Rule',
    description: 'Divider line',
    icon: '―',
    action: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    title: 'Bold',
    description: 'Bold text',
    icon: 'B',
    action: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    title: 'Italic',
    description: 'Italic text',
    icon: 'I',
    action: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    title: 'Strikethrough',
    description: 'Crossed out text',
    icon: 'S̶',
    action: (editor) => editor.chain().focus().toggleStrike().run(),
  },
  {
    title: 'Inline Code',
    description: 'Inline code snippet',
    icon: '</>',
    action: (editor) => editor.chain().focus().toggleCode().run(),
  },
  {
    title: 'Highlight',
    description: 'Highlighted text',
    icon: 'H',
    action: (editor) => editor.chain().focus().toggleHighlight().run(),
  },
  {
    title: 'Link',
    description: 'Insert a hyperlink',
    icon: '🔗',
    action: (editor) => {
      const url = prompt('URL:');
      if (!url) return;
      const text = prompt('Display text (leave empty to use URL):');
      if (text) {
        editor
          .chain()
          .focus()
          .insertContent(`<a href="${url}" rel="noopener noreferrer nofollow" target="_blank">${text}</a>`)
          .run();
      } else {
        editor
          .chain()
          .focus()
          .insertContent(`<a href="${url}" rel="noopener noreferrer nofollow" target="_blank">${url}</a>`)
          .run();
      }
    },
  },
  {
    title: 'Image',
    description: 'Insert an image from URL or file',
    icon: '🖼',
    action: (editor) => {
      window.dispatchEvent(new CustomEvent('notebook-media-insert', { detail: { type: 'image', editor } }));
    },
  },
  {
    title: 'Video',
    description: 'Insert a video from URL or file',
    icon: '🎬',
    action: (editor) => {
      window.dispatchEvent(new CustomEvent('notebook-media-insert', { detail: { type: 'video', editor } }));
    },
  },
  {
    title: 'Math Block',
    description: 'LaTeX math expression',
    icon: '∑',
    action: (editor) => {
      editor.chain().focus().insertContent('$E = mc^2$').run();
    },
  },
  {
    title: 'Callout - Info',
    description: 'Informational callout box',
    icon: 'ℹ️',
    action: (editor) => editor.chain().focus().setCallout({ type: 'info' }).run(),
  },
  {
    title: 'Callout - Warning',
    description: 'Warning callout box',
    icon: '⚠️',
    action: (editor) => editor.chain().focus().setCallout({ type: 'warning' }).run(),
  },
  {
    title: 'Callout - Tip',
    description: 'Helpful tip callout box',
    icon: '💡',
    action: (editor) => editor.chain().focus().setCallout({ type: 'tip' }).run(),
  },
  {
    title: 'Callout - Note',
    description: 'Note callout box',
    icon: '📝',
    action: (editor) => editor.chain().focus().setCallout({ type: 'note' }).run(),
  },
];

// The slash command UI is rendered via React portal (see SlashCommandMenu).
// This extension tracks when "/" is typed at the start of a line and exposes
// the menu position + query via a plugin key that React components can read.

export const slashCommandPluginKey = new PluginKey('slashCommand');

interface SlashCommandState {
  active: boolean;
  query: string;
  range: { from: number; to: number } | null;
  decorationSet: DecorationSet;
}

export const SlashCommandExtension = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin<SlashCommandState>({
        key: slashCommandPluginKey,
        state: {
          init() {
            return { active: false, query: '', range: null, decorationSet: DecorationSet.empty };
          },
          apply(tr, prev, _oldState, newState) {
            const { selection } = newState;
            const { $from } = selection;

            // Only show in empty or beginning-of-line contexts
            if (!selection.empty) {
              return { active: false, query: '', range: null, decorationSet: DecorationSet.empty };
            }

            const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
            const slashMatch = textBefore.match(/\/([a-zA-Z0-9 ]*)$/);

            if (slashMatch) {
              const query = slashMatch[1];
              const from = $from.pos - query.length - 1; // -1 for the slash
              const to = $from.pos;
              const decorations = [
                Decoration.inline(from, to, { class: 'slash-command-active' }),
              ];
              return {
                active: true,
                query,
                range: { from, to },
                decorationSet: DecorationSet.create(newState.doc, decorations),
              };
            }

            return { active: false, query: '', range: null, decorationSet: DecorationSet.empty };
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)?.decorationSet ?? DecorationSet.empty;
          },
          handleKeyDown(_view, event) {
            const state = slashCommandPluginKey.getState(_view.state);
            if (!state?.active) return false;

            if (event.key === 'Escape') {
              // Remove the slash command text and close
              if (state.range) {
                editor.commands.deleteRange(state.range);
              }
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});

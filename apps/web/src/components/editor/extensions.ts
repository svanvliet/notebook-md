import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { ImageView } from './ImageView';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Table } from '@tiptap/extension-table';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { CodeBlockView } from './CodeBlockView';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Typography from '@tiptap/extension-typography';
import TextAlign from '@tiptap/extension-text-align';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Mathematics } from '@tiptap/extension-mathematics';
import 'katex/dist/katex.min.css';
import { Callout } from './CalloutExtension';
import { createLowlight } from 'lowlight';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import './CollaboratorCursors.css';

// Import common languages for code block highlighting
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import java from 'highlight.js/lib/languages/java';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';

const lowlight = createLowlight();
lowlight.register('javascript', javascript);
lowlight.register('js', javascript);
lowlight.register('typescript', typescript);
lowlight.register('ts', typescript);
lowlight.register('python', python);
lowlight.register('py', python);
lowlight.register('css', css);
lowlight.register('json', json);
lowlight.register('markdown', markdown);
lowlight.register('md', markdown);
lowlight.register('bash', bash);
lowlight.register('shell', bash);
lowlight.register('sh', bash);
lowlight.register('html', xml);
lowlight.register('xml', xml);
lowlight.register('yaml', yaml);
lowlight.register('yml', yaml);
lowlight.register('sql', sql);
lowlight.register('java', java);
lowlight.register('csharp', csharp);
lowlight.register('cs', csharp);
lowlight.register('go', go);
lowlight.register('rust', rust);
lowlight.register('rs', rust);
lowlight.register('ruby', ruby);
lowlight.register('rb', ruby);
lowlight.register('php', php);

export interface CollabOptions {
  provider: HocuspocusProvider;
  user: { name: string; color: string };
}

export function getEditorExtensions(placeholder?: string, collab?: CollabOptions) {
  const extensions = [
    StarterKit.configure({
      // We use CodeBlockLowlight instead of the default code block
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      // We configure Link and Underline separately with custom options
      link: false,
      underline: false,
      // When collaborative, disable built-in history (Yjs has its own undo manager)
      history: collab ? false : undefined,
    }),
    Placeholder.configure({
      placeholder: placeholder ?? 'Start writing…',
    }),
    Underline,
    Highlight.configure({ multicolor: true }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: {
        rel: 'noopener noreferrer nofollow',
      },
    }).extend({
      // Only set target="_blank" for absolute URLs; relative/.md/app links stay in-app
      renderHTML({ HTMLAttributes }) {
        const href = HTMLAttributes.href || '';
        const isAbsolute = /^[a-z]+:/i.test(href);
        const { target: _existingTarget, ...rest } = HTMLAttributes;
        return ['a', {
          ...rest,
          ...(isAbsolute ? { target: '_blank' } : {}),
        }, 0];
      },
    }),
    Image.configure({
      inline: true,
      allowBase64: true,
    }).extend({
      addNodeView() {
        return ReactNodeViewRenderer(ImageView);
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }).extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockView);
      },
    }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Typography.configure({
      openDoubleQuote: false,
      closeDoubleQuote: false,
      openSingleQuote: false,
      closeSingleQuote: false,
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Superscript,
    Subscript,
    TextStyle,
    Color,
    Mathematics.configure({
      katexOptions: { throwOnError: false },
    }),
    Callout,
  ];

  // Add collaboration extensions when in collaborative mode
  if (collab) {
    extensions.push(
      Collaboration.configure({
        document: collab.provider.document,
      }),
      CollaborationCursor.configure({
        provider: collab.provider,
        user: collab.user,
      }),
    );
  }

  return extensions;
}

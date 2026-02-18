import { useEditor, EditorContent } from '@tiptap/react';
import { useCallback, useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { getEditorExtensions } from './extensions';
import { EditorToolbar } from './EditorToolbar';
import { SlashCommandMenu } from './SlashCommandMenu';
import { SlashCommandExtension } from './SlashCommands';
import { htmlToMarkdown, markdownToHtml } from './markdownConverter';
import './editor.css';

interface MarkdownEditorProps {
  content: string;
  onChange: (html: string) => void;
  onWordCountChange?: (words: number, chars: number) => void;
}

export function MarkdownEditor({ content, onChange, onWordCountChange }: MarkdownEditorProps) {
  const [rawMode, setRawMode] = useState(false);
  const [rawContent, setRawContent] = useState('');

  const extensions = [...getEditorExtensions(), SlashCommandExtension];

  const editor = useEditor({
    extensions,
    content: DOMPurify.sanitize(content),
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert max-w-none focus:outline-none min-h-[200px] px-8 py-6',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);

      // Word/char counts
      const text = editor.state.doc.textContent;
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;
      onWordCountChange?.(words, chars);
    },
  });

  // Sync content from outside (e.g., when switching tabs)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(DOMPurify.sanitize(content));
    }
    // Only trigger when content prop changes, not when editor types
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  // Keyboard shortcut: Cmd/Ctrl+Shift+M for raw toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'm') {
        e.preventDefault();
        toggleRawMode();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });

  const toggleRawMode = useCallback(() => {
    if (!editor) return;

    if (!rawMode) {
      // Switching to raw: convert HTML to Markdown
      setRawContent(htmlToMarkdown(editor.getHTML()));
    } else {
      // Switching back to WYSIWYG: convert Markdown to HTML and load
      const html = DOMPurify.sanitize(markdownToHtml(rawContent));
      editor.commands.setContent(html);
      onChange(editor.getHTML());
    }
    setRawMode(!rawMode);
  }, [editor, rawMode, rawContent, onChange]);

  // Update word count on initial load
  useEffect(() => {
    if (editor) {
      const text = editor.state.doc.textContent;
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      onWordCountChange?.(words, text.length);
    }
  }, [editor, onWordCountChange]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="border-b border-gray-200 dark:border-gray-800 px-3 py-1.5 flex items-center justify-between bg-white dark:bg-gray-950 shrink-0">
        <EditorToolbar editor={editor} />
        <button
          onClick={toggleRawMode}
          className={`ml-2 px-2 py-1 text-xs rounded transition-colors shrink-0 ${
            rawMode
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
          title="Toggle raw Markdown (⌘⇧M)"
        >
          {'</>'}
        </button>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-auto">
        {rawMode ? (
          <textarea
            value={rawContent}
            onChange={(e) => setRawContent(e.target.value)}
            className="w-full h-full resize-none font-mono text-sm p-6 bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 focus:outline-none"
            spellCheck={false}
          />
        ) : (
          <div className="relative editor-wrapper">
            <EditorContent editor={editor} />
            <SlashCommandMenu editor={editor} />
          </div>
        )}
      </div>
    </div>
  );
}

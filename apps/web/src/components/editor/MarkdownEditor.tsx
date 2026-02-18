import { useEditor, EditorContent } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { getEditorExtensions } from './extensions';
import { EditorToolbar } from './EditorToolbar';
import { SlashCommandMenu } from './SlashCommandMenu';
import { SlashCommandExtension } from './SlashCommands';
import { EditorContextMenu } from './EditorContextMenu';
import { TableFloatingToolbar } from './TableFloatingToolbar';
import { htmlToMarkdown, markdownToHtml } from './markdownConverter';
import './editor.css';

// Allow table-related attributes and elements that Tiptap generates
function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['colgroup', 'col'],
    ADD_ATTR: ['colspan', 'rowspan', 'style', 'data-type', 'data-checked'],
  }) as string;
}

interface MarkdownEditorProps {
  content: string;
  onChange: (html: string) => void;
  onWordCountChange?: (words: number, chars: number) => void;
}

export function MarkdownEditor({ content, onChange, onWordCountChange }: MarkdownEditorProps) {
  const [rawMode, setRawMode] = useState(false);
  const [rawContent, setRawContent] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  const extensions = [...getEditorExtensions(), SlashCommandExtension];

  const editor = useEditor({
    extensions,
    content: sanitize(content),
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
      editor.commands.setContent(sanitize(content));
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
      const html = sanitize(markdownToHtml(rawContent));
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

  // Right-click context menu handler
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!editor || !editor.view) return;
      const target = e.target as HTMLElement;
      const isLink = !!target.closest('a');
      const isTable = !!target.closest('table');
      if (isLink || isTable) {
        e.preventDefault();
        // Position cursor at the right-click location so editor knows context
        const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
        if (pos) {
          editor.chain().focus().setTextSelection(pos.pos).run();
        }
        setContextMenu({ x: e.clientX, y: e.clientY });
      }
    },
    [editor],
  );

  // Close context menu on outside click or scroll
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="border-b border-gray-200 dark:border-gray-800 px-3 py-1.5 flex items-center justify-between bg-white dark:bg-gray-950 shrink-0">
        <EditorToolbar editor={editor} />
        <button
          onClick={toggleRawMode}
          className={`ml-2 px-1.5 py-1 rounded transition-colors shrink-0 ${
            rawMode
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
          title="Toggle raw Markdown (⌘⇧M)"
        >
          <svg className="w-5 h-3.5" viewBox="0 0 208 128" fill="currentColor">
            <rect x="5" y="5" width="198" height="118" rx="15" fill="none" stroke="currentColor" strokeWidth="10"/>
            <path d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0-30-33h20V30h20v35h20z"/>
          </svg>
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
          <div
            ref={editorWrapperRef}
            className="relative editor-wrapper"
            onContextMenu={handleContextMenu}
          >
            <EditorContent editor={editor} />
            <SlashCommandMenu editor={editor} />
            <TableFloatingToolbar editor={editor} />
            {contextMenu && editor && (
              <EditorContextMenu
                editor={editor}
                x={contextMenu.x}
                y={contextMenu.y}
                onClose={() => setContextMenu(null)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

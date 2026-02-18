import { Editor } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { useCallback, useState } from 'react';

interface EditorToolbarProps {
  editor: Editor | null;
}

// Heading level selector
function HeadingSelector({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const currentLevel = [1, 2, 3, 4, 5, 6].find((level) =>
    editor.isActive('heading', { level }),
  );

  return (
    <select
      value={currentLevel ?? 0}
      onChange={(e) => {
        const level = Number(e.target.value);
        if (level === 0) {
          editor.chain().focus().setParagraph().run();
        } else {
          editor
            .chain()
            .focus()
            .toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
            .run();
        }
      }}
      className="h-7 px-1.5 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
      title={t('editor.toolbar.heading')}
    >
      <option value={0}>{t('editor.toolbar.paragraph')}</option>
      {[1, 2, 3, 4, 5, 6].map((level) => (
        <option key={level} value={level}>
          H{level}
        </option>
      ))}
    </select>
  );
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, isActive, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded text-xs font-medium transition-colors ${
        isActive
          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      title={title}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />;
}

// Link insertion modal
function LinkInput({
  onSubmit,
  onCancel,
  initialUrl,
}: {
  onSubmit: (url: string) => void;
  onCancel: () => void;
  initialUrl?: string;
}) {
  const [url, setUrl] = useState(initialUrl ?? '');
  return (
    <div className="absolute top-full left-0 mt-1 flex items-center gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 z-50">
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://..."
        className="h-7 px-2 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 w-56 focus:outline-none focus:ring-1 focus:ring-blue-500"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(url);
          if (e.key === 'Escape') onCancel();
        }}
      />
      <button
        onClick={() => onSubmit(url)}
        className="h-7 px-2 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
      >
        OK
      </button>
      <button
        onClick={onCancel}
        className="h-7 px-2 text-xs rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
      >
        ✕
      </button>
    </div>
  );
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const { t } = useTranslation();
  const [showLinkInput, setShowLinkInput] = useState(false);

  const setLink = useCallback(
    (url: string) => {
      if (!editor) return;
      if (url === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
      } else {
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
      }
      setShowLinkInput(false);
    },
    [editor],
  );

  if (!editor) return null;

  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      <HeadingSelector editor={editor} />

      <Divider />

      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title={`${t('editor.toolbar.bold')} (⌘B)`}
      >
        <strong>B</strong>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title={`${t('editor.toolbar.italic')} (⌘I)`}
      >
        <em>I</em>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        title={`${t('editor.toolbar.underline')} (⌘U)`}
      >
        <span className="underline">U</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        title={t('editor.toolbar.strikethrough')}
      >
        <s>S</s>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive('code')}
        title={`${t('editor.toolbar.inlineCode')} (⌘E)`}
      >
        <span className="font-mono">&lt;/&gt;</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        isActive={editor.isActive('highlight')}
        title={t('editor.toolbar.highlight')}
      >
        <span className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">H</span>
      </ToolbarButton>

      <Divider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title={t('editor.toolbar.bulletList')}
      >
        •≡
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title={t('editor.toolbar.orderedList')}
      >
        1.
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        isActive={editor.isActive('taskList')}
        title={t('editor.toolbar.taskList')}
      >
        ☑
      </ToolbarButton>

      <Divider />

      {/* Block elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title={t('editor.toolbar.blockquote')}
      >
        ❝
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive('codeBlock')}
        title={t('editor.toolbar.codeBlock')}
      >
        {'{ }'}
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title={t('editor.toolbar.horizontalRule')}
      >
        ―
      </ToolbarButton>

      <ToolbarButton
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
        title={t('editor.toolbar.table')}
      >
        ⊞
      </ToolbarButton>

      <Divider />

      {/* Link */}
      <div className="relative">
        <ToolbarButton
          onClick={() => {
            if (editor.isActive('link')) {
              editor.chain().focus().unsetLink().run();
            } else {
              setShowLinkInput(true);
            }
          }}
          isActive={editor.isActive('link')}
          title={`${t('editor.toolbar.link')} (⌘K)`}
        >
          🔗
        </ToolbarButton>
        {showLinkInput && (
          <LinkInput
            onSubmit={setLink}
            onCancel={() => setShowLinkInput(false)}
            initialUrl={editor.getAttributes('link').href}
          />
        )}
      </div>

      <Divider />

      {/* Undo / Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title={`${t('editor.toolbar.undo')} (⌘Z)`}
      >
        ↩
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title={`${t('editor.toolbar.redo')} (⌘⇧Z)`}
      >
        ↪
      </ToolbarButton>
    </div>
  );
}

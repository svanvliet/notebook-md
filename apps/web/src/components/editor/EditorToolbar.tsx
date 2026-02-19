import { Editor } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { useCallback, useState } from 'react';
import { useToast } from '../../hooks/useToast';

interface EditorToolbarProps {
  editor: Editor | null;
}

// --- SVG Icons (4x4 viewBox, matching table toolbar style) ---
const ic = 'w-4 h-4';

function BoldIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 4h8a4 4 0 0 1 0 8H6zm0 8h9a4 4 0 0 1 0 8H6z"/></svg>;
}
function ItalicIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>;
}
function UnderlineIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3v7a6 6 0 0 0 12 0V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>;
}
function StrikethroughIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4c-.5-1.5-2.5-3-5-3-3 0-5 2-5 4.5 0 2 1.5 3.5 5 4.5"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M13 14c1.5.5 3 1.5 3 3.5 0 2.5-2 4.5-5 4.5s-4.5-1.5-5-3"/></svg>;
}
function CodeIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
}
function HighlightIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/><path d="M3 20h4" strokeWidth="3"/></svg>;
}
function BulletListIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="5" cy="6" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="5" cy="18" r="1" fill="currentColor"/></svg>;
}
function OrderedListIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="3" y="8" fontSize="7" fill="currentColor" fontFamily="sans-serif" fontWeight="600">1</text><text x="3" y="14" fontSize="7" fill="currentColor" fontFamily="sans-serif" fontWeight="600">2</text><text x="3" y="20" fontSize="7" fill="currentColor" fontFamily="sans-serif" fontWeight="600">3</text></svg>;
}
function TaskListIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="6" height="6" rx="1"/><polyline points="5 8 6.5 9.5 9 6.5" strokeWidth="1.5"/><line x1="13" y1="8" x2="21" y2="8"/><rect x="3" y="14" width="6" height="6" rx="1"/><line x1="13" y1="17" x2="21" y2="17"/></svg>;
}
function BlockquoteIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="currentColor"><path d="M10 8c0-2.2-1.8-4-4-4S2 5.8 2 8c0 1.8 1.2 3.4 2.9 3.9C4.5 14.6 2.5 16 2.5 16s4.5-.5 6.5-4.5c.6-1.1 1-2.3 1-3.5zm12 0c0-2.2-1.8-4-4-4s-4 1.8-4 4c0 1.8 1.2 3.4 2.9 3.9C16.5 14.6 14.5 16 14.5 16s4.5-.5 6.5-4.5c.6-1.1 1-2.3 1-3.5z"/></svg>;
}
function CodeBlockIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="8 8 4 12 8 16"/><polyline points="16 8 20 12 16 16"/></svg>;
}
function HrIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="2" y1="12" x2="22" y2="12"/></svg>;
}
function TableIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>;
}
function LinkIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>;
}
function UndoIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>;
}
function RedoIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>;
}

function PrintIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>;
}

function ImageIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
}

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB
const SUPPORTED_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'svg', 'gif', 'webp']);
const SUPPORTED_VIDEO_EXTS = new Set(['mp4', 'webm']);

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

// Link insertion modal with URL + display text
function LinkModal({
  onSubmit,
  onCancel,
  initialUrl,
  initialText,
}: {
  onSubmit: (url: string, text: string) => void;
  onCancel: () => void;
  initialUrl?: string;
  initialText?: string;
}) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [text, setText] = useState(initialText ?? '');
  return (
    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 z-50 w-72">
      <div className="space-y-2">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Display text</label>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Link text"
            className="w-full h-8 px-2.5 text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-full h-8 px-2.5 text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && url) onSubmit(url, text);
              if (e.key === 'Escape') onCancel();
            }}
          />
        </div>
        <div className="flex justify-end gap-1.5 pt-1">
          <button
            onClick={onCancel}
            className="h-7 px-3 text-xs rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={() => url && onSubmit(url, text)}
            disabled={!url}
            className="h-7 px-3 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// Media insertion dropdown (URL or file upload)
function MediaInsertMenu({
  onInsertUrl,
  onUploadFile,
  onCancel,
}: {
  onInsertUrl: (url: string, alt: string) => void;
  onUploadFile: (file: File) => void;
  onCancel: () => void;
}) {
  const { addToast } = useToast();
  const [mode, setMode] = useState<'choose' | 'url'>('choose');
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');

  if (mode === 'url') {
    return (
      <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 z-50 w-72">
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Image/Video URL</label>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..."
              className="w-full h-8 px-2.5 text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && url) onInsertUrl(url, alt); if (e.key === 'Escape') onCancel(); }} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Alt text (optional)</label>
            <input type="text" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Description"
              className="w-full h-8 px-2.5 text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={(e) => { if (e.key === 'Enter' && url) onInsertUrl(url, alt); if (e.key === 'Escape') onCancel(); }} />
          </div>
          <div className="flex justify-end gap-1.5 pt-1">
            <button onClick={onCancel} className="h-7 px-3 text-xs rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400">Cancel</button>
            <button onClick={() => url && onInsertUrl(url, alt)} disabled={!url} className="h-7 px-3 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">Insert</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 w-48">
      <button onClick={() => setMode('url')}
        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
        From URL…
      </button>
      <button onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = [...SUPPORTED_IMAGE_EXTS, ...SUPPORTED_VIDEO_EXTS].map((e) => `.${e}`).join(',');
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            if (file.size > MAX_UPLOAD_SIZE) {
              addToast(`File too large. Maximum size is 10 MB (selected: ${(file.size / 1024 / 1024).toFixed(1)} MB).`, 'warning');
              return;
            }
            onUploadFile(file);
          };
          input.click();
        }}
        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
        Upload file…
      </button>
    </div>
  );
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const { t } = useTranslation();
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [showMediaMenu, setShowMediaMenu] = useState(false);

  const insertMedia = useCallback(
    (url: string, alt: string) => {
      if (!editor) return;
      const ext = url.split('.').pop()?.toLowerCase().split('?')[0] ?? '';
      if (SUPPORTED_VIDEO_EXTS.has(ext)) {
        editor.chain().focus().insertContent(
          `<video src="${url}" controls style="max-width:100%"></video>`,
        ).run();
      } else {
        editor.chain().focus().setImage({ src: url, alt: alt || undefined }).run();
      }
      setShowMediaMenu(false);
    },
    [editor],
  );

  const uploadMedia = useCallback(
    (file: File) => {
      if (!editor) return;
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        if (SUPPORTED_VIDEO_EXTS.has(ext)) {
          editor.chain().focus().insertContent(
            `<video src="${base64}" controls style="max-width:100%"></video>`,
          ).run();
        } else {
          editor.chain().focus().setImage({ src: base64, alt: file.name }).run();
        }
      };
      reader.readAsDataURL(file);
      setShowMediaMenu(false);
    },
    [editor],
  );

  const setLink = useCallback(
    (url: string, text: string) => {
      if (!editor) return;
      if (url === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
      } else {
        const { from, to } = editor.state.selection;
        const hasSelection = from !== to;

        if (text && !hasSelection) {
          // Insert new text with link
          editor
            .chain()
            .focus()
            .insertContent(`<a href="${url}" rel="noopener noreferrer nofollow" target="_blank">${text}</a>`)
            .run();
        } else {
          // Apply link to existing selection or update existing link
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        }
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
        <BoldIcon />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title={`${t('editor.toolbar.italic')} (⌘I)`}
      >
        <ItalicIcon />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        title={`${t('editor.toolbar.underline')} (⌘U)`}
      >
        <UnderlineIcon />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        title={t('editor.toolbar.strikethrough')}
      >
        <StrikethroughIcon />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive('code')}
        title={`${t('editor.toolbar.inlineCode')} (⌘E)`}
      >
        <CodeIcon />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        isActive={editor.isActive('highlight')}
        title={t('editor.toolbar.highlight')}
      >
        <HighlightIcon />
      </ToolbarButton>

      <Divider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title={t('editor.toolbar.bulletList')}
      >
        <BulletListIcon />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title={t('editor.toolbar.orderedList')}
      >
        <OrderedListIcon />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        isActive={editor.isActive('taskList')}
        title={t('editor.toolbar.taskList')}
      >
        <TaskListIcon />
      </ToolbarButton>

      <Divider />

      {/* Block elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title={t('editor.toolbar.blockquote')}
      >
        <BlockquoteIcon />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive('codeBlock')}
        title={t('editor.toolbar.codeBlock')}
      >
        <CodeBlockIcon />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title={t('editor.toolbar.horizontalRule')}
      >
        <HrIcon />
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
        <TableIcon />
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
          <LinkIcon />
        </ToolbarButton>
        {showLinkInput && (
          <LinkModal
            onSubmit={setLink}
            onCancel={() => setShowLinkInput(false)}
            initialUrl={editor.getAttributes('link').href}
            initialText={editor.state.doc.textBetween(
              editor.state.selection.from,
              editor.state.selection.to,
              '',
            )}
          />
        )}
      </div>

      {/* Media insert */}
      <div className="relative">
        <ToolbarButton
          onClick={() => setShowMediaMenu(!showMediaMenu)}
          title={t('editor.toolbar.insertMedia', 'Insert image/video')}
        >
          <ImageIcon />
        </ToolbarButton>
        {showMediaMenu && (
          <MediaInsertMenu
            onInsertUrl={insertMedia}
            onUploadFile={uploadMedia}
            onCancel={() => setShowMediaMenu(false)}
          />
        )}
      </div>

      <Divider />
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title={`${t('editor.toolbar.undo')} (⌘Z)`}
      >
        <UndoIcon />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title={`${t('editor.toolbar.redo')} (⌘⇧Z)`}
      >
        <RedoIcon />
      </ToolbarButton>

      <Divider />

      {/* Print / Export PDF */}
      <ToolbarButton
        onClick={() => window.print()}
        title={`${t('editor.toolbar.print', 'Print')} (⌘P)`}
      >
        <PrintIcon />
      </ToolbarButton>
    </div>
  );
}

import { Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';

// --- Inline SVG icons for context menu items ---
const ic = 'w-4 h-4 shrink-0';

function ArrowUpIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5m-7 7 7-7 7 7"/></svg>;
}
function ArrowDownIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14m7-7-7 7-7-7"/></svg>;
}
function ArrowLeftIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5m7-7-7 7 7 7"/></svg>;
}
function ArrowRightIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>;
}
function TrashIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
}
function EditIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
}
function ExternalLinkIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>;
}
function CopyIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
}
function UnlinkIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 7h3a5 5 0 0 1 0 10h-3m-6 0H6A5 5 0 0 1 6 7h3"/><line x1="2" y1="2" x2="22" y2="22"/></svg>;
}
function ToggleIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="16" cy="12" r="3"/></svg>;
}
function MergeSplitIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/></svg>;
}

interface EditorContextMenuProps {
  editor: Editor;
  x: number;
  y: number;
  onClose: () => void;
}

interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
}

interface MenuSection {
  title?: string;
  items: MenuItem[];
}

function LinkEditModal({
  initialUrl,
  initialText,
  onSubmit,
  onCancel,
}: {
  initialUrl: string;
  initialText: string;
  onSubmit: (url: string, text: string) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState(initialText);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-4 w-80">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Edit Link</h3>
        <div className="space-y-2.5">
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
          <div className="flex justify-end gap-2 pt-1">
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
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EditorContextMenu({ editor, x, y, onClose }: EditorContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [linkEditModal, setLinkEditModal] = useState<{ url: string; text: string } | null>(null);

  // Position the menu so it doesn't go off-screen
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menuRef.current.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  const isInTable = editor.isActive('table');
  const isOnLink = editor.isActive('link');

  const sections: MenuSection[] = [];

  // Link context menu
  if (isOnLink) {
    const attrs = editor.getAttributes('link');
    const { from, to } = editor.state.selection;
    // Get link text — expand mark range for full link text
    const linkText = editor.state.doc.textBetween(from, to, '') ||
      (() => {
        const resolvedPos = editor.state.doc.resolve(from);
        const node = resolvedPos.parent;
        return node.textContent;
      })();

    sections.push({
      items: [
        {
          label: 'Edit Link…',
          icon: <EditIcon />,
          onClick: () => {
            setLinkEditModal({ url: attrs.href || '', text: linkText });
          },
        },
        {
          label: 'Open Link',
          icon: <ExternalLinkIcon />,
          onClick: () => {
            if (attrs.href) window.open(attrs.href, '_blank', 'noopener,noreferrer');
            onClose();
          },
        },
        {
          label: 'Copy Link URL',
          icon: <CopyIcon />,
          onClick: () => {
            if (attrs.href) navigator.clipboard.writeText(attrs.href);
            onClose();
          },
        },
        {
          label: 'Remove Link',
          icon: <UnlinkIcon />,
          onClick: () => {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            onClose();
          },
          danger: true,
        },
      ],
    });
  }

  // Table context menu
  if (isInTable) {
    sections.push({
      title: 'Row',
      items: [
        {
          label: 'Insert Row Above',
          icon: <ArrowUpIcon />,
          onClick: () => {
            editor.chain().focus().addRowBefore().run();
            onClose();
          },
        },
        {
          label: 'Insert Row Below',
          icon: <ArrowDownIcon />,
          onClick: () => {
            editor.chain().focus().addRowAfter().run();
            onClose();
          },
        },
        {
          label: 'Delete Row',
          icon: <TrashIcon />,
          onClick: () => {
            editor.chain().focus().deleteRow().run();
            onClose();
          },
          danger: true,
        },
      ],
    });
    sections.push({
      title: 'Column',
      items: [
        {
          label: 'Insert Column Left',
          icon: <ArrowLeftIcon />,
          onClick: () => {
            editor.chain().focus().addColumnBefore().run();
            onClose();
          },
        },
        {
          label: 'Insert Column Right',
          icon: <ArrowRightIcon />,
          onClick: () => {
            editor.chain().focus().addColumnAfter().run();
            onClose();
          },
        },
        {
          label: 'Delete Column',
          icon: <TrashIcon />,
          onClick: () => {
            editor.chain().focus().deleteColumn().run();
            onClose();
          },
          danger: true,
        },
      ],
    });
    sections.push({
      title: 'Table',
      items: [
        {
          label: 'Toggle Header Row',
          icon: <ToggleIcon />,
          onClick: () => {
            editor.chain().focus().toggleHeaderRow().run();
            onClose();
          },
        },
        {
          label: 'Merge/Split Cells',
          icon: <MergeSplitIcon />,
          onClick: () => {
            editor.chain().focus().mergeOrSplit().run();
            onClose();
          },
        },
        {
          label: 'Delete Table',
          icon: <TrashIcon />,
          onClick: () => {
            editor.chain().focus().deleteTable().run();
            onClose();
          },
          danger: true,
        },
      ],
    });
  }

  if (sections.length === 0) {
    onClose();
    return null;
  }

  if (linkEditModal) {
    return (
      <LinkEditModal
        initialUrl={linkEditModal.url}
        initialText={linkEditModal.text}
        onSubmit={(url, text) => {
          if (text) {
            // Replace link text and URL
            editor
              .chain()
              .focus()
              .extendMarkRange('link')
              .setLink({ href: url })
              .command(({ tr, state }) => {
                const { from, to } = state.selection;
                tr.insertText(text, from, to);
                return true;
              })
              .run();
          } else {
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
          }
          setLinkEditModal(null);
          onClose();
        }}
        onCancel={() => {
          setLinkEditModal(null);
          onClose();
        }}
      />
    );
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {sections.map((section, si) => (
        <div key={si}>
          {si > 0 && <div className="border-t border-gray-100 dark:border-gray-800 my-1" />}
          {section.title && (
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {section.title}
            </div>
          )}
          {section.items.map((item, ii) => (
            <button
              key={ii}
              onClick={item.onClick}
              className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 ${
                item.danger
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {item.icon && <span className="opacity-70">{item.icon}</span>}
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-4">
                  {item.shortcut}
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

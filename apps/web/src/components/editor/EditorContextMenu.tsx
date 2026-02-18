import { Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';

interface EditorContextMenuProps {
  editor: Editor;
  x: number;
  y: number;
  onClose: () => void;
}

interface MenuItem {
  label: string;
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
          onClick: () => {
            setLinkEditModal({ url: attrs.href || '', text: linkText });
          },
        },
        {
          label: 'Open Link',
          onClick: () => {
            if (attrs.href) window.open(attrs.href, '_blank', 'noopener,noreferrer');
            onClose();
          },
        },
        {
          label: 'Copy Link URL',
          onClick: () => {
            if (attrs.href) navigator.clipboard.writeText(attrs.href);
            onClose();
          },
        },
        {
          label: 'Remove Link',
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
          onClick: () => {
            editor.chain().focus().addRowBefore().run();
            onClose();
          },
        },
        {
          label: 'Insert Row Below',
          onClick: () => {
            editor.chain().focus().addRowAfter().run();
            onClose();
          },
        },
        {
          label: 'Delete Row',
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
          onClick: () => {
            editor.chain().focus().addColumnBefore().run();
            onClose();
          },
        },
        {
          label: 'Insert Column Right',
          onClick: () => {
            editor.chain().focus().addColumnAfter().run();
            onClose();
          },
        },
        {
          label: 'Delete Column',
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
          onClick: () => {
            editor.chain().focus().toggleHeaderRow().run();
            onClose();
          },
        },
        {
          label: 'Merge/Split Cells',
          onClick: () => {
            editor.chain().focus().mergeOrSplit().run();
            onClose();
          },
        },
        {
          label: 'Delete Table',
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
              className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800 ${
                item.danger
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              <span>{item.label}</span>
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

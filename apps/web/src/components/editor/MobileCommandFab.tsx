import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Editor } from '@tiptap/react';
import { slashCommands } from './SlashCommands';

interface MobileCommandFabProps {
  editor: Editor | null;
}

export function MobileCommandFab({ editor }: MobileCommandFabProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!editor) return null;

  return (
    <div className="md:hidden fixed bottom-6 right-6 z-40" ref={menuRef}>
      {/* Command menu */}
      {open && (
        <div className="absolute bottom-16 right-0 w-64 max-h-80 overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 mb-2">
          {slashCommands.map((cmd) => (
            <button
              key={cmd.title}
              onClick={() => {
                cmd.action(editor);
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <span className="w-7 h-7 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-400 shrink-0">
                {cmd.icon}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{cmd.title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{cmd.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setOpen(!open)}
        className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center transition-colors active:scale-95"
        title={t('editor.ai.fab.title', 'Insert block')}
      >
        {open ? (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        )}
      </button>
    </div>
  );
}

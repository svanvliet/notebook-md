import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../icons/Icons';
import { NotebookTree } from '../notebook/NotebookTree';
import type { NotebookMeta, FileEntry } from '../../stores/localNotebookStore';

// Small SVG icons for the + dropdown
const ic = 'w-4 h-4 shrink-0';
function NotebookPlusIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>;
}
function FilePlusIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>;
}
function ImportIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
}

interface NotebookPaneProps {
  width: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onResizeMouseDown: (e: React.MouseEvent) => void;
  notebooks: NotebookMeta[];
  files: Record<string, FileEntry[]>;
  onCreateNotebook: () => void;
  onDeleteNotebook: (id: string) => void;
  onRenameNotebook: (id: string, name: string) => void;
  onCreateFile: (notebookId: string, parentPath: string, type: 'file' | 'folder') => void;
  onImportFile: (notebookId?: string, parentPath?: string) => void;
  onDeleteFile: (notebookId: string, path: string) => void;
  onRenameFile: (notebookId: string, path: string, newName: string) => void;
  onOpenFile: (notebookId: string, path: string) => void;
  activeFilePath: string | null;
}

export function NotebookPane({
  width,
  collapsed,
  onToggleCollapse,
  onResizeMouseDown,
  notebooks,
  files,
  onCreateNotebook,
  onDeleteNotebook,
  onRenameNotebook,
  onCreateFile,
  onImportFile,
  onDeleteFile,
  onRenameFile,
  onOpenFile,
  activeFilePath,
}: NotebookPaneProps) {
  const { t } = useTranslation();
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const plusBtnRef = useRef<HTMLButtonElement>(null);

  // Close the + dropdown on outside click
  useEffect(() => {
    if (!showPlusMenu) return;
    const handler = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node) && !plusBtnRef.current?.contains(e.target as Node)) {
        setShowPlusMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPlusMenu]);

  const firstNotebookId = notebooks.length > 0 ? notebooks[0].id : null;

  return (
    <div
      className="relative shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex flex-col select-none"
      style={{ width }}
    >
      {/* Header */}
      <div className="h-9 flex items-center px-2 border-b border-gray-200 dark:border-gray-800">
        {!collapsed && (
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider flex-1">
            Notebooks
          </span>
        )}
        {!collapsed && (
          <div className="relative">
            <button
              ref={plusBtnRef}
              onClick={() => setShowPlusMenu((v) => !v)}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors mr-1"
              title="New…"
              aria-label="New…"
            >
              <PlusIcon className="w-3.5 h-3.5" />
            </button>
            {showPlusMenu && (
              <div
                ref={plusMenuRef}
                className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 min-w-[160px]"
              >
                <button
                  onClick={() => { onCreateNotebook(); setShowPlusMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <span className="opacity-70"><NotebookPlusIcon /></span>
                  <span>{t('notebook.addNotebook')}</span>
                </button>
                {firstNotebookId && (
                  <>
                    <button
                      onClick={() => { onCreateFile(firstNotebookId, '', 'file'); setShowPlusMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <span className="opacity-70"><FilePlusIcon /></span>
                      <span>{t('notebook.newFile')}</span>
                    </button>
                    <button
                      onClick={() => { onImportFile(); setShowPlusMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <span className="opacity-70"><ImportIcon /></span>
                      <span>Import File…</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors ${collapsed ? 'mx-auto' : ''}`}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRightIcon className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeftIcon className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Tree content */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto">
          <NotebookTree
            notebooks={notebooks}
            files={files}
            onCreateNotebook={onCreateNotebook}
            onDeleteNotebook={onDeleteNotebook}
            onRenameNotebook={onRenameNotebook}
            onCreateFile={onCreateFile}
            onImportFile={onImportFile}
            onDeleteFile={onDeleteFile}
            onRenameFile={onRenameFile}
            onOpenFile={onOpenFile}
            activeFilePath={activeFilePath}
          />
        </div>
      )}

      {/* Resize handle */}
      <div
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/30 active:bg-blue-500/50 transition-colors z-10"
        onMouseDown={onResizeMouseDown}
      />
    </div>
  );
}

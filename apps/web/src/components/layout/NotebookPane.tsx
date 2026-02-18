import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../icons/Icons';
import { NotebookTree } from '../notebook/NotebookTree';
import type { NotebookMeta, FileEntry } from '../../stores/localNotebookStore';

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
  onDeleteFile,
  onRenameFile,
  onOpenFile,
  activeFilePath,
}: NotebookPaneProps) {
  const { t } = useTranslation();

  return (
    <div
      className="relative shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex flex-col select-none"
      style={{ width }}
    >
      {/* Header */}
      <div className="h-9 flex items-center justify-between px-2 border-b border-gray-200 dark:border-gray-800">
        {!collapsed && (
          <>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Notebooks
            </span>
            <button
              onClick={onCreateNotebook}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
              title={t('notebook.addNotebook')}
              aria-label={t('notebook.addNotebook')}
            >
              <PlusIcon className="w-3.5 h-3.5" />
            </button>
          </>
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

import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, FolderIcon } from '../icons/Icons';

interface NotebookPaneProps {
  width: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onResizeMouseDown: (e: React.MouseEvent) => void;
}

export function NotebookPane({
  width,
  collapsed,
  onToggleCollapse,
  onResizeMouseDown,
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
              {t('notebook.addNotebook')}
            </span>
            <button
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
        <div className="flex-1 overflow-y-auto p-2">
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <FolderIcon className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              {t('notebook.addFirst')}
            </p>
            <button className="text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors">
              {t('notebook.addNotebook')}
            </button>
          </div>
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

import { useState, useCallback, useEffect, useRef } from 'react';
import type { NotebookMeta, FileEntry } from '../../stores/localNotebookStore';

const ic = 'w-4 h-4 shrink-0';

function DeviceIcon({ className = ic }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function FolderIcon({ className = ic }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ChevronIcon({ expanded, className = 'w-3 h-3' }: { expanded: boolean; className?: string }) {
  return (
    <svg className={`${className} transition-transform ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

interface SaveLocationPickerProps {
  fileName: string;
  notebooks: NotebookMeta[];
  files: Record<string, FileEntry[]>;
  onSave: (notebookId: string, parentPath: string) => void;
  onCancel: () => void;
}

export function SaveLocationPicker({ fileName, notebooks, files, onSave, onCancel }: SaveLocationPickerProps) {
  const [expandedNotebooks, setExpandedNotebooks] = useState<Set<string>>(() => {
    // Auto-expand the first notebook
    const s = new Set<string>();
    if (notebooks.length > 0) s.add(notebooks[0].id);
    return s;
  });
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<{ notebookId: string; parentPath: string } | null>(
    notebooks.length > 0 ? { notebookId: notebooks[0].id, parentPath: '' } : null,
  );
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const toggleNotebook = useCallback((id: string) => {
    setExpandedNotebooks((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleFolder = useCallback((key: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const isSelected = (notebookId: string, parentPath: string) =>
    selected?.notebookId === notebookId && selected?.parentPath === parentPath;

  const renderFolder = (folder: FileEntry, depth: number) => {
    const folderKey = `${folder.notebookId}:${folder.path}`;
    const isExpanded = expandedFolders.has(folderKey);
    const allFiles = files[folder.notebookId] ?? [];
    const childFolders = allFiles
      .filter((f) => f.parentPath === folder.path && f.type === 'folder')
      .sort((a, b) => a.name.localeCompare(b.name));

    return (
      <div key={folder.path}>
        <div
          className={`flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer text-sm select-none transition-colors ${
            isSelected(folder.notebookId, folder.path)
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            setSelected({ notebookId: folder.notebookId, parentPath: folder.path });
            if (childFolders.length > 0) toggleFolder(folderKey);
          }}
        >
          {childFolders.length > 0 ? (
            <ChevronIcon expanded={isExpanded} />
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <FolderIcon className="w-4 h-4 text-yellow-500 shrink-0" />
          <span className="truncate">{folder.name}</span>
        </div>
        {isExpanded && childFolders.map((child) => renderFolder(child, depth + 1))}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl w-96 max-h-[70vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Save "{fileName}"
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Choose a location to save the imported file.
          </p>
        </div>

        {/* Tree view — notebooks and folders only */}
        <div className="flex-1 overflow-y-auto px-2 py-1 min-h-[150px] max-h-[300px] border-y border-gray-100 dark:border-gray-800">
          {notebooks.length === 0 ? (
            <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
              No notebooks yet. Create one first.
            </div>
          ) : (
            notebooks.map((nb) => {
              const isExpanded = expandedNotebooks.has(nb.id);
              const allFiles = files[nb.id] ?? [];
              const rootFolders = allFiles
                .filter((f) => f.parentPath === '' && f.type === 'folder')
                .sort((a, b) => a.name.localeCompare(b.name));

              return (
                <div key={nb.id}>
                  <div
                    className={`flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer text-sm select-none transition-colors ${
                      isSelected(nb.id, '')
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                    onClick={() => {
                      setSelected({ notebookId: nb.id, parentPath: '' });
                      toggleNotebook(nb.id);
                    }}
                  >
                    <ChevronIcon expanded={isExpanded} />
                    <DeviceIcon className="w-4 h-4 text-gray-500 shrink-0" />
                    <span className="font-medium truncate">{nb.name}</span>
                  </div>
                  {isExpanded && rootFolders.map((folder) => renderFolder(folder, 1))}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[200px]">
            {selected
              ? `${notebooks.find((n) => n.id === selected.notebookId)?.name ?? ''}${selected.parentPath ? '/' + selected.parentPath : ''}/`
              : 'Select a location'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="h-7 px-3 text-xs rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
            >
              Cancel
            </button>
            <button
              onClick={() => selected && onSave(selected.notebookId, selected.parentPath)}
              disabled={!selected}
              className="h-7 px-3 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Save Here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

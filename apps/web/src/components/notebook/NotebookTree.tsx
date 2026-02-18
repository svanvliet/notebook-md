import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { NotebookMeta, FileEntry } from '../../stores/localNotebookStore';
import { ChevronRightIcon, FolderIcon } from '../icons/Icons';
import { SourceIcon } from './SourceTypes';

// --- Small SVG icons for context menu items ---
const ic = 'w-4 h-4 shrink-0';

function NewFileIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>;
}
function NewFolderIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>;
}
function RenameIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
}
function TrashIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
}
function NotebookIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>;
}
function ImportIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
}
function RefreshIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
}

function BlockedBadge() {
  return (
    <span className="shrink-0 inline-flex items-center text-red-600 dark:text-red-400 ml-1">
      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.343 4.343a8 8 0 0011.314 0L4.343 15.657a8 8 0 010-11.314z" clipRule="evenodd" />
      </svg>
    </span>
  );
}

function CopyBadge() {
  return (
    <span className="shrink-0 inline-flex items-center text-green-600 dark:text-green-400 ml-1">
      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
      </svg>
    </span>
  );
}

function FileIcon({ name, className = 'w-4 h-4' }: { name: string; className?: string }) {
  const ext = name.split('.').pop()?.toLowerCase();
  const isMd = ext === 'md' || ext === 'mdx' || ext === 'markdown';
  return (
    <svg className={`${className} ${isMd ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      {isMd && <path d="M8 13h3l1.5-2 1.5 2h3" strokeWidth="1.5" />}
    </svg>
  );
}

const EDITABLE_EXTS = new Set(['md', 'mdx', 'markdown', 'txt']);

interface ContextMenuState {
  x: number;
  y: number;
  target:
    | { kind: 'notebook'; id: string }
    | { kind: 'file'; notebookId: string; path: string; fileType: 'file' | 'folder' };
}

interface NotebookTreeProps {
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
  onExpandNotebook?: (notebookId: string) => void;
  onRefreshNotebook?: (notebookId: string) => void;
  onMoveFile?: (notebookId: string, oldPath: string, newParentPath: string) => void;
  onCopyFile?: (sourceNotebookId: string, sourcePath: string, targetNotebookId: string, targetParentPath: string) => void;
  onReorderNotebooks?: (orderedIds: string[]) => void;
  activeFilePath: string | null;
}

export function NotebookTree({
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
  onExpandNotebook,
  onRefreshNotebook,
  onMoveFile,
  onCopyFile,
  onReorderNotebooks,
  activeFilePath,
}: NotebookTreeProps) {
  const { t } = useTranslation();
  const [expandedNotebooks, setExpandedNotebooks] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingItem, setRenamingItem] = useState<{ type: 'notebook' | 'file'; key: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  // Drag state for tree items
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dragNotebookId, setDragNotebookId] = useState<string | null>(null);
  const [dragSourceNotebookId, setDragSourceNotebookId] = useState<string | null>(null);

  // Determine cross-notebook drop style: green (copy allowed), red (blocked), or null (same notebook)
  const crossDropStyle = useCallback((targetNotebookId: string): 'copy' | 'blocked' | null => {
    if (!dragSourceNotebookId || dragSourceNotebookId === targetNotebookId) return null;
    const srcNb = notebooks.find((n) => n.id === dragSourceNotebookId);
    const tgtNb = notebooks.find((n) => n.id === targetNotebookId);
    const srcLocal = (srcNb?.sourceType ?? 'local') === 'local';
    const tgtLocal = (tgtNb?.sourceType ?? 'local') === 'local';
    return srcLocal && tgtLocal ? 'copy' : 'blocked';
  }, [dragSourceNotebookId, notebooks]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (renamingItem && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingItem]);

  const toggleNotebook = useCallback((id: string) => {
    setExpandedNotebooks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Notify parent to load files for remote notebooks
        onExpandNotebook?.(id);
      }
      return next;
    });
  }, [onExpandNotebook]);

  const toggleFolder = useCallback((key: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const startRename = useCallback((type: 'notebook' | 'file', key: string, currentName: string) => {
    setRenamingItem({ type, key });
    setRenameValue(currentName);
    setContextMenu(null);
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingItem || !renameValue.trim()) {
      setRenamingItem(null);
      return;
    }
    if (renamingItem.type === 'notebook') {
      onRenameNotebook(renamingItem.key, renameValue.trim());
    } else {
      const sepIdx = renamingItem.key.indexOf(':');
      const notebookId = renamingItem.key.slice(0, sepIdx);
      const path = renamingItem.key.slice(sepIdx + 1);
      onRenameFile(notebookId, path, renameValue.trim());
    }
    setRenamingItem(null);
  }, [renamingItem, renameValue, onRenameNotebook, onRenameFile]);

  const renderFileItem = (file: FileEntry, depth: number) => {
    const isFolder = file.type === 'folder';
    const fileKey = `${file.notebookId}:${file.path}`;
    const isExpanded = expandedFolders.has(fileKey);
    const isActive = activeFilePath === fileKey;
    const isRenaming = renamingItem?.type === 'file' && renamingItem.key === fileKey;
    const canOpen = !isFolder && EDITABLE_EXTS.has(file.name.split('.').pop()?.toLowerCase() ?? '');

    const allFiles = files[file.notebookId] ?? [];
    const children = isFolder
      ? allFiles
          .filter((f) => f.parentPath === file.path)
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
          })
      : [];

    return (
      <div key={file.path}>
        <div
          className={`flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer text-sm select-none transition-colors ${
            dropTarget === fileKey
              ? (crossDropStyle(file.notebookId) === 'blocked'
                  ? 'bg-red-200 dark:bg-red-800/40 ring-1 ring-red-400'
                  : crossDropStyle(file.notebookId) === 'copy'
                    ? 'bg-green-200 dark:bg-green-800/40 ring-1 ring-green-400'
                    : 'bg-blue-200 dark:bg-blue-800/40 ring-1 ring-blue-400')
              : isActive
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
          }`}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
          draggable
          onDragStart={(e) => {
            const nb = notebooks.find((n) => n.id === file.notebookId);
            e.dataTransfer.setData('text/notebook-file', file.path);
            e.dataTransfer.setData('text/notebook-tree-item', JSON.stringify({
              notebookId: file.notebookId,
              path: file.path,
              type: file.type,
              sourceType: nb?.sourceType ?? 'local',
            }));
            e.dataTransfer.effectAllowed = 'copyMove';
            setDragSourceNotebookId(file.notebookId);
          }}
          onDragEnd={() => setDragSourceNotebookId(null)}
          onDragOver={(e) => {
            if (!isFolder) return;
            const raw = e.dataTransfer.types.includes('text/notebook-tree-item');
            if (!raw) return;
            e.preventDefault();
            e.stopPropagation();
            setDropTarget(fileKey);
            const style = crossDropStyle(file.notebookId);
            if (style === 'copy') {
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDragLeave={() => {
            if (dropTarget === fileKey) setDropTarget(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDropTarget(null);
            if (!isFolder) return;
            const raw = e.dataTransfer.getData('text/notebook-tree-item');
            if (!raw) return;
            try {
              const data = JSON.parse(raw) as { notebookId: string; path: string; type: string; sourceType?: string };
              if (data.notebookId === file.notebookId) {
                // Same notebook → move
                if (!onMoveFile) return;
                if (data.path === file.path) return;
                if (file.path.startsWith(data.path + '/')) return;
                onMoveFile(data.notebookId, data.path, file.path);
              } else {
                // Cross-notebook → copy (only local-to-local)
                if (!onCopyFile) return;
                const targetNb = notebooks.find((n) => n.id === file.notebookId);
                if (data.sourceType !== 'local' || (targetNb?.sourceType ?? 'local') !== 'local') return;
                onCopyFile(data.notebookId, data.path, file.notebookId, file.path);
              }
            } catch { /* ignore */ }
          }}
          onClick={() => {
            if (isFolder) toggleFolder(fileKey);
            else if (canOpen) onOpenFile(file.notebookId, file.path);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              target: { kind: 'file', notebookId: file.notebookId, path: file.path, fileType: file.type },
            });
          }}
        >
          {isFolder ? (
            <ChevronRightIcon className={`w-3 h-3 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          ) : (
            <span className="w-3 shrink-0" />
          )}
          {isFolder ? (
            <FolderIcon className="w-4 h-4 text-yellow-500 shrink-0" />
          ) : (
            <FileIcon name={file.name} className="w-4 h-4 shrink-0" />
          )}
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenamingItem(null);
              }}
              onBlur={commitRename}
              className="flex-1 text-sm bg-white dark:bg-gray-800 border border-blue-500 rounded px-1 py-0 outline-none min-w-0"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate">{file.name}</span>
          )}
          {dropTarget === fileKey && crossDropStyle(file.notebookId) === 'blocked' && <BlockedBadge />}
          {dropTarget === fileKey && crossDropStyle(file.notebookId) === 'copy' && <CopyBadge />}
        </div>
        {isFolder && isExpanded && children.map((child) => renderFileItem(child, depth + 1))}
      </div>
    );
  };

  // Empty state
  if (notebooks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <FolderIcon className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t('notebook.addFirst')}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">{t('notebook.localWarning')}</p>
        <button
          onClick={onCreateNotebook}
          className="text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          {t('notebook.addNotebook')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-1">
      {notebooks.map((nb) => {
        const isExpanded = expandedNotebooks.has(nb.id);
        const isRenaming = renamingItem?.type === 'notebook' && renamingItem.key === nb.id;
        const allFiles = files[nb.id] ?? [];
        const rootFiles = allFiles
          .filter((f) => f.parentPath === '')
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

        return (
          <div key={nb.id}>
            <div
              className={`flex items-center gap-1.5 py-1 px-2 cursor-pointer rounded select-none transition-colors ${
                dropTarget === `notebook:${nb.id}`
                  ? (crossDropStyle(nb.id) === 'blocked'
                      ? 'bg-red-200 dark:bg-red-800/40 ring-1 ring-red-400'
                      : crossDropStyle(nb.id) === 'copy'
                        ? 'bg-green-200 dark:bg-green-800/40 ring-1 ring-green-400'
                        : 'bg-blue-200 dark:bg-blue-800/40 ring-1 ring-blue-400')
                  : dragNotebookId && dragNotebookId !== nb.id
                    ? 'border-t-2 border-blue-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              draggable
              onDragStart={(e) => {
                setDragNotebookId(nb.id);
                e.dataTransfer.setData('text/notebook-reorder', nb.id);
                e.dataTransfer.setData('text/notebook-tree-item', '');
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => setDragNotebookId(null)}
              onDragOver={(e) => {
                // Accept notebook reorder OR file move to root
                const isReorder = e.dataTransfer.types.includes('text/notebook-reorder');
                const isFileMove = e.dataTransfer.types.includes('text/notebook-tree-item') && !isReorder;
                if (!isReorder && !isFileMove) return;
                e.preventDefault();
                e.stopPropagation();
                if (isFileMove) {
                  setDropTarget(`notebook:${nb.id}`);
                  const style = crossDropStyle(nb.id);
                  if (style === 'copy') {
                    e.dataTransfer.dropEffect = 'copy';
                  }
                }
              }}
              onDragLeave={() => {
                if (dropTarget === `notebook:${nb.id}`) setDropTarget(null);
              }}
              onDrop={(e) => {
                setDropTarget(null);
                // Handle notebook reorder
                const draggedId = e.dataTransfer.getData('text/notebook-reorder');
                if (draggedId && draggedId !== nb.id && onReorderNotebooks) {
                  e.preventDefault();
                  e.stopPropagation();
                  const ids = notebooks.map((n) => n.id);
                  const fromIdx = ids.indexOf(draggedId);
                  const toIdx = ids.indexOf(nb.id);
                  if (fromIdx >= 0 && toIdx >= 0) {
                    ids.splice(fromIdx, 1);
                    ids.splice(toIdx, 0, draggedId);
                    onReorderNotebooks(ids);
                  }
                  return;
                }
                // Handle file move to root or cross-notebook copy
                const raw = e.dataTransfer.getData('text/notebook-tree-item');
                if (raw) {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    const data = JSON.parse(raw) as { notebookId: string; path: string; type: string; sourceType?: string };
                    if (data.notebookId === nb.id) {
                      // Same notebook → move to root
                      if (!onMoveFile) return;
                      if (!data.path.includes('/')) return; // Already at root
                      onMoveFile(data.notebookId, data.path, '');
                    } else {
                      // Cross-notebook → copy to root (local-to-local only)
                      if (!onCopyFile) return;
                      if (data.sourceType !== 'local' || (nb.sourceType ?? 'local') !== 'local') return;
                      onCopyFile(data.notebookId, data.path, nb.id, '');
                    }
                  } catch { /* ignore */ }
                }
              }}
              onClick={() => toggleNotebook(nb.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, target: { kind: 'notebook', id: nb.id } });
              }}
            >
              <ChevronRightIcon className={`w-3 h-3 shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              <SourceIcon sourceType={nb.sourceType ?? 'local'} className="w-4 h-4 shrink-0" />
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenamingItem(null);
                  }}
                  onBlur={commitRename}
                  className="flex-1 text-sm bg-white dark:bg-gray-800 border border-blue-500 rounded px-1 py-0 outline-none min-w-0 font-medium"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="font-medium text-gray-800 dark:text-gray-200 truncate">{nb.name}</span>
              )}
              {dropTarget === `notebook:${nb.id}` && crossDropStyle(nb.id) === 'blocked' && <BlockedBadge />}
              {dropTarget === `notebook:${nb.id}` && crossDropStyle(nb.id) === 'copy' && <CopyBadge />}
            </div>
            {isExpanded && (
              <div>
                {rootFiles.length === 0 ? (
                  <div className="text-xs text-gray-400 dark:text-gray-500 px-6 py-2 italic">Empty notebook</div>
                ) : (
                  rootFiles.map((file) => renderFileItem(file, 1))
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.target.kind === 'notebook' ? (
            <>
              <CtxItem icon={<NewFileIcon />} label={t('notebook.newFile')} onClick={() => { onCreateFile(contextMenu.target.kind === 'notebook' ? contextMenu.target.id : '', '', 'file'); setContextMenu(null); }} />
              <CtxItem icon={<NewFolderIcon />} label={t('notebook.newFolder')} onClick={() => { onCreateFile(contextMenu.target.kind === 'notebook' ? contextMenu.target.id : '', '', 'folder'); setContextMenu(null); }} />
              <CtxItem icon={<ImportIcon />} label="Import File…" onClick={() => { if (contextMenu.target.kind === 'notebook') onImportFile(contextMenu.target.id, ''); setContextMenu(null); }} />
              {onRefreshNotebook && (
                <CtxItem icon={<RefreshIcon />} label="Refresh" onClick={() => { if (contextMenu.target.kind === 'notebook') onRefreshNotebook(contextMenu.target.id); setContextMenu(null); }} />
              )}
              <CtxDivider />
              <CtxItem icon={<RenameIcon />} label={t('notebook.rename')} onClick={() => { const nb = notebooks.find((n) => n.id === (contextMenu.target.kind === 'notebook' ? contextMenu.target.id : '')); if (nb) startRename('notebook', nb.id, nb.name); }} />
              <CtxItem icon={<TrashIcon />} label={t('notebook.delete')} danger onClick={() => { if (contextMenu.target.kind === 'notebook') onDeleteNotebook(contextMenu.target.id); setContextMenu(null); }} />
            </>
          ) : (
            <>
              {contextMenu.target.fileType === 'folder' && (
                <>
                  <CtxItem icon={<NewFileIcon />} label={t('notebook.newFile')} onClick={() => { if (contextMenu.target.kind === 'file') onCreateFile(contextMenu.target.notebookId, contextMenu.target.path, 'file'); setContextMenu(null); }} />
                  <CtxItem icon={<NewFolderIcon />} label={t('notebook.newFolder')} onClick={() => { if (contextMenu.target.kind === 'file') onCreateFile(contextMenu.target.notebookId, contextMenu.target.path, 'folder'); setContextMenu(null); }} />
                  <CtxItem icon={<ImportIcon />} label="Import File…" onClick={() => { if (contextMenu.target.kind === 'file') onImportFile(contextMenu.target.notebookId, contextMenu.target.path); setContextMenu(null); }} />
                  <CtxDivider />
                </>
              )}
              <CtxItem
                icon={<RenameIcon />}
                label={t('notebook.rename')}
                onClick={() => {
                  if (contextMenu.target.kind === 'file') {
                    const name = contextMenu.target.path.split('/').pop() ?? '';
                    startRename('file', `${contextMenu.target.notebookId}:${contextMenu.target.path}`, name);
                  }
                }}
              />
              <CtxItem icon={<TrashIcon />} label={t('notebook.delete')} danger onClick={() => { if (contextMenu.target.kind === 'file') onDeleteFile(contextMenu.target.notebookId, contextMenu.target.path); setContextMenu(null); }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CtxItem({ label, icon, onClick, danger }: { label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2.5 transition-colors ${
        danger ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
      }`}
    >
      {icon && <span className="opacity-70">{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

function CtxDivider() {
  return <div className="border-t border-gray-100 dark:border-gray-800 my-0.5" />;
}

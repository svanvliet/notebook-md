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
    <span className="ml-auto shrink-0 inline-flex items-center text-red-500 dark:text-red-400">
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="10" cy="10" r="7" />
        <line x1="5" y1="15" x2="15" y2="5" />
      </svg>
    </span>
  );
}

function CopyBadge() {
  return (
    <span className="ml-auto shrink-0 inline-flex items-center text-green-500 dark:text-green-400">
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="10" cy="10" r="7" />
        <line x1="10" y1="6" x2="10" y2="14" />
        <line x1="6" y1="10" x2="14" y2="10" />
      </svg>
    </span>
  );
}

function FileIcon({ name, className = 'w-4 h-4' }: { name: string; className?: string }) {
  const ext = name.split('.').pop()?.toLowerCase();
  const isMd = ext === 'md' || ext === 'mdx' || ext === 'markdown';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext ?? '');
  const isVideo = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogv'].includes(ext ?? '');
  const isTxt = ext === 'txt';

  if (isImage) {
    return (
      <svg className={`${className} text-green-500`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
      </svg>
    );
  }
  if (isVideo) {
    return (
      <svg className={`${className} text-purple-500`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0 1 18 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0 1 18 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 0 1 6 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M19.125 12h1.5m0 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h1.5m14.25 0h1.5" />
      </svg>
    );
  }
  if (isTxt) {
    // Heroicons: document (plain)
    return (
      <svg className={`${className} text-gray-400 dark:text-gray-500`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    );
  }
  // Markdown files: Heroicons document-arrow-down
  if (isMd) {
    return (
      <svg className={`${className} text-blue-500`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    );
  }
  // Default: plain document
  return (
    <svg className={`${className} text-gray-400 dark:text-gray-500`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

const EDITABLE_EXTS = new Set(['md', 'mdx', 'markdown', 'txt']);

/** Check if a drag event contains external files (from OS, not internal tree drags) */
function hasExternalFiles(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes('text/notebook-tree-item');
}

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
  loadingNotebooks?: Set<string>;
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
  onDropImport?: (notebookId: string, parentPath: string, fileName: string, content: string) => void;
  expandToPath?: { notebookId: string; path: string } | null;
  onExpandToPathHandled?: () => void;
  activeFilePath: string | null;
}

export function NotebookTree({
  notebooks,
  files,
  loadingNotebooks,
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
  onDropImport,
  expandToPath,
  onExpandToPathHandled,
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

  // Expand ancestor folders when a file is created/imported
  useEffect(() => {
    if (!expandToPath) return;
    const { notebookId, path } = expandToPath;
    // Expand the notebook
    setExpandedNotebooks((prev) => {
      const next = new Set(prev);
      next.add(notebookId);
      return next;
    });
    // Expand all ancestor folders
    const parts = path.split('/');
    if (parts.length > 1) {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        for (let i = 1; i < parts.length; i++) {
          const folderPath = parts.slice(0, i).join('/');
          next.add(`${notebookId}:${folderPath}`);
        }
        return next;
      });
    }
    onExpandToPathHandled?.();
  }, [expandToPath, onExpandToPathHandled]);

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
            const isTreeItem = e.dataTransfer.types.includes('text/notebook-tree-item');
            const isExternal = hasExternalFiles(e);
            if (!isTreeItem && !isExternal) return;
            e.preventDefault();
            e.stopPropagation();
            setDropTarget(fileKey);
            if (isExternal) {
              e.dataTransfer.dropEffect = 'copy';
            } else {
              const style = crossDropStyle(file.notebookId);
              if (style === 'copy') {
                e.dataTransfer.dropEffect = 'copy';
              }
            }
          }}
          onDragLeave={() => {
            if (dropTarget === fileKey) setDropTarget(null);
          }}
          onDrop={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            setDropTarget(null);
            if (!isFolder) return;

            // Handle external file drop (from OS)
            if (hasExternalFiles(e) && e.dataTransfer.files?.length && onDropImport) {
              for (const f of Array.from(e.dataTransfer.files)) {
                const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
                if (!EDITABLE_EXTS.has(ext)) continue;
                const content = await f.text();
                onDropImport(file.notebookId, file.path, f.name, content);
              }
              return;
            }

            // Handle internal tree item drag
            const raw = e.dataTransfer.getData('text/notebook-tree-item');
            if (!raw) return;
            try {
              const data = JSON.parse(raw) as { notebookId: string; path: string; type: string; sourceType?: string };
              if (data.notebookId === file.notebookId) {
                if (!onMoveFile) return;
                if (data.path === file.path) return;
                if (file.path.startsWith(data.path + '/')) return;
                onMoveFile(data.notebookId, data.path, file.path);
              } else {
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
            isExpanded ? (
              <svg className="w-4 h-4 text-gray-600 dark:text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-gray-600 dark:text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
              </svg>
            )
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
                // Accept notebook reorder, file move to root, or external file drop
                const isReorder = e.dataTransfer.types.includes('text/notebook-reorder');
                const isFileMove = e.dataTransfer.types.includes('text/notebook-tree-item') && !isReorder;
                const isExternal = hasExternalFiles(e);
                if (!isReorder && !isFileMove && !isExternal) return;
                e.preventDefault();
                e.stopPropagation();
                if (isFileMove || isExternal) {
                  setDropTarget(`notebook:${nb.id}`);
                  if (isExternal) {
                    e.dataTransfer.dropEffect = 'copy';
                  } else {
                    const style = crossDropStyle(nb.id);
                    if (style === 'copy') {
                      e.dataTransfer.dropEffect = 'copy';
                    }
                  }
                }
              }}
              onDragLeave={() => {
                if (dropTarget === `notebook:${nb.id}`) setDropTarget(null);
              }}
              onDrop={async (e) => {
                setDropTarget(null);

                // Handle external file drop (from OS) — import to notebook root
                if (hasExternalFiles(e) && e.dataTransfer.files?.length && onDropImport) {
                  e.preventDefault();
                  e.stopPropagation();
                  for (const f of Array.from(e.dataTransfer.files)) {
                    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
                    if (!EDITABLE_EXTS.has(ext)) continue;
                    const content = await f.text();
                    onDropImport(nb.id, '', f.name, content);
                  }
                  return;
                }

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
              {loadingNotebooks?.has(nb.id) && rootFiles.length > 0 && (
                <svg className="w-3.5 h-3.5 ml-auto shrink-0 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
            </div>
            {isExpanded && (
              <div>
                {rootFiles.length === 0 ? (
                  loadingNotebooks?.has(nb.id) ? (
                    <div className="flex items-center gap-2 px-6 py-2">
                      <svg className="w-4 h-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Loading…</span>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 dark:text-gray-500 px-6 py-2 italic">Empty notebook</div>
                  )
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

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createNotebook,
  listNotebooks,
  renameNotebook as renameNb,
  deleteNotebook as deleteNb,
  createFile,
  listFiles,
  saveFileContent,
  renameFile as renameF,
  deleteFile as deleteF,
  getFile,
  type NotebookMeta,
  type FileEntry,
} from '../stores/localNotebookStore';

export interface OpenTab {
  id: string; // "notebookId:path"
  notebookId: string;
  path: string;
  name: string;
  content: string;
  savedContent: string;
  hasUnsavedChanges: boolean;
  lastSaved: number | null;
}

export function useNotebookManager() {
  const [notebooks, setNotebooks] = useState<NotebookMeta[]>([]);
  const [files, setFiles] = useState<Record<string, FileEntry[]>>({});
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Show a temporary status bar message
  const flash = useCallback((msg: string, ms = 2000) => {
    setStatusMessage(msg);
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setStatusMessage(null), ms);
  }, []);

  // Load notebooks and their files on mount
  useEffect(() => {
    (async () => {
      const nbs = await listNotebooks();
      setNotebooks(nbs);
      const fileMap: Record<string, FileEntry[]> = {};
      for (const nb of nbs) {
        fileMap[nb.id] = await listFiles(nb.id);
      }
      setFiles(fileMap);
    })();
  }, []);

  const refreshFiles = useCallback(async (notebookId: string) => {
    const entries = await listFiles(notebookId);
    setFiles((prev) => ({ ...prev, [notebookId]: entries }));
  }, []);

  // --- Notebook operations ---

  const handleCreateNotebook = useCallback(async () => {
    const name = prompt('Notebook name:');
    if (!name?.trim()) return;

    const nb = await createNotebook(name.trim());
    setNotebooks((prev) => [...prev, nb]);
    setFiles((prev) => ({ ...prev, [nb.id]: [] }));
    flash(`Created notebook "${nb.name}"`);

    // Show browser storage warning
    alert(
      'Local notebooks are stored in your browser\'s IndexedDB.\n\n' +
      'Clearing your browser data will permanently delete this notebook\'s content.\n\n' +
      'Consider backing up important files regularly.',
    );
  }, [flash]);

  const handleDeleteNotebook = useCallback(async (id: string) => {
    const nb = notebooks.find((n) => n.id === id);
    if (!nb) return;
    if (!confirm(`Delete notebook "${nb.name}" and all its files? This cannot be undone.`)) return;

    // Close any open tabs from this notebook
    setTabs((prev) => prev.filter((t) => t.notebookId !== id));
    setActiveTabId((prev) => {
      const remaining = tabs.filter((t) => t.notebookId !== id);
      if (prev && tabs.find((t) => t.id === prev)?.notebookId === id) {
        return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      }
      return prev;
    });

    await deleteNb(id);
    setNotebooks((prev) => prev.filter((n) => n.id !== id));
    setFiles((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    flash(`Deleted notebook "${nb.name}"`);
  }, [notebooks, tabs, flash]);

  const handleRenameNotebook = useCallback(async (id: string, name: string) => {
    await renameNb(id, name);
    setNotebooks((prev) => prev.map((n) => (n.id === id ? { ...n, name } : n)));
  }, []);

  // --- File operations ---

  const handleCreateFile = useCallback(
    async (notebookId: string, parentPath: string, type: 'file' | 'folder') => {
      const label = type === 'folder' ? 'Folder name:' : 'File name (e.g. notes.md):';
      const name = prompt(label);
      if (!name?.trim()) return;

      await createFile(notebookId, parentPath, name.trim(), type);
      await refreshFiles(notebookId);
      flash(`Created ${type} "${name.trim()}"`);
    },
    [refreshFiles, flash],
  );

  const handleDeleteFile = useCallback(
    async (notebookId: string, path: string) => {
      const name = path.split('/').pop() ?? path;
      if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

      // Close tab if open
      const tabId = `${notebookId}:${path}`;
      setTabs((prev) => prev.filter((t) => t.id !== tabId));
      setActiveTabId((prev) => {
        if (prev === tabId) {
          const remaining = tabs.filter((t) => t.id !== tabId);
          return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        }
        return prev;
      });

      await deleteF(notebookId, path);
      await refreshFiles(notebookId);
      flash(`Deleted "${name}"`);
    },
    [refreshFiles, tabs, flash],
  );

  const handleRenameFile = useCallback(
    async (notebookId: string, path: string, newName: string) => {
      const entry = await renameF(notebookId, path, newName);
      await refreshFiles(notebookId);

      // Update tab if open
      const oldTabId = `${notebookId}:${path}`;
      const newTabId = `${notebookId}:${entry.path}`;
      setTabs((prev) =>
        prev.map((t) =>
          t.id === oldTabId
            ? { ...t, id: newTabId, path: entry.path, name: entry.name }
            : t,
        ),
      );
      setActiveTabId((prev) => (prev === oldTabId ? newTabId : prev));
    },
    [refreshFiles],
  );

  // --- Open file in editor ---

  const handleOpenFile = useCallback(
    async (notebookId: string, path: string) => {
      const tabId = `${notebookId}:${path}`;

      // If already open, just switch to it
      if (tabs.find((t) => t.id === tabId)) {
        setActiveTabId(tabId);
        return;
      }

      const entry = await getFile(notebookId, path);
      if (!entry || entry.type === 'folder') return;

      const tab: OpenTab = {
        id: tabId,
        notebookId,
        path,
        name: entry.name,
        content: entry.content,
        savedContent: entry.content,
        hasUnsavedChanges: false,
        lastSaved: entry.updatedAt,
      };

      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tabId);
    },
    [tabs],
  );

  // --- Content change (auto-save for local notebooks) ---

  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleContentChange = useCallback(
    (tabId: string, html: string) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, content: html, hasUnsavedChanges: html !== t.savedContent }
            : t,
        ),
      );

      // Auto-save with debounce (1 second)
      if (autoSaveTimers.current[tabId]) {
        clearTimeout(autoSaveTimers.current[tabId]);
      }
      autoSaveTimers.current[tabId] = setTimeout(async () => {
        const tab = tabs.find((t) => t.id === tabId);
        if (!tab) return;
        try {
          // Get latest content from state
          setTabs((prev) => {
            const current = prev.find((t) => t.id === tabId);
            if (current) {
              saveFileContent(current.notebookId, current.path, current.content).then(() => {
                setTabs((p) =>
                  p.map((t) =>
                    t.id === tabId
                      ? { ...t, savedContent: t.content, hasUnsavedChanges: false, lastSaved: Date.now() }
                      : t,
                  ),
                );
              });
            }
            return prev;
          });
        } catch {
          flash('Failed to auto-save');
        }
      }, 1000);
    },
    [tabs, flash],
  );

  // --- Manual save (Cmd+S) ---

  const handleSave = useCallback(async () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab || !tab.hasUnsavedChanges) return;

    try {
      await saveFileContent(tab.notebookId, tab.path, tab.content);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tab.id
            ? { ...t, savedContent: t.content, hasUnsavedChanges: false, lastSaved: Date.now() }
            : t,
        ),
      );
      flash('Saved');
    } catch {
      flash('Failed to save');
    }
  }, [tabs, activeTabId, flash]);

  // Register Cmd/Ctrl+S globally
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleSave]);

  // --- Tab operations ---

  const handleTabClose = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.hasUnsavedChanges) {
        if (!confirm(`"${tab.name}" has unsaved changes. Close anyway?`)) return;
      }

      setTabs((prev) => prev.filter((t) => t.id !== tabId));
      if (activeTabId === tabId) {
        setActiveTabId((prev) => {
          const remaining = tabs.filter((t) => t.id !== tabId);
          return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        });
      }
    },
    [tabs, activeTabId],
  );

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  return {
    notebooks,
    files,
    tabs,
    activeTabId,
    activeTab,
    statusMessage,
    setActiveTabId,
    handleCreateNotebook,
    handleDeleteNotebook,
    handleRenameNotebook,
    handleCreateFile,
    handleDeleteFile,
    handleRenameFile,
    handleOpenFile,
    handleContentChange,
    handleSave,
    handleTabClose,
  };
}

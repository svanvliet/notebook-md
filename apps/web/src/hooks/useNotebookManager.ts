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
  setStorageScope,
  type NotebookMeta,
  type FileEntry,
} from '../stores/localNotebookStore';
import { markdownToHtml, isMarkdownContent } from '../components/editor/markdownConverter';

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

export interface ModalRequest {
  title: string;
  label: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
}

export interface SaveLocationRequest {
  fileName: string;
  content: string;
  onSave: (notebookId: string, parentPath: string) => void;
}

export function useNotebookManager(userId?: string | null) {
  const [notebooks, setNotebooks] = useState<NotebookMeta[]>([]);
  const [files, setFiles] = useState<Record<string, FileEntry[]>>({});
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [modalRequest, setModalRequest] = useState<ModalRequest | null>(null);
  const [saveLocationRequest, setSaveLocationRequest] = useState<SaveLocationRequest | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Show a temporary status bar message
  const flash = useCallback((msg: string, ms = 2000) => {
    setStatusMessage(msg);
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setStatusMessage(null), ms);
  }, []);

  // Load notebooks and their files when scope changes
  useEffect(() => {
    setStorageScope(userId ?? null);
    (async () => {
      const nbs = await listNotebooks();
      setNotebooks(nbs);
      const fileMap: Record<string, FileEntry[]> = {};
      for (const nb of nbs) {
        fileMap[nb.id] = await listFiles(nb.id);
      }
      setFiles(fileMap);
      // Clear tabs when switching users
      setTabs([]);
      setActiveTabId(null);
    })();
  }, [userId]);

  const refreshFiles = useCallback(async (notebookId: string) => {
    const entries = await listFiles(notebookId);
    setFiles((prev) => ({ ...prev, [notebookId]: entries }));
  }, []);

  // --- Notebook operations ---

  const handleCreateNotebook = useCallback(() => {
    setModalRequest({
      title: 'New Notebook',
      label: 'Notebook name',
      placeholder: 'My Notebook',
      onSubmit: async (name: string) => {
        setModalRequest(null);
        const nb = await createNotebook(name);
        setNotebooks((prev) => [...prev, nb]);
        setFiles((prev) => ({ ...prev, [nb.id]: [] }));
        flash(`Created notebook "${nb.name}"`);
      },
    });
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
    (notebookId: string, parentPath: string, type: 'file' | 'folder') => {
      setModalRequest({
        title: type === 'folder' ? 'New Folder' : 'New File',
        label: type === 'folder' ? 'Folder name' : 'File name',
        placeholder: type === 'folder' ? 'my-folder' : 'untitled.md',
        onSubmit: async (rawName: string) => {
          setModalRequest(null);
          let name = rawName;
          if (type === 'file' && !name.includes('.')) {
            name = `${name}.md`;
          }
          await createFile(notebookId, parentPath, name, type);
          await refreshFiles(notebookId);
          flash(`Created ${type} "${name}"`);
        },
      });
    },
    [refreshFiles, flash],
  );

  // Import a file from the user's device
  const handleImportFile = useCallback(
    (notebookId?: string, parentPath?: string) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.md,.mdx,.markdown,.txt';
      input.multiple = true;
      input.onchange = async () => {
        if (!input.files?.length) return;
        for (const file of Array.from(input.files)) {
          const content = await file.text();
          const fileName = file.name;
          if (notebookId) {
            // Direct import to a known location
            const entry = await createFile(notebookId, parentPath ?? '', fileName, 'file', content);
            await refreshFiles(notebookId);
            flash(`Imported "${fileName}"`);
            // Auto-open the imported file
            const htmlContent = isMarkdownContent(content) ? markdownToHtml(content) : content;
            const tabId = `${notebookId}:${entry.path}`;
            setTabs((prev) => [...prev, {
              id: tabId, notebookId, path: entry.path, name: entry.name,
              content: htmlContent, savedContent: content,
              hasUnsavedChanges: false, lastSaved: entry.updatedAt,
            }]);
            setActiveTabId(tabId);
          } else {
            // Show save location picker
            setSaveLocationRequest({
              fileName,
              content,
              onSave: async (nbId: string, savePath: string) => {
                setSaveLocationRequest(null);
                const entry = await createFile(nbId, savePath, fileName, 'file', content);
                await refreshFiles(nbId);
                flash(`Imported "${fileName}"`);
                // Auto-open the imported file
                const htmlContent = isMarkdownContent(content) ? markdownToHtml(content) : content;
                const tabId = `${nbId}:${entry.path}`;
                setTabs((prev) => [...prev, {
                  id: tabId, notebookId: nbId, path: entry.path, name: entry.name,
                  content: htmlContent, savedContent: content,
                  hasUnsavedChanges: false, lastSaved: entry.updatedAt,
                }]);
                setActiveTabId(tabId);
              },
            });
          }
        }
      };
      input.click();
    },
    [refreshFiles, flash],
  );

  // Import via drag-and-drop (shows save location picker)
  const handleDropImport = useCallback(
    (fileName: string, content: string) => {
      setSaveLocationRequest({
        fileName,
        content,
        onSave: async (nbId: string, savePath: string) => {
          setSaveLocationRequest(null);
          const entry = await createFile(nbId, savePath, fileName, 'file', content);
          await refreshFiles(nbId);
          flash(`Imported "${fileName}"`);
          // Auto-open the imported file
          const htmlContent = isMarkdownContent(content) ? markdownToHtml(content) : content;
          const tabId = `${nbId}:${entry.path}`;
          setTabs((prev) => [...prev, {
            id: tabId, notebookId: nbId, path: entry.path, name: entry.name,
            content: htmlContent, savedContent: content,
            hasUnsavedChanges: false, lastSaved: entry.updatedAt,
          }]);
          setActiveTabId(tabId);
        },
      });
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

      // Convert markdown to HTML if the stored content is raw markdown
      let content = entry.content;
      if (isMarkdownContent(content)) {
        content = markdownToHtml(content);
      }

      const tab: OpenTab = {
        id: tabId,
        notebookId,
        path,
        name: entry.name,
        content,
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
      autoSaveTimers.current[tabId] = setTimeout(() => {
        // Read fresh state inside the setter to avoid stale closures
        setTabs((prev) => {
          const current = prev.find((t) => t.id === tabId);
          if (current && current.hasUnsavedChanges) {
            saveFileContent(current.notebookId, current.path, current.content)
              .then(() => {
                setTabs((p) =>
                  p.map((t) =>
                    t.id === tabId
                      ? { ...t, savedContent: t.content, hasUnsavedChanges: false, lastSaved: Date.now() }
                      : t,
                  ),
                );
              })
              .catch(() => flash('Failed to auto-save'));
          }
          return prev;
        });
      }, 1000);
    },
    [flash],
  );

  // --- Manual save (Cmd+S) ---

  const handleSave = useCallback(async () => {
    // Use a promise to read fresh state inside the setter
    let tabToSave: OpenTab | undefined;
    setTabs((prev) => {
      tabToSave = prev.find((t) => t.id === activeTabId);
      return prev;
    });

    if (!tabToSave || !tabToSave.hasUnsavedChanges) return;

    try {
      await saveFileContent(tabToSave.notebookId, tabToSave.path, tabToSave.content);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabToSave!.id
            ? { ...t, savedContent: t.content, hasUnsavedChanges: false, lastSaved: Date.now() }
            : t,
        ),
      );
      flash('Saved');
    } catch {
      flash('Failed to save');
    }
  }, [activeTabId, flash]);

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
    modalRequest,
    setModalRequest,
    saveLocationRequest,
    setSaveLocationRequest,
    setActiveTabId,
    handleCreateNotebook,
    handleDeleteNotebook,
    handleRenameNotebook,
    handleCreateFile,
    handleImportFile,
    handleDropImport,
    handleDeleteFile,
    handleRenameFile,
    handleOpenFile,
    handleContentChange,
    handleSave,
    handleTabClose,
  };
}

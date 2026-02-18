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
import {
  listGitHubFiles,
  readGitHubFile,
  writeGitHubFile,
  createGitHubFile,
  createWorkingBranch,
  publishBranch,
  type GitHubFileEntry,
} from '../api/github';

const EDITABLE_EXTS = new Set(['md', 'mdx', 'markdown', 'txt']);

export interface OpenTab {
  id: string; // "notebookId:path"
  notebookId: string;
  path: string;
  name: string;
  content: string;
  savedContent: string;
  hasUnsavedChanges: boolean;
  lastSaved: number | null;
  /** Git blob SHA — needed for GitHub file updates */
  sha?: string;
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
        if (nb.sourceType === 'local' || !nb.sourceType) {
          fileMap[nb.id] = await listFiles(nb.id);
        }
        // Remote notebooks load their tree on expand (lazy)
      }
      setFiles(fileMap);
      // Clear tabs when switching users
      setTabs([]);
      setActiveTabId(null);
    })();
  }, [userId]);

  /** Get a notebook by ID from current state */
  const getNotebook = useCallback(
    (id: string) => notebooks.find((n) => n.id === id),
    [notebooks],
  );

  /** Convert GitHub API entries to local FileEntry shape for the tree */
  function githubToFileEntries(notebookId: string, entries: GitHubFileEntry[], parentPath: string): FileEntry[] {
    return entries
      .filter((e) => {
        if (e.type === 'folder') return true;
        const ext = e.name.split('.').pop()?.toLowerCase() ?? '';
        return EDITABLE_EXTS.has(ext);
      })
      .map((e) => ({
        path: e.path,
        notebookId,
        name: e.name,
        type: e.type,
        parentPath,
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
  }

  /** Recursively fetch all GitHub files/folders into a flat list */
  async function fetchGitHubTreeRecursive(
    rootPath: string,
    notebookId: string,
    dirPath: string,
    parentPath: string,
  ): Promise<FileEntry[]> {
    const entries = await listGitHubFiles(rootPath, dirPath);
    const fileEntries = githubToFileEntries(notebookId, entries, parentPath);
    const results: FileEntry[] = [...fileEntries];
    // Recurse into folders
    for (const entry of fileEntries) {
      if (entry.type === 'folder') {
        const children = await fetchGitHubTreeRecursive(rootPath, notebookId, entry.path, entry.path);
        results.push(...children);
      }
    }
    return results;
  }

  const refreshFiles = useCallback(async (notebookId: string) => {
    const nb = notebooks.find((n) => n.id === notebookId);
    if (!nb || nb.sourceType === 'local' || !nb.sourceType) {
      const entries = await listFiles(notebookId);
      setFiles((prev) => ({ ...prev, [notebookId]: entries }));
    } else if (nb.sourceType === 'github') {
      try {
        const rootPath = nb.sourceConfig.rootPath as string;
        const allEntries = await fetchGitHubTreeRecursive(rootPath, notebookId, '', '');
        setFiles((prev) => ({ ...prev, [notebookId]: allEntries }));
      } catch (err) {
        flash(`Failed to load files: ${(err as Error).message}`);
      }
    }
  }, [notebooks, flash]);

  // --- Notebook operations ---

  const handleCreateNotebook = useCallback(() => {
    setModalRequest({
      title: 'New Notebook',
      label: 'Notebook name',
      placeholder: 'My Notebook',
      onSubmit: async (name: string) => {
        setModalRequest(null);
        const nb = await createNotebook(name, 'local');
        setNotebooks((prev) => [...prev, nb]);
        setFiles((prev) => ({ ...prev, [nb.id]: [] }));
        flash(`Created notebook "${nb.name}"`);
      },
    });
  }, [flash]);

  const handleAddNotebook = useCallback(
    async (name: string, sourceType: string, sourceConfig: Record<string, unknown>) => {
      if (sourceType === 'local') {
        const nb = await createNotebook(name, 'local');
        setNotebooks((prev) => [...prev, nb]);
        setFiles((prev) => ({ ...prev, [nb.id]: [] }));
        flash(`Created notebook "${nb.name}"`);
      } else {
        // Remote notebook — also save to server via API
        try {
          const res = await fetch('/api/notebooks', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, sourceType, sourceConfig }),
          });
          if (!res.ok) throw new Error('Failed to create notebook');
          const { notebook } = await res.json();
          // Also store locally for the tree to display
          const nb = await createNotebook(
            name,
            sourceType as NotebookMeta['sourceType'],
            sourceConfig,
          );
          // Override the id with the server's id
          nb.id = notebook.id;
          setNotebooks((prev) => [...prev, nb]);
          setFiles((prev) => ({ ...prev, [nb.id]: [] }));
          flash(`Added ${sourceType} notebook "${name}"`);
        } catch (err) {
          flash(`Failed to add notebook: ${(err as Error).message}`);
        }
      }
    },
    [flash],
  );

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

  // --- Working branch state (must precede file ops that use ensureWorkingBranch) ---

  // Working branch per notebook: notebookId → branch name
  const workingBranches = useRef<Record<string, string>>({});
  const branchCreating = useRef<Record<string, Promise<string>>>({});
  // Reactive set of notebook IDs that have a working branch (for UI)
  const [publishableNotebooks, setPublishableNotebooks] = useState<Set<string>>(new Set());

  /** Ensure a working branch exists for a GitHub notebook, create one if needed */
  const ensureWorkingBranch = useCallback(
    async (notebookId: string, nb: NotebookMeta): Promise<string> => {
      // Already have a branch for this notebook
      if (workingBranches.current[notebookId]) {
        return workingBranches.current[notebookId];
      }
      // Already creating — await the same promise to avoid duplicate branches
      if (branchCreating.current[notebookId]) {
        return branchCreating.current[notebookId];
      }

      const owner = nb.sourceConfig.owner as string;
      const repo = nb.sourceConfig.repo as string;
      const promise = createWorkingBranch(owner, repo, 'main').then((result) => {
        workingBranches.current[notebookId] = result.branch;
        delete branchCreating.current[notebookId];
        setPublishableNotebooks((prev) => new Set(prev).add(notebookId));
        return result.branch;
      });
      branchCreating.current[notebookId] = promise;
      return promise;
    },
    [],
  );

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
          const nb = notebooks.find((n) => n.id === notebookId);
          if (nb?.sourceType === 'github') {
            // Create file via GitHub API on working branch
            const rootPath = nb.sourceConfig.rootPath as string;
            const filePath = parentPath ? `${parentPath}/${name}` : name;
            try {
              const branch = await ensureWorkingBranch(notebookId, nb);
              await createGitHubFile(rootPath, filePath, '', branch);
              await refreshFiles(notebookId);
              flash(`Created ${type} "${name}"`);
            } catch (err) {
              flash(`Failed to create file: ${(err as Error).message}`);
            }
          } else {
            await createFile(notebookId, parentPath, name, type);
            await refreshFiles(notebookId);
            flash(`Created ${type} "${name}"`);
          }
        },
      });
    },
    [notebooks, ensureWorkingBranch, refreshFiles, flash],
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

      const nb = notebooks.find((n) => n.id === notebookId);

      if (nb && nb.sourceType === 'github') {
        // Fetch from GitHub API
        try {
          const rootPath = nb.sourceConfig.rootPath as string;
          const file = await readGitHubFile(rootPath, path);
          let content = file.content;
          if (isMarkdownContent(content)) {
            content = markdownToHtml(content);
          }

          const tab: OpenTab = {
            id: tabId,
            notebookId,
            path,
            name: file.name,
            content,
            savedContent: file.content,
            hasUnsavedChanges: false,
            lastSaved: Date.now(),
            sha: file.sha,
          };
          setTabs((prev) => [...prev, tab]);
          setActiveTabId(tabId);
        } catch (err) {
          flash(`Failed to open file: ${(err as Error).message}`);
        }
        return;
      }

      // Local file
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
    [tabs, notebooks, flash],
  );

  // --- Content change (auto-save) ---

  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  /** Save a tab's content to the appropriate backend */
  const saveTab = useCallback(
    async (tab: OpenTab): Promise<string | undefined> => {
      const nb = notebooks.find((n) => n.id === tab.notebookId);
      if (nb && nb.sourceType === 'github') {
        const rootPath = nb.sourceConfig.rootPath as string;
        const branch = await ensureWorkingBranch(tab.notebookId, nb);
        const result = await writeGitHubFile(rootPath, tab.path, tab.content, tab.sha, branch);
        return result.sha ?? undefined;
      }
      // Local save
      await saveFileContent(tab.notebookId, tab.path, tab.content);
      return undefined;
    },
    [notebooks, ensureWorkingBranch],
  );

  /** Publish (squash-merge) a notebook's working branch to main */
  const handlePublish = useCallback(
    async (notebookId: string) => {
      const nb = notebooks.find((n) => n.id === notebookId);
      if (!nb || nb.sourceType !== 'github') return;

      const branch = workingBranches.current[notebookId];
      if (!branch) {
        flash('No pending changes to publish');
        return;
      }

      const owner = nb.sourceConfig.owner as string;
      const repo = nb.sourceConfig.repo as string;

      try {
        await publishBranch(owner, repo, branch, 'main', `Notebook.md: update from ${branch}`, true);
        delete workingBranches.current[notebookId];
        setPublishableNotebooks((prev) => {
          const next = new Set(prev);
          next.delete(notebookId);
          return next;
        });
        // Refresh files from main to get updated SHAs
        await refreshFiles(notebookId);
        // Update SHA on open tabs for this notebook (they now point at main)
        setTabs((prev) =>
          prev.map((t) => (t.notebookId === notebookId ? { ...t, sha: undefined } : t)),
        );
        flash('Changes published to main');
      } catch (err) {
        flash(`Publish failed: ${(err as Error).message}`);
      }
    },
    [notebooks, refreshFiles, flash],
  );

  /** Check if a notebook has a working branch with unpublished changes */
  const hasWorkingBranch = useCallback(
    (notebookId: string) => publishableNotebooks.has(notebookId),
    [publishableNotebooks],
  );

  const handleContentChange = useCallback(
    (tabId: string, html: string) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, content: html, hasUnsavedChanges: html !== t.savedContent }
            : t,
        ),
      );

      // Auto-save with debounce (local: 1s, GitHub: 5s to avoid spamming)
      const nb = notebooks.find((n) => {
        const nbId = tabId.split(':')[0];
        return n.id === nbId;
      });
      const delay = nb?.sourceType === 'github' ? 5000 : 1000;

      if (autoSaveTimers.current[tabId]) {
        clearTimeout(autoSaveTimers.current[tabId]);
      }
      autoSaveTimers.current[tabId] = setTimeout(() => {
        // Read fresh state inside the setter to avoid stale closures
        setTabs((prev) => {
          const current = prev.find((t) => t.id === tabId);
          if (current && current.hasUnsavedChanges) {
            saveTab(current)
              .then((newSha) => {
                setTabs((p) =>
                  p.map((t) =>
                    t.id === tabId
                      ? { ...t, savedContent: t.content, hasUnsavedChanges: false, lastSaved: Date.now(), sha: newSha ?? t.sha }
                      : t,
                  ),
                );
              })
              .catch(() => flash('Failed to auto-save'));
          }
          return prev;
        });
      }, delay);
    },
    [flash, notebooks, saveTab],
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
      const newSha = await saveTab(tabToSave);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabToSave!.id
            ? { ...t, savedContent: t.content, hasUnsavedChanges: false, lastSaved: Date.now(), sha: newSha ?? t.sha }
            : t,
        ),
      );
      flash('Saved');
    } catch {
      flash('Failed to save');
    }
  }, [activeTabId, flash, saveTab]);

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
    handleAddNotebook,
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
    handlePublish,
    hasWorkingBranch,
    refreshFiles,
  };
}

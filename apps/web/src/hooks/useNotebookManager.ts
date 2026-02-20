import { useState, useEffect, useCallback, useRef } from 'react';
import { trackEvent, AnalyticsEvents } from './useAnalytics';
import { apiFetch } from '../api/apiFetch.js';
import {
  createNotebook,
  listNotebooks,
  upsertNotebook,
  renameNotebook as renameNb,
  deleteNotebook as deleteNb,
  createFile,
  listFiles,
  saveFileContent,
  renameFile as renameF,
  deleteFile as deleteF,
  moveFile as moveF,
  reorderNotebooks as reorderNbs,
  getFile,
  setStorageScope,
  type NotebookMeta,
  type FileEntry,
} from '../stores/localNotebookStore';
import { markdownToHtml, htmlToMarkdown, isMarkdownContent } from '../components/editor/markdownConverter';
import {
  listGitHubTree,
  readGitHubFile,
  writeGitHubFile,
  createGitHubFile,
  createWorkingBranch,
  publishBranch,
} from '../api/github';
import {
  listOneDriveTree,
  readOneDriveFile,
  writeOneDriveFile,
  createOneDriveFile,
} from '../api/onedrive';
import {
  listGoogleDriveTree,
  readGoogleDriveFile,
  writeGoogleDriveFile,
  createGoogleDriveFile,
} from '../api/googledrive';

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

import type { ToastType } from './useToast';

export type ToastFn = (message: string, type?: ToastType) => void;

export function useNotebookManager(userId?: string | null, toast?: ToastFn) {
  const [notebooks, setNotebooks] = useState<NotebookMeta[]>([]);
  const [files, setFiles] = useState<Record<string, FileEntry[]>>({});
  const [loadingNotebooks, setLoadingNotebooks] = useState<Set<string>>(new Set());
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
      // Sync remote notebooks from server into IndexedDB
      if (userId) {
        try {
          const res = await apiFetch('/api/notebooks');
          if (res.ok) {
            const { notebooks: serverNbs } = await res.json();
            const serverIds = new Set<string>();
            for (const snb of serverNbs) {
              serverIds.add(snb.id);
              await upsertNotebook({
                id: snb.id,
                name: snb.name,
                sourceType: snb.sourceType,
                sourceConfig: snb.sourceConfig ?? {},
                sortOrder: new Date(snb.createdAt).getTime(),
                createdAt: new Date(snb.createdAt).getTime(),
                updatedAt: new Date(snb.updatedAt).getTime(),
              });
            }
            // Remove orphan remote notebooks from IndexedDB (stale local copies)
            const localNbs = await listNotebooks();
            for (const lnb of localNbs) {
              if (lnb.sourceType && lnb.sourceType !== 'local' && !serverIds.has(lnb.id)) {
                await deleteNb(lnb.id);
              }
            }
          }
        } catch {
          // Offline or API error — continue with local data
        }
      }

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

  /** Convert flat tree entries to FileEntry shape with computed parentPath */
  function toFileEntries(
    notebookId: string,
    entries: Array<{ path: string; name: string; type: 'file' | 'folder'; size?: number; lastModified?: string; sha?: string }>,
  ): FileEntry[] {
    return entries
      .filter((e) => {
        if (e.type === 'folder') return true;
        const ext = e.name.split('.').pop()?.toLowerCase() ?? '';
        return EDITABLE_EXTS.has(ext);
      })
      .map((e) => {
        const parts = e.path.split('/');
        parts.pop();
        const parentPath = parts.join('/');
        return {
          path: e.path,
          notebookId,
          name: e.name,
          type: e.type,
          parentPath,
          content: '',
          createdAt: Date.now(),
          updatedAt: e.lastModified ? new Date(e.lastModified).getTime() : Date.now(),
        };
      });
  }

  const refreshFiles = useCallback(async (notebookId: string) => {
    const nb = notebooks.find((n) => n.id === notebookId);
    if (!nb || nb.sourceType === 'local' || !nb.sourceType) {
      const entries = await listFiles(notebookId);
      setFiles((prev) => ({ ...prev, [notebookId]: entries }));
    } else {
      setLoadingNotebooks((prev) => new Set(prev).add(notebookId));
      try {
        const rootPath = nb.sourceConfig.rootPath as string;
        let rawEntries: Array<{ path: string; name: string; type: 'file' | 'folder'; size?: number; lastModified?: string; sha?: string }>;

        if (nb.sourceType === 'github') {
          rawEntries = await listGitHubTree(rootPath);
        } else if (nb.sourceType === 'onedrive') {
          rawEntries = await listOneDriveTree(rootPath);
        } else if (nb.sourceType === 'google-drive') {
          rawEntries = await listGoogleDriveTree(rootPath);
        } else {
          rawEntries = [];
        }

        setFiles((prev) => ({ ...prev, [notebookId]: toFileEntries(notebookId, rawEntries) }));
      } catch (err) {
        toast?.(`Failed to load files: ${(err as Error).message}`, 'error');
      } finally {
        setLoadingNotebooks((prev) => {
          const next = new Set(prev);
          next.delete(notebookId);
          return next;
        });
      }
    }
  }, [notebooks, flash, toast]);

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
        toast?.(`Created notebook "${nb.name}"`, 'success');
      },
    });
  }, [flash, toast]);

  const handleAddNotebook = useCallback(
    async (name: string, sourceType: string, sourceConfig: Record<string, unknown>) => {
      if (sourceType === 'local') {
        const nb = await createNotebook(name, 'local');
        setNotebooks((prev) => [...prev, nb]);
        setFiles((prev) => ({ ...prev, [nb.id]: [] }));
        toast?.(`Created notebook "${nb.name}"`, 'success');
      } else {
        // Remote notebook — also save to server via API
        try {
          const res = await apiFetch('/api/notebooks', {
            method: 'POST',
            body: JSON.stringify({ name, sourceType, sourceConfig }),
          });
          if (!res.ok) throw new Error('Failed to create notebook');
          const { notebook } = await res.json();
          // Store locally using the server's id so there's no id mismatch
          const now = Date.now();
          const nb = {
            id: notebook.id,
            name,
            sourceType: sourceType as NotebookMeta['sourceType'],
            sourceConfig,
            sortOrder: now,
            createdAt: now,
            updatedAt: now,
          };
          await upsertNotebook(nb);
          setNotebooks((prev) => [...prev, nb]);
          setFiles((prev) => ({ ...prev, [nb.id]: [] }));
          toast?.(`Added ${sourceType} notebook "${name}"`, 'success');
        } catch (err) {
          toast?.(`Failed to add notebook: ${(err as Error).message}`, 'error');
        }
      }
    },
    [flash, toast],
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
    toast?.(`Deleted notebook "${nb.name}"`, 'success');
  }, [notebooks, tabs, flash, toast]);

  const handleRenameNotebook = useCallback(async (id: string, name: string) => {
    await renameNb(id, name);
    setNotebooks((prev) => prev.map((n) => (n.id === id ? { ...n, name } : n)));
  }, []);

  // --- Working branch state (must precede file ops that use ensureWorkingBranch) ---

  // Working branch per notebook: notebookId → branch name
  const workingBranches = useRef<Record<string, string>>({});
  const branchCreating = useRef<Record<string, Promise<string>>>({});
  // Default branch per notebook (detected from GitHub)
  const defaultBranches = useRef<Record<string, string>>({});
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
      // Let the backend auto-detect the default branch
      const promise = createWorkingBranch(owner, repo).then((result) => {
        workingBranches.current[notebookId] = result.branch;
        defaultBranches.current[notebookId] = result.defaultBranch;
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
              toast?.(`Created ${type} "${name}"`, 'success');
            } catch (err) {
              toast?.(`Failed to create file: ${(err as Error).message}`, 'error');
            }
          } else if (nb?.sourceType === 'onedrive') {
            const rootPath = nb.sourceConfig.rootPath as string;
            const filePath = parentPath ? `${parentPath}/${name}` : name;
            try {
              await createOneDriveFile(rootPath, filePath, '');
              await refreshFiles(notebookId);
              toast?.(`Created ${type} "${name}"`, 'success');
            } catch (err) {
              toast?.(`Failed to create file: ${(err as Error).message}`, 'error');
            }
          } else if (nb?.sourceType === 'google-drive') {
            const rootFolderId = nb.sourceConfig.rootPath as string;
            const filePath = parentPath ? `${parentPath}/${name}` : name;
            try {
              await createGoogleDriveFile(rootFolderId, filePath, '');
              await refreshFiles(notebookId);
              toast?.(`Created ${type} "${name}"`, 'success');
            } catch (err) {
              toast?.(`Failed to create file: ${(err as Error).message}`, 'error');
            }
          } else {
            await createFile(notebookId, parentPath, name, type);
            await refreshFiles(notebookId);
            toast?.(`Created ${type} "${name}"`, 'success');
          }
        },
      });
    },
    [notebooks, ensureWorkingBranch, refreshFiles, flash, toast],
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
            toast?.(`Imported "${fileName}"`, 'success');
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
                toast?.(`Imported "${fileName}"`, 'success');
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
    [refreshFiles, flash, toast],
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
          toast?.(`Imported "${fileName}"`, 'success');
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
    [refreshFiles, flash, toast],
  );

  /** Import a file directly to a specific notebook + folder (used by drag-drop onto tree) */
  const handleDirectImport = useCallback(
    async (notebookId: string, parentPath: string, fileName: string, content: string) => {
      try {
        const nb = notebooks.find((n) => n.id === notebookId);
        const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
        let entryPath = filePath;
        let entryName = fileName;

        if (nb?.sourceType === 'github') {
          const rootPath = nb.sourceConfig.rootPath as string;
          const branch = await ensureWorkingBranch(notebookId, nb);
          const result = await createGitHubFile(rootPath, filePath, content, branch);
          entryPath = result.path;
        } else if (nb?.sourceType === 'onedrive') {
          const rootPath = nb.sourceConfig.rootPath as string;
          await createOneDriveFile(rootPath, filePath, content);
        } else if (nb?.sourceType === 'google-drive') {
          const rootFolderId = nb.sourceConfig.rootPath as string;
          await createGoogleDriveFile(rootFolderId, filePath, content);
        } else {
          const entry = await createFile(notebookId, parentPath, fileName, 'file', content);
          entryPath = entry.path;
          entryName = entry.name;
        }

        await refreshFiles(notebookId);
        toast?.(`Imported "${fileName}"`, 'success');

        // Auto-open the imported file
        const htmlContent = isMarkdownContent(content) ? markdownToHtml(content) : content;
        const tabId = `${notebookId}:${entryPath}`;
        setTabs((prev) => [...prev, {
          id: tabId, notebookId, path: entryPath, name: entryName,
          content: htmlContent, savedContent: content,
          hasUnsavedChanges: false, lastSaved: Date.now(),
        }]);
        setActiveTabId(tabId);
      } catch (err) {
        toast?.(`Failed to import "${fileName}": ${(err as Error).message}`, 'error');
      }
    },
    [notebooks, ensureWorkingBranch, refreshFiles, toast],
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
      toast?.(`Deleted "${name}"`, 'success');
    },
    [refreshFiles, tabs, flash, toast],
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

      trackEvent(AnalyticsEvents.FILE_OPENED);
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
          toast?.(`Failed to open file: ${(err as Error).message}`, 'error');
        }
        return;
      }

      if (nb && nb.sourceType === 'onedrive') {
        // Fetch from OneDrive API
        try {
          const rootPath = nb.sourceConfig.rootPath as string;
          const file = await readOneDriveFile(rootPath, path);
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
          toast?.(`Failed to open file: ${(err as Error).message}`, 'error');
        }
        return;
      }

      if (nb && nb.sourceType === 'google-drive') {
        // Fetch from Google Drive API
        try {
          const rootFolderId = nb.sourceConfig.rootPath as string;
          const file = await readGoogleDriveFile(rootFolderId, path);
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
          toast?.(`Failed to open file: ${(err as Error).message}`, 'error');
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
    [tabs, notebooks, flash, toast],
  );

  // --- Content change (auto-save) ---

  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  /** Save a tab's content to the appropriate backend */
  const saveTab = useCallback(
    async (tab: OpenTab): Promise<string | undefined> => {
      const nb = notebooks.find((n) => n.id === tab.notebookId);
      // Convert HTML from the WYSIWYG editor back to Markdown for storage
      const markdown = htmlToMarkdown(tab.content);
      if (nb && nb.sourceType === 'github') {
        const rootPath = nb.sourceConfig.rootPath as string;
        const branch = await ensureWorkingBranch(tab.notebookId, nb);
        const result = await writeGitHubFile(rootPath, tab.path, markdown, tab.sha, branch);
        return result.sha ?? undefined;
      }
      if (nb && nb.sourceType === 'onedrive') {
        const rootPath = nb.sourceConfig.rootPath as string;
        const result = await writeOneDriveFile(rootPath, tab.path, markdown, tab.sha);
        return result.sha ?? undefined;
      }
      if (nb && nb.sourceType === 'google-drive') {
        const rootFolderId = nb.sourceConfig.rootPath as string;
        const result = await writeGoogleDriveFile(rootFolderId, tab.path, markdown, tab.sha);
        return result.sha ?? undefined;
      }
      // Local save
      await saveFileContent(tab.notebookId, tab.path, markdown);
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
        toast?.('No pending changes to publish', 'info');
        return;
      }

      const owner = nb.sourceConfig.owner as string;
      const repo = nb.sourceConfig.repo as string;

      try {
        const baseBranch = defaultBranches.current[notebookId] ?? 'main';
        await publishBranch(owner, repo, branch, baseBranch, `Notebook.md: update from ${branch}`, true);
        delete workingBranches.current[notebookId];
        delete defaultBranches.current[notebookId];
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
        toast?.('Changes published to main', 'success');
      } catch (err) {
        toast?.(`Publish failed: ${(err as Error).message}`, 'error');
      }
    },
    [notebooks, refreshFiles, flash, toast],
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
      trackEvent(AnalyticsEvents.FILE_SAVED);
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

  const handleMoveFile = useCallback(async (notebookId: string, oldPath: string, newParentPath: string) => {
    try {
      const notebook = notebooks.find((n) => n.id === notebookId);
      if (notebook && notebook.sourceType !== 'local' && notebook.sourceType) {
        // Remote move not yet supported
        toast?.('File move is not supported for remote notebooks', 'warning');
        return;
      }
      const oldKey = `${notebookId}:${oldPath}`;
      const fileName = oldPath.split('/').pop() || oldPath;
      const newPath = newParentPath ? `${newParentPath}/${fileName}` : fileName;
      const newKey = `${notebookId}:${newPath}`;

      await moveF(notebookId, oldPath, newParentPath);

      // Update any open tab pointing to the old path
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === oldKey
            ? { ...tab, id: newKey, title: tab.title }
            : tab,
        ),
      );
      setActiveTabId((prev) => (prev === oldKey ? newKey : prev));

      // Reload files for this notebook
      const updatedFiles = await listFiles(notebookId);
      setFiles((prev) => ({ ...prev, [notebookId]: updatedFiles }));
    } catch (err) {
      toast?.('Failed to move file', 'error');
    }
  }, [notebooks, toast]);

  const handleReorderNotebooks = useCallback(async (orderedIds: string[]) => {
    try {
      await reorderNbs(orderedIds);
      const nbs = await listNotebooks();
      setNotebooks(nbs);
    } catch (err) {
      toast?.('Failed to reorder notebooks', 'error');
    }
  }, [toast]);

  const handleCopyFile = useCallback(async (
    sourceNotebookId: string,
    sourcePath: string,
    targetNotebookId: string,
    targetParentPath: string,
  ) => {
    try {
      const sourceNb = notebooks.find((n) => n.id === sourceNotebookId);
      const targetNb = notebooks.find((n) => n.id === targetNotebookId);
      if (!sourceNb || !targetNb) return;
      if ((sourceNb.sourceType ?? 'local') !== 'local' || (targetNb.sourceType ?? 'local') !== 'local') {
        toast?.('Cross-notebook copy is only supported between local notebooks', 'warning');
        return;
      }

      const sourceFile = await getFile(sourceNotebookId, sourcePath);
      if (!sourceFile) return;

      const fileName = sourcePath.split('/').pop() || sourcePath;
      await createFile(targetNotebookId, targetParentPath, fileName, sourceFile.type, sourceFile.content ?? '');

      // If the source is a folder, copy children recursively
      if (sourceFile.type === 'folder') {
        const allSourceFiles = await listFiles(sourceNotebookId);
        const children = allSourceFiles.filter((f) => f.parentPath === sourcePath || f.path.startsWith(sourcePath + '/'));
        for (const child of children) {
          const relativePath = child.path.slice(sourcePath.length + 1);
          const newParent = targetParentPath ? `${targetParentPath}/${fileName}` : fileName;
          const parts = relativePath.split('/');
          const childName = parts.pop() || relativePath;
          const childParent = parts.length > 0 ? `${newParent}/${parts.join('/')}` : newParent;
          await createFile(targetNotebookId, childParent, childName, child.type, child.content ?? '');
        }
      }

      // Reload target notebook files
      const updatedFiles = await listFiles(targetNotebookId);
      setFiles((prev) => ({ ...prev, [targetNotebookId]: updatedFiles }));
    } catch (err) {
      toast?.('Failed to copy file', 'error');
    }
  }, [notebooks, toast]);

  // --- Provider unlink cleanup ---
  const PROVIDER_SOURCE_MAP: Record<string, string[]> = {
    microsoft: ['onedrive'],
    google: ['google-drive'],
    github: ['github'],
  };

  const handleProviderUnlinked = useCallback(async (provider: string) => {
    const sourceTypes = PROVIDER_SOURCE_MAP[provider] ?? [];
    if (sourceTypes.length === 0) return;

    const affected = notebooks.filter((n) => n.sourceType && sourceTypes.includes(n.sourceType));
    if (affected.length === 0) return;

    const affectedIds = new Set(affected.map((n) => n.id));

    // Close tabs from affected notebooks
    setTabs((prev) => prev.filter((t) => !affectedIds.has(t.notebookId)));
    setActiveTabId((prev) => {
      if (prev) {
        const tab = tabs.find((t) => t.id === prev);
        if (tab && affectedIds.has(tab.notebookId)) {
          const remaining = tabs.filter((t) => !affectedIds.has(t.notebookId));
          return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        }
      }
      return prev;
    });

    // Remove from local store and state
    for (const nb of affected) {
      await deleteNb(nb.id);
    }
    setNotebooks((prev) => prev.filter((n) => !affectedIds.has(n.id)));
    setFiles((prev) => {
      const next = { ...prev };
      for (const id of affectedIds) delete next[id];
      return next;
    });

    // Clear working branch refs for GitHub
    if (provider === 'github') {
      for (const id of affectedIds) {
        delete workingBranches.current[id];
        delete branchCreating.current[id];
        delete defaultBranches.current[id];
      }
      setPublishableNotebooks((prev) => {
        const next = new Set(prev);
        for (const id of affectedIds) next.delete(id);
        return next;
      });
    }

    toast?.(`Removed ${affected.length} notebook${affected.length > 1 ? 's' : ''} linked to ${provider}`, 'info');
  }, [notebooks, tabs, toast]);

  return {
    notebooks,
    files,
    loadingNotebooks,
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
    handleDirectImport,
    handleDeleteFile,
    handleRenameFile,
    handleOpenFile,
    handleContentChange,
    handleSave,
    handleTabClose,
    handlePublish,
    hasWorkingBranch,
    refreshFiles,
    handleMoveFile,
    handleCopyFile,
    handleReorderNotebooks,
    handleProviderUnlinked,
  };
}

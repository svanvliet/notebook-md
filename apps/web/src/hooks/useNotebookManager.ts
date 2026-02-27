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
  deleteGitHubFile,
  createWorkingBranch,
  publishBranch,
  type PublishResult,
  deleteWorkingBranch,
  checkPrStatus,
  listBranches,
} from '../api/github';
import {
  listOneDriveTree,
  readOneDriveFile,
  writeOneDriveFile,
  createOneDriveFile,
  deleteOneDriveFile,
} from '../api/onedrive';
import {
  listGoogleDriveTree,
  readGoogleDriveFile,
  writeGoogleDriveFile,
  createGoogleDriveFile,
  deleteGoogleDriveFile,
} from '../api/googledrive';
import { listCloudTree, createCloudFile, deleteCloudFile, renameCloudFile } from '../api/cloud';


/** Encode a file path for use in a URL, encoding each segment but preserving `/`. */
function encodeFilePath(filePath: string): string {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

async function readCloudFile(notebookId: string, filePath: string) {
  const res = await apiFetch(`/api/sources/cloud/files/${encodeFilePath(filePath)}?root=${notebookId}`);
  if (!res.ok) {
    const err = new Error('Failed to read cloud file');
    (err as any).status = res.status;
    throw err;
  }
  return res.json() as Promise<{ path: string; name: string; content: string; sha?: string }>;
}

async function writeCloudFile(notebookId: string, filePath: string, content: string) {
  const res = await apiFetch(`/api/sources/cloud/files/${encodeFilePath(filePath)}?root=${notebookId}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Failed to save cloud file');
  return res.json() as Promise<{ path: string; sha?: string }>;
}

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
  /** True while remote file content is being fetched */
  loading?: boolean;
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

export type ToastFn = (message: string, type?: ToastType, action?: { label: string; onClick: () => void }) => void;

export function useNotebookManager(userId?: string | null, toast?: ToastFn, isDemoMode?: boolean) {
  const [notebooks, setNotebooks] = useState<NotebookMeta[]>([]);
  const navigateToFileRef = useRef<((notebookId: string, path: string) => void) | null>(null);
  const [files, setFiles] = useState<Record<string, FileEntry[]>>({});
  const [loadingNotebooks, setLoadingNotebooks] = useState<Set<string>>(new Set());
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [modalRequest, setModalRequest] = useState<ModalRequest | null>(null);
  const [saveLocationRequest, setSaveLocationRequest] = useState<SaveLocationRequest | null>(null);
  const [pendingExpandPath, setPendingExpandPath] = useState<{ notebookId: string; path: string } | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const tabRestorationDone = useRef(false);

  // Persist open tabs to sessionStorage on every change
  useEffect(() => {
    if (!tabRestorationDone.current && tabs.length === 0) return; // Don't clear before restore
    try {
      const data = tabs.map((t) => ({ id: t.id, notebookId: t.notebookId, path: t.path, name: t.name }));
      sessionStorage.setItem('nb:tabs', JSON.stringify(data));
    } catch { /* sessionStorage may be full */ }
  }, [tabs]);

  // Show a temporary status bar message
  const flash = useCallback((msg: string, ms = 2000) => {
    setStatusMessage(msg);
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setStatusMessage(null), ms);
  }, []);

  // Sync remote notebooks from the API into IndexedDB and update React state.
  // Called on initial load and after invite accept/decline to refresh the tree.
  const syncNotebooksFromServer = useCallback(async () => {
    if (!userId || isDemoMode) return;
    try {
      const res = await apiFetch('/api/notebooks');
      if (res.ok) {
        const { notebooks: serverNbs, sharedNotebooks: sharedNbs, pendingInvites: pendingInvs } = await res.json();
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
            hasShares: snb.hasShares ?? false,
          });
        }
        for (const snb of (sharedNbs ?? [])) {
          serverIds.add(snb.id);
          await upsertNotebook({
            id: snb.id,
            name: snb.name,
            sourceType: snb.sourceType,
            sourceConfig: snb.sourceConfig ?? {},
            sortOrder: new Date(snb.createdAt).getTime(),
            createdAt: new Date(snb.createdAt).getTime(),
            updatedAt: new Date(snb.updatedAt).getTime(),
            sharedBy: snb.ownerName,
            sharedPermission: snb.permission,
          });
        }
        for (const inv of (pendingInvs ?? [])) {
          serverIds.add(inv.notebookId);
          await upsertNotebook({
            id: inv.notebookId,
            name: inv.notebookName,
            sourceType: 'cloud',
            sourceConfig: {},
            sortOrder: new Date(inv.invitedAt).getTime(),
            createdAt: new Date(inv.invitedAt).getTime(),
            updatedAt: new Date(inv.invitedAt).getTime(),
            sharedBy: inv.ownerName,
            sharedPermission: inv.permission,
            pendingInvite: {
              shareId: inv.shareId,
              ownerName: inv.ownerName,
              permission: inv.permission,
              invitedAt: inv.invitedAt,
            },
          });
        }
        // Remove orphan remote notebooks from IndexedDB
        const localNbs = await listNotebooks();
        const orphanIds: string[] = [];
        for (const lnb of localNbs) {
          if (lnb.sourceType && lnb.sourceType !== 'local' && !serverIds.has(lnb.id)) {
            await deleteNb(lnb.id);
            orphanIds.push(lnb.id);
          }
        }
        if (orphanIds.length > 0) {
          setTabs((prev) => prev.filter((t) => !orphanIds.includes(t.notebookId)));
          try {
            const raw = sessionStorage.getItem('nb:tree:notebooks');
            if (raw) {
              const expanded: string[] = JSON.parse(raw);
              const filtered = expanded.filter(id => !orphanIds.includes(id));
              sessionStorage.setItem('nb:tree:notebooks', JSON.stringify(filtered));
            }
          } catch { /* ignore */ }
        }
      }
    } catch {
      // Offline or API error — continue with local data
    }
    // Refresh state from IndexedDB
    const nbs = await listNotebooks();
    setNotebooks(nbs);
    const fileMap: Record<string, FileEntry[]> = {};
    for (const nb of nbs) {
      if (nb.sourceType === 'local' || !nb.sourceType) {
        fileMap[nb.id] = await listFiles(nb.id);
      }
    }
    setFiles(fileMap);
  }, [userId, isDemoMode]);

  // Load notebooks and their files when scope changes
  useEffect(() => {
    setStorageScope(userId ?? null);
    setTabs([]);
    setActiveTabId(null);
    (async () => {
      await syncNotebooksFromServer();
      // Reset BEFORE setNotebooks so restoration effect sees false when notebooks trigger re-render
      // (syncNotebooksFromServer already called setNotebooks, but we reset the flag here)
      tabRestorationDone.current = false;
      // Re-read to ensure we have the latest after sync (sync already set state, but
      // tabRestorationDone needs to be false before the render that triggers restoration)
      const nbs = await listNotebooks();
      tabRestorationDone.current = false;
      setNotebooks(nbs);
    })();
  }, [userId]);

  // Poll for permission changes on shared notebooks (every 60s)
  useEffect(() => {
    if (!userId || isDemoMode) return;
    const hasShared = notebooks.some(nb => nb.sharedBy);
    const hasShares = notebooks.some(nb => nb.hasShares);
    if (!hasShared && !hasShares) return;

    const interval = setInterval(async () => {
      try {
        const res = await apiFetch('/api/notebooks');
        if (!res.ok) return;
        const { notebooks: serverNbs, sharedNotebooks: sharedNbs } = await res.json();

        // Check for permission changes on shared notebooks
        for (const snb of (sharedNbs ?? [])) {
          const local = notebooks.find(n => n.id === snb.id);
          if (local && local.sharedPermission !== snb.permission) {
            await upsertNotebook({
              id: snb.id, name: snb.name, sourceType: snb.sourceType,
              sourceConfig: snb.sourceConfig ?? {},
              sortOrder: new Date(snb.createdAt).getTime(),
              createdAt: new Date(snb.createdAt).getTime(),
              updatedAt: new Date(snb.updatedAt).getTime(),
              sharedBy: snb.ownerName,
              sharedPermission: snb.permission,
            });
            if (snb.permission === 'viewer') {
              toast?.(
                `Your access to "${snb.name}" was changed to Viewer`,
                'info',
              );
            } else {
              toast?.(
                `Your access to "${snb.name}" was changed to Editor.`,
                'info',
                { label: 'Refresh to edit', onClick: () => window.location.reload() },
              );
            }
          }
        }

        // Check for hasShares changes on owned notebooks
        for (const snb of serverNbs) {
          const local = notebooks.find(n => n.id === snb.id);
          if (local && local.hasShares !== (snb.hasShares ?? false)) {
            await upsertNotebook({
              id: snb.id, name: snb.name, sourceType: snb.sourceType,
              sourceConfig: snb.sourceConfig ?? {},
              sortOrder: new Date(snb.createdAt).getTime(),
              createdAt: new Date(snb.createdAt).getTime(),
              updatedAt: new Date(snb.updatedAt).getTime(),
              hasShares: snb.hasShares ?? false,
            });
          }
        }

        // Check for revoked shares (notebook disappeared from shared list)
        const sharedIds = new Set((sharedNbs ?? []).map((s: { id: string }) => s.id));
        for (const nb of notebooks) {
          if (nb.sharedBy && !sharedIds.has(nb.id)) {
            await deleteNb(nb.id);
            toast?.(`You were removed from "${nb.name}"`, 'info');
          }
        }

        // Refresh notebook list to reflect changes
        const nbs = await listNotebooks();
        setNotebooks(nbs);
      } catch {
        // Offline or API error — skip this cycle
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [userId, isDemoMode, notebooks, toast]);

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
    // Skip pending invite notebooks — they have no file access yet
    if (nb?.pendingInvite) return;
    if (!nb || nb.sourceType === 'local' || !nb.sourceType) {
      const entries = await listFiles(notebookId);
      setFiles((prev) => ({ ...prev, [notebookId]: entries }));
    } else {
      setLoadingNotebooks((prev) => new Set(prev).add(notebookId));
      try {
        const rootPath = nb.sourceConfig.rootPath as string;
        let rawEntries: Array<{ path: string; name: string; type: 'file' | 'folder'; size?: number; lastModified?: string; sha?: string }>;

        if (nb.sourceType === 'github') {
          const branch = workingBranches.current[notebookId] || (nb.sourceConfig.branch as string) || undefined;
          rawEntries = await listGitHubTree(rootPath, branch);
        } else if (nb.sourceType === 'onedrive') {
          rawEntries = await listOneDriveTree(rootPath);
        } else if (nb.sourceType === 'google-drive') {
          rawEntries = await listGoogleDriveTree(rootPath);
        } else if (nb.sourceType === 'cloud') {
          rawEntries = await listCloudTree(notebookId);
        } else {
          rawEntries = [];
        }

        setFiles((prev) => ({ ...prev, [notebookId]: toFileEntries(notebookId, rawEntries) }));
      } catch (err) {
        // Silently ignore access denied for shared notebooks (revoked access)
        if (nb.sharedBy && (err as any).status === 403) {
          // Revoked access — remove from React state (sync IIFE handles IndexedDB cleanup)
          setNotebooks((prev) => prev.filter((n) => n.id !== notebookId));
          setFiles((prev) => { const next = { ...prev }; delete next[notebookId]; return next; });
          setTabs((prev) => prev.filter((t) => t.notebookId !== notebookId));
        } else {
          toast?.(`Failed to load files: ${(err as Error).message}`, 'error');
        }
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

  // Persist working branches to localStorage so they survive page refresh
  const BRANCH_STORAGE_KEY = 'notebookmd:workingBranches';
  const loadPersistedBranches = useCallback((): Record<string, { branch: string; defaultBranch: string }> => {
    try {
      const raw = localStorage.getItem(BRANCH_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }, []);
  const persistBranches = useCallback((wb: Record<string, string>, db: Record<string, string>) => {
    const data: Record<string, { branch: string; defaultBranch: string }> = {};
    for (const [id, branch] of Object.entries(wb)) {
      data[id] = { branch, defaultBranch: db[id] ?? 'main' };
    }
    try { localStorage.setItem(BRANCH_STORAGE_KEY, JSON.stringify(data)); } catch { /* quota */ }
  }, []);

  // Working branch per notebook: notebookId → branch name
  const workingBranches = useRef<Record<string, string>>({});
  const branchCreating = useRef<Record<string, Promise<string>>>({});
  // Default branch per notebook (detected from GitHub)
  const defaultBranches = useRef<Record<string, string>>({});
  // Reactive set of notebook IDs that have a working branch (for UI)
  const [publishableNotebooks, setPublishableNotebooks] = useState<Set<string>>(new Set());
  // Track notebooks with pending PRs (not yet merged)
  const [pendingPrs, setPendingPrs] = useState<Map<string, { prNumber: number; prUrl: string; deleteBranch: boolean }>>(new Map());

  // Restore persisted working branches on mount
  useEffect(() => {
    const persisted = loadPersistedBranches();
    const ids = Object.keys(persisted);
    if (ids.length === 0) return;
    for (const [id, { branch, defaultBranch }] of Object.entries(persisted)) {
      workingBranches.current[id] = branch;
      defaultBranches.current[id] = defaultBranch;
    }
    setPublishableNotebooks(new Set(ids));
  }, [loadPersistedBranches]);

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
      // Use the branch configured when the notebook was added
      const baseBranch = (nb.sourceConfig.branch as string) || undefined;
      const promise = createWorkingBranch(owner, repo, baseBranch).then((result) => {
        workingBranches.current[notebookId] = result.branch;
        defaultBranches.current[notebookId] = (nb.sourceConfig.branch as string) || result.defaultBranch;
        delete branchCreating.current[notebookId];
        setPublishableNotebooks((prev) => new Set(prev).add(notebookId));
        persistBranches(workingBranches.current, defaultBranches.current);
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
          const filePath = parentPath ? `${parentPath}/${name}` : name;
          const nb = notebooks.find((n) => n.id === notebookId);
          if (nb?.sourceType === 'github') {
            const rootPath = nb.sourceConfig.rootPath as string;
            try {
              const branch = await ensureWorkingBranch(notebookId, nb);
              await createGitHubFile(rootPath, filePath, '', branch);
              await refreshFiles(notebookId);
              toast?.(`Created ${type} "${name}"`, 'success');
            } catch (err) {
              toast?.(`Failed to create file: ${(err as Error).message}`, 'error');
              return;
            }
          } else if (nb?.sourceType === 'onedrive') {
            const rootPath = nb.sourceConfig.rootPath as string;
            try {
              await createOneDriveFile(rootPath, filePath, '');
              await refreshFiles(notebookId);
              toast?.(`Created ${type} "${name}"`, 'success');
            } catch (err) {
              toast?.(`Failed to create file: ${(err as Error).message}`, 'error');
              return;
            }
          } else if (nb?.sourceType === 'google-drive') {
            const rootFolderId = nb.sourceConfig.rootPath as string;
            try {
              await createGoogleDriveFile(rootFolderId, filePath, '');
              await refreshFiles(notebookId);
              toast?.(`Created ${type} "${name}"`, 'success');
            } catch (err) {
              toast?.(`Failed to create file: ${(err as Error).message}`, 'error');
              return;
            }
          } else if (nb?.sourceType === 'cloud') {
            try {
              await createCloudFile(notebookId, filePath, '', type);
              await refreshFiles(notebookId);
              toast?.(`Created ${type} "${name}"`, 'success');
            } catch (err) {
              toast?.(`Failed to create file: ${(err as Error).message}`, 'error');
              return;
            }
          } else {
            await createFile(notebookId, parentPath, name, type);
            await refreshFiles(notebookId);
            toast?.(`Created ${type} "${name}"`, 'success');
          }
          // Expand parent folder and open the new file
          setPendingExpandPath({ notebookId, path: filePath });
          if (type === 'file') {
            const tabId = `${notebookId}:${filePath}`;
            setTabs((prev) => {
              if (prev.some((t) => t.id === tabId)) return prev;
              return [...prev, {
                id: tabId, notebookId, path: filePath, name,
                content: '', savedContent: '',
                hasUnsavedChanges: false, lastSaved: Date.now(),
              }];
            });
            setActiveTabId(tabId);
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
            const nb = notebooks.find((n) => n.id === notebookId);
            const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
            if (nb?.sourceType === 'cloud') {
              await createCloudFile(notebookId, filePath, content);
              await refreshFiles(notebookId);
              toast?.(`Imported "${fileName}"`, 'success');
              const htmlContent = isMarkdownContent(content) ? markdownToHtml(content) : content;
              const tabId = `${notebookId}:${filePath}`;
              setTabs((prev) => [...prev, {
                id: tabId, notebookId, path: filePath, name: fileName,
                content: htmlContent, savedContent: content,
                hasUnsavedChanges: false, lastSaved: Date.now(),
              }]);
              setActiveTabId(tabId);
            } else {
              const entry = await createFile(notebookId, parentPath ?? '', fileName, 'file', content);
              await refreshFiles(notebookId);
              toast?.(`Imported "${fileName}"`, 'success');
              const htmlContent = isMarkdownContent(content) ? markdownToHtml(content) : content;
              const tabId = `${notebookId}:${entry.path}`;
              setTabs((prev) => [...prev, {
                id: tabId, notebookId, path: entry.path, name: entry.name,
                content: htmlContent, savedContent: content,
                hasUnsavedChanges: false, lastSaved: entry.updatedAt,
              }]);
              setActiveTabId(tabId);
            }
          } else {
            // Show save location picker
            setSaveLocationRequest({
              fileName,
              content,
              onSave: async (nbId: string, savePath: string) => {
                setSaveLocationRequest(null);
                const nb = notebooks.find((n) => n.id === nbId);
                const filePath = savePath ? `${savePath}/${fileName}` : fileName;
                if (nb?.sourceType === 'cloud') {
                  await createCloudFile(nbId, filePath, content);
                  await refreshFiles(nbId);
                  toast?.(`Imported "${fileName}"`, 'success');
                  const htmlContent = isMarkdownContent(content) ? markdownToHtml(content) : content;
                  const tabId = `${nbId}:${filePath}`;
                  setTabs((prev) => [...prev, {
                    id: tabId, notebookId: nbId, path: filePath, name: fileName,
                    content: htmlContent, savedContent: content,
                    hasUnsavedChanges: false, lastSaved: Date.now(),
                  }]);
                  setActiveTabId(tabId);
                } else {
                  const entry = await createFile(nbId, savePath, fileName, 'file', content);
                  await refreshFiles(nbId);
                  toast?.(`Imported "${fileName}"`, 'success');
                  const htmlContent = isMarkdownContent(content) ? markdownToHtml(content) : content;
                  const tabId = `${nbId}:${entry.path}`;
                  setTabs((prev) => [...prev, {
                    id: tabId, notebookId: nbId, path: entry.path, name: entry.name,
                    content: htmlContent, savedContent: content,
                    hasUnsavedChanges: false, lastSaved: entry.updatedAt,
                  }]);
                  setActiveTabId(tabId);
                }
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
          const nb = notebooks.find((n) => n.id === nbId);
          const filePath = savePath ? `${savePath}/${fileName}` : fileName;
          if (nb?.sourceType === 'cloud') {
            await createCloudFile(nbId, filePath, content);
            await refreshFiles(nbId);
            toast?.(`Imported "${fileName}"`, 'success');
            const htmlContent = isMarkdownContent(content) ? markdownToHtml(content) : content;
            const tabId = `${nbId}:${filePath}`;
            setTabs((prev) => [...prev, {
              id: tabId, notebookId: nbId, path: filePath, name: fileName,
              content: htmlContent, savedContent: content,
              hasUnsavedChanges: false, lastSaved: Date.now(),
            }]);
            setActiveTabId(tabId);
          } else {
            const entry = await createFile(nbId, savePath, fileName, 'file', content);
            await refreshFiles(nbId);
            toast?.(`Imported "${fileName}"`, 'success');
            const htmlContent = isMarkdownContent(content) ? markdownToHtml(content) : content;
            const tabId = `${nbId}:${entry.path}`;
            setTabs((prev) => [...prev, {
              id: tabId, notebookId: nbId, path: entry.path, name: entry.name,
              content: htmlContent, savedContent: content,
              hasUnsavedChanges: false, lastSaved: entry.updatedAt,
            }]);
            setActiveTabId(tabId);
          }
        },
      });
    },
    [refreshFiles, flash, toast],
  );

  /** Import a file directly to a specific notebook + folder (used by drag-drop onto tree) */
  const handleDirectImport = useCallback(
    async (notebookId: string, parentPath: string, fileName: string, content: string) => {
      try {
        const notebook = notebooks.find((n) => n.id === notebookId);
        const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
        let entryPath = filePath;
        let entryName = fileName;

        if (notebook?.sourceType === 'github') {
          const rootPath = notebook.sourceConfig.rootPath as string;
          const branch = await ensureWorkingBranch(notebookId, notebook);
          const result = await createGitHubFile(rootPath, filePath, content, branch);
          entryPath = result.path;
        } else if (notebook?.sourceType === 'onedrive') {
          const rootPath = notebook.sourceConfig.rootPath as string;
          await createOneDriveFile(rootPath, filePath, content);
        } else if (notebook?.sourceType === 'google-drive') {
          const rootFolderId = notebook.sourceConfig.rootPath as string;
          await createGoogleDriveFile(rootFolderId, filePath, content);
        } else if (notebook?.sourceType === 'cloud') {
          await createCloudFile(notebookId, filePath, content);
        } else {
          const entry = await createFile(notebookId, parentPath, fileName, 'file', content);
          entryPath = entry.path;
          entryName = entry.name;
        }

        await refreshFiles(notebookId);
        toast?.(`Imported "${fileName}"`, 'success');
        setPendingExpandPath({ notebookId, path: entryPath });

        // Auto-open the imported file
        let htmlContent: string;
        try {
          htmlContent = isMarkdownContent(content) ? markdownToHtml(content) : content;
        } catch {
          htmlContent = `<p>${content}</p>`;
        }
        const tabId = `${notebookId}:${entryPath}`;
        setTabs((prev) => {
          // Avoid duplicate tabs
          if (prev.some((t) => t.id === tabId)) return prev;
          return [...prev, {
            id: tabId, notebookId, path: entryPath, name: entryName,
            content: htmlContent, savedContent: content,
            hasUnsavedChanges: false, lastSaved: Date.now(),
          }];
        });
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

      const nb = notebooks.find((n) => n.id === notebookId);
      try {
        if (nb?.sourceType === 'github') {
          const rootPath = nb.sourceConfig.rootPath as string;
          // Find the SHA from the open tab (needed for GitHub delete)
          const openTab = tabs.find((t) => t.id === tabId);
          await deleteGitHubFile(rootPath, path, openTab?.sha);
        } else if (nb?.sourceType === 'onedrive') {
          const rootPath = nb.sourceConfig.rootPath as string;
          await deleteOneDriveFile(rootPath, path);
        } else if (nb?.sourceType === 'google-drive') {
          const rootFolderId = nb.sourceConfig.rootPath as string;
          await deleteGoogleDriveFile(rootFolderId, path);
        } else if (nb?.sourceType === 'cloud') {
          await deleteCloudFile(notebookId, path);
        } else {
          await deleteF(notebookId, path);
        }
        await refreshFiles(notebookId);
        toast?.(`Deleted "${name}"`, 'success');
      } catch (err) {
        toast?.(`Failed to delete "${name}": ${(err as Error).message}`, 'error');
      }
    },
    [notebooks, refreshFiles, tabs, flash, toast],
  );

  const handleRenameFile = useCallback(
    async (notebookId: string, path: string, newName: string) => {
      const nb = notebooks.find((n) => n.id === notebookId);
      const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
      const newPath = parentPath ? `${parentPath}/${newName}` : newName;

      let entry: { path: string; name: string };

      if (nb?.sourceType === 'cloud') {
        await renameCloudFile(notebookId, path, newPath);
        entry = { path: newPath, name: newName };
      } else {
        entry = await renameF(notebookId, path, newName);
      }

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
    [notebooks, refreshFiles],
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
        // Show tab immediately with loading state, then fetch content
        const fileName = path.split('/').pop() || path;
        const loadingTab: OpenTab = {
          id: tabId, notebookId, path, name: fileName,
          content: '', savedContent: '', hasUnsavedChanges: false, lastSaved: null, loading: true,
        };
        setTabs((prev) => prev.some((t) => t.id === tabId) ? prev : [...prev, loadingTab]);
        setActiveTabId(tabId);
        try {
          const rootPath = nb.sourceConfig.rootPath as string;
          const branch = workingBranches.current[notebookId] || (nb.sourceConfig.branch as string) || undefined;
          const file = await readGitHubFile(rootPath, path, branch);
          let content = file.content;
          if (isMarkdownContent(content)) {
            content = markdownToHtml(content);
          }
          setTabs((prev) => prev.map((t) => t.id === tabId
            ? { ...t, name: file.name, content, savedContent: content, sha: file.sha, loading: false }
            : t
          ));
        } catch (err) {
          setTabs((prev) => prev.filter((t) => t.id !== tabId));
          toast?.(`Failed to open file: ${(err as Error).message}`, 'error');
        }
        return;
      }

      if (nb && nb.sourceType === 'onedrive') {
        const fileName = path.split('/').pop() || path;
        const loadingTab: OpenTab = {
          id: tabId, notebookId, path, name: fileName,
          content: '', savedContent: '', hasUnsavedChanges: false, lastSaved: null, loading: true,
        };
        setTabs((prev) => prev.some((t) => t.id === tabId) ? prev : [...prev, loadingTab]);
        setActiveTabId(tabId);
        try {
          const rootPath = nb.sourceConfig.rootPath as string;
          const file = await readOneDriveFile(rootPath, path);
          let content = file.content;
          if (isMarkdownContent(content)) {
            content = markdownToHtml(content);
          }
          setTabs((prev) => prev.map((t) => t.id === tabId
            ? { ...t, name: file.name, content, savedContent: content, sha: file.sha, loading: false }
            : t
          ));
        } catch (err) {
          setTabs((prev) => prev.filter((t) => t.id !== tabId));
          toast?.(`Failed to open file: ${(err as Error).message}`, 'error');
        }
        return;
      }

      if (nb && nb.sourceType === 'google-drive') {
        const fileName = path.split('/').pop() || path;
        const loadingTab: OpenTab = {
          id: tabId, notebookId, path, name: fileName,
          content: '', savedContent: '', hasUnsavedChanges: false, lastSaved: null, loading: true,
        };
        setTabs((prev) => prev.some((t) => t.id === tabId) ? prev : [...prev, loadingTab]);
        setActiveTabId(tabId);
        try {
          const rootFolderId = nb.sourceConfig.rootPath as string;
          const file = await readGoogleDriveFile(rootFolderId, path);
          let content = file.content;
          if (isMarkdownContent(content)) {
            content = markdownToHtml(content);
          }
          setTabs((prev) => prev.map((t) => t.id === tabId
            ? { ...t, name: file.name, content, savedContent: content, sha: file.sha, loading: false }
            : t
          ));
        } catch (err) {
          setTabs((prev) => prev.filter((t) => t.id !== tabId));
          toast?.(`Failed to open file: ${(err as Error).message}`, 'error');
        }
        return;
      }

      if (nb && nb.sourceType === 'cloud') {
        const fileName = path.split('/').pop() || path;
        const loadingTab: OpenTab = {
          id: tabId, notebookId, path, name: fileName,
          content: '', savedContent: '', hasUnsavedChanges: false, lastSaved: null, loading: true,
        };
        setTabs((prev) => prev.some((t) => t.id === tabId) ? prev : [...prev, loadingTab]);
        setActiveTabId(tabId);
        try {
          const file = await readCloudFile(notebookId, path);
          let content = file.content;
          if (isMarkdownContent(content)) {
            content = markdownToHtml(content);
          }
          setTabs((prev) => prev.map((t) => t.id === tabId
            ? { ...t, name: file.name, content, savedContent: content, sha: file.sha, loading: false }
            : t
          ));
        } catch (err) {
          setTabs((prev) => prev.filter((t) => t.id !== tabId));
          // Silently handle access denied for shared notebooks (revoked access)
          if (nb.sharedBy && (err as any).status === 403) {
            // Revoked — remove from React state (sync IIFE handles IndexedDB)
            setNotebooks((prev) => prev.filter((n) => n.id !== notebookId));
            setFiles((prev) => { const next = { ...prev }; delete next[notebookId]; return next; });
            setTabs((prev) => prev.filter((t) => t.notebookId !== notebookId));
          } else {
            toast?.(`Failed to open file: ${(err as Error).message}`, 'error');
          }
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
        savedContent: content,
        hasUnsavedChanges: false,
        lastSaved: entry.updatedAt,
      };

      setTabs((prev) => prev.some((t) => t.id === tabId) ? prev : [...prev, tab]);
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
      if (nb && nb.sourceType === 'cloud') {
        const result = await writeCloudFile(tab.notebookId, tab.path, markdown);
        return result.sha ?? undefined;
      }
      // Local save
      await saveFileContent(tab.notebookId, tab.path, markdown);
      return undefined;
    },
    [notebooks, ensureWorkingBranch],
  );

  /** Publish (merge) a notebook's working branch to a target branch via PR-based squash merge */
  const handlePublish = useCallback(
    async (notebookId: string, targetBranch?: string, shouldDeleteBranch = true, commitMessage?: string, autoMerge = true): Promise<PublishResult | undefined> => {
      const nb = notebooks.find((n) => n.id === notebookId);
      if (!nb || nb.sourceType !== 'github') return;

      const branch = workingBranches.current[notebookId];
      if (!branch) {
        toast?.('No pending changes to publish', 'info');
        return;
      }

      const owner = nb.sourceConfig.owner as string;
      const repo = nb.sourceConfig.repo as string;
      const baseBranch = targetBranch ?? defaultBranches.current[notebookId] ?? 'main';

      try {
        const result = await publishBranch(owner, repo, branch, baseBranch, commitMessage, shouldDeleteBranch, autoMerge);

        if (result.outcome === 'merged') {
          // Clear any pending PR indicator
          setPendingPrs((prev) => {
            const next = new Map(prev);
            next.delete(notebookId);
            return next;
          });
          if (shouldDeleteBranch) {
            // Branch was deleted — clear working branch state
            delete workingBranches.current[notebookId];
            delete defaultBranches.current[notebookId];
            persistBranches(workingBranches.current, defaultBranches.current);
            setPublishableNotebooks((prev) => {
              const next = new Set(prev);
              next.delete(notebookId);
              return next;
            });
          }
          // Refresh files from base branch to get updated SHAs
          await refreshFiles(notebookId);
          setTabs((prev) =>
            prev.map((t) => (t.notebookId === notebookId ? { ...t, sha: undefined } : t)),
          );
          toast?.(`Changes published to ${baseBranch}`, 'success');
        } else if (result.outcome === 'pr_created') {
          setPendingPrs((prev) => {
            const next = new Map(prev);
            next.set(notebookId, { prNumber: result.prNumber!, prUrl: result.prUrl!, deleteBranch: shouldDeleteBranch });
            return next;
          });
          toast?.(`PR #${result.prNumber} created — awaiting approval`, 'info');
        } else if (result.outcome === 'conflict') {
          setPendingPrs((prev) => {
            const next = new Map(prev);
            next.set(notebookId, { prNumber: result.prNumber!, prUrl: result.prUrl!, deleteBranch: shouldDeleteBranch });
            return next;
          });
          toast?.(`Merge conflict — resolve on GitHub`, 'warning');
        } else if (result.outcome === 'permissions_required') {
          // Don't toast — let the modal handle the display with a clickable link
        }

        return result;
      } catch (err) {
        toast?.(`Publish failed: ${(err as Error).message}`, 'error');
      }
    },
    [notebooks, refreshFiles, persistBranches, flash, toast],
  );

  /** Discard working branch — delete it from GitHub without merging */
  const handleDiscard = useCallback(
    async (notebookId: string) => {
      const nb = notebooks.find((n) => n.id === notebookId);
      if (!nb || nb.sourceType !== 'github') return;

      const branch = workingBranches.current[notebookId];
      if (!branch) return;

      const owner = nb.sourceConfig.owner as string;
      const repo = nb.sourceConfig.repo as string;

      try {
        // Close any pending PR before deleting the branch
        const pr = pendingPrs.get(notebookId);
        await deleteWorkingBranch(owner, repo, branch, pr?.prNumber);

        // Clear pending PR state
        setPendingPrs((prev) => {
          const next = new Map(prev);
          next.delete(notebookId);
          return next;
        });

        delete workingBranches.current[notebookId];
        delete defaultBranches.current[notebookId];
        persistBranches(workingBranches.current, defaultBranches.current);
        setPublishableNotebooks((prev) => {
          const next = new Set(prev);
          next.delete(notebookId);
          return next;
        });
        await refreshFiles(notebookId);

        // Reload open tabs for this notebook from the configured branch
        const rootPath = nb.sourceConfig.rootPath as string;
        const configuredBranch = (nb.sourceConfig.branch as string) || undefined;
        const affectedTabs = tabs.filter((t) => t.notebookId === notebookId);
        for (const tab of affectedTabs) {
          try {
            const file = await readGitHubFile(rootPath, tab.path, configuredBranch);
            let content = file.content;
            if (isMarkdownContent(content)) {
              content = markdownToHtml(content);
            }
            setTabs((prev) =>
              prev.map((t) =>
                t.id === tab.id
                  ? { ...t, content, savedContent: content, sha: file.sha, hasUnsavedChanges: false, lastSaved: Date.now() }
                  : t,
              ),
            );
          } catch {
            // File may not exist on default branch (was newly created on working branch) — close the tab
            setTabs((prev) => prev.filter((t) => t.id !== tab.id));
            setActiveTabId((prev) => {
              if (prev === tab.id) {
                const remaining = tabs.filter((t) => t.id !== tab.id && t.notebookId !== notebookId || affectedTabs.every((at) => at.id !== t.id));
                return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
              }
              return prev;
            });
          }
        }

        toast?.('Working branch discarded', 'success');
      } catch (err) {
        toast?.(`Discard failed: ${(err as Error).message}`, 'error');
      }
    },
    [notebooks, tabs, refreshFiles, persistBranches, flash, toast],
  );

  /** Get working branch info for a notebook (for the publish modal) */
  const getWorkingBranchInfo = useCallback(
    (notebookId: string) => {
      const branch = workingBranches.current[notebookId];
      const nb = notebooks.find((n) => n.id === notebookId);
      if (!branch || !nb) return null;
      return {
        branch,
        defaultBranch: defaultBranches.current[notebookId] ?? (nb.sourceConfig.branch as string) ?? 'main',
        owner: nb.sourceConfig.owner as string,
        repo: nb.sourceConfig.repo as string,
      };
    },
    [notebooks],
  );

  /** Check if a notebook has a working branch with unpublished changes */
  const hasWorkingBranch = useCallback(
    (notebookId: string) => publishableNotebooks.has(notebookId),
    [publishableNotebooks],
  );

  // Poll for PR merge status when there are pending PRs
  useEffect(() => {
    if (pendingPrs.size === 0) return;

    const interval = setInterval(async () => {
      for (const [notebookId, pr] of pendingPrs) {
        const nb = notebooks.find((n) => n.id === notebookId);
        if (!nb || nb.sourceType !== 'github') continue;

        const owner = nb.sourceConfig.owner as string;
        const repo = nb.sourceConfig.repo as string;
        const branch = workingBranches.current[notebookId];
        if (!branch) continue;

        try {
          const status = await checkPrStatus(owner, repo, branch);
          if (status.merged) {
            // PR was merged externally — clean up working branch
            if (pr.deleteBranch) {
              try {
                await deleteWorkingBranch(owner, repo, branch);
              } catch {
                // Branch may already be deleted by GitHub's auto-delete setting
              }
            }
            delete workingBranches.current[notebookId];
            delete defaultBranches.current[notebookId];
            persistBranches(workingBranches.current, defaultBranches.current);
            setPublishableNotebooks((prev) => {
              const next = new Set(prev);
              next.delete(notebookId);
              return next;
            });
            setPendingPrs((prev) => {
              const next = new Map(prev);
              next.delete(notebookId);
              return next;
            });
            await refreshFiles(notebookId);
            setTabs((prev) =>
              prev.map((t) => (t.notebookId === notebookId ? { ...t, sha: undefined } : t)),
            );
            toast?.(`PR #${pr.prNumber} merged — notebook refreshed`, 'success');
          } else if (status.status === 'closed') {
            // PR was closed without merging — clear pending PR but keep working branch
            setPendingPrs((prev) => {
              const next = new Map(prev);
              next.delete(notebookId);
              return next;
            });
            toast?.(`PR #${pr.prNumber} was closed without merging. Your changes are still saved — you can re-publish or discard them.`, 'info');
          }
        } catch {
          // Polling failure is not critical — silently retry
        }
      }
    }, 15000); // Poll every 15 seconds

    return () => clearInterval(interval);
  }, [pendingPrs, notebooks, refreshFiles, persistBranches, toast]);

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

  const reloadNotebooks = useCallback(async () => {
    const nbs = await listNotebooks();
    setNotebooks(nbs);
    const fileMap: Record<string, FileEntry[]> = {};
    for (const nb of nbs) {
      if (nb.sourceType === 'local' || !nb.sourceType) {
        fileMap[nb.id] = await listFiles(nb.id);
      }
    }
    setFiles(fileMap);
  }, []);

  // Restore previously open tabs from sessionStorage + URL file (single coordinated flow)
  const restoreTabs = useCallback(async (urlFile?: { notebookId: string; path: string } | null) => {
    if (tabRestorationDone.current) return;
    try {
      const raw = sessionStorage.getItem('nb:tabs');
      const persisted: { id: string; notebookId: string; path: string; name: string }[] =
        raw ? JSON.parse(raw) : [];

      // Build combined list: persisted tabs + URL file (if not already included)
      const toOpen = [...persisted];
      if (urlFile && !toOpen.some((t) => t.notebookId === urlFile.notebookId && t.path === urlFile.path)) {
        toOpen.push({
          id: `${urlFile.notebookId}:${urlFile.path}`,
          notebookId: urlFile.notebookId,
          path: urlFile.path,
          name: urlFile.path.split('/').pop() || '',
        });
      }

      // Open each tab (errors are swallowed for individual tabs)
      // Skip tabs for notebooks that no longer exist (e.g., revoked shares)
      for (const t of toOpen) {
        if (!notebooks.find(n => n.id === t.notebookId)) continue;
        await handleOpenFile(t.notebookId, t.path).catch(() => {});
      }

      // Make the URL file the active tab (if provided)
      if (urlFile) {
        setActiveTabId(`${urlFile.notebookId}:${urlFile.path}`);
      }
    } catch { /* ignore corrupt data */ }
    // Mark restoration as done AFTER all opens complete (prevents premature persistence clearing)
    tabRestorationDone.current = true;
  }, [handleOpenFile, notebooks]);

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

      const srcLocal = (sourceNb.sourceType ?? 'local') === 'local';
      const tgtLocal = (targetNb.sourceType ?? 'local') === 'local';
      const tgtCloud = targetNb.sourceType === 'cloud';

      // Allow: local-to-local or any-to-cloud
      if (!(srcLocal && tgtLocal) && !tgtCloud) {
        toast?.('Cross-notebook copy is only supported to local or Cloud notebooks', 'warning');
        return;
      }

      const sourceFile = await getFile(sourceNotebookId, sourcePath);
      if (!sourceFile) return;

      const fileName = sourcePath.split('/').pop() || sourcePath;
      const filePath = targetParentPath ? `${targetParentPath}/${fileName}` : fileName;

      if (tgtCloud) {
        await createCloudFile(targetNotebookId, filePath, sourceFile.content ?? '', sourceFile.type);
      } else {
        await createFile(targetNotebookId, targetParentPath, fileName, sourceFile.type, sourceFile.content ?? '');
      }

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
          const childPath = `${childParent}/${childName}`;
          if (tgtCloud) {
            await createCloudFile(targetNotebookId, childPath, child.content ?? '', child.type);
          } else {
            await createFile(targetNotebookId, childParent, childName, child.type, child.content ?? '');
          }
        }
      }

      toast?.(tgtCloud ? 'File copied to Cloud notebook' : 'File copied', 'success');

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
      persistBranches(workingBranches.current, defaultBranches.current);
    }

    toast?.(`Removed ${affected.length} notebook${affected.length > 1 ? 's' : ''} linked to ${provider}`, 'info');
  }, [notebooks, tabs, toast]);

  // --- Deep link: intercept relative .md link clicks from editor ---
  useEffect(() => {
    const handler = (e: Event) => {
      const { href } = (e as CustomEvent<{ href: string }>).detail;
      if (!activeTabId) return;
      const [notebookId, ...pathParts] = activeTabId.split(':');
      const currentPath = pathParts.join(':');
      // Decode URL-encoded characters (e.g. %20 → space)
      const decoded = decodeURIComponent(href);
      // Resolve relative path against current file's directory
      const currentDir = currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/')) : '';
      let resolved = decoded.startsWith('./') ? decoded.slice(2) : decoded;
      if (currentDir) resolved = `${currentDir}/${resolved}`;
      // Normalize: collapse any .. or . segments
      const segments = resolved.split('/');
      const normalized: string[] = [];
      for (const seg of segments) {
        if (seg === '..') normalized.pop();
        else if (seg !== '.') normalized.push(seg);
      }
      const resolvedPath = normalized.join('/');
      // Use navigateToFile (URL-based) if available, otherwise fall back to direct open
      if (navigateToFileRef.current) {
        navigateToFileRef.current(notebookId, resolvedPath);
      } else {
        handleOpenFile(notebookId, resolvedPath);
      }
      setPendingExpandPath({ notebookId, path: resolvedPath });
    };
    window.addEventListener('notebook-link-click', handler);
    return () => window.removeEventListener('notebook-link-click', handler);
  }, [activeTabId, handleOpenFile]);

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
    handleDiscard,
    hasWorkingBranch,
    getWorkingBranchInfo,
    refreshFiles,
    handleMoveFile,
    handleCopyFile,
    handleReorderNotebooks,
    handleProviderUnlinked,
    pendingExpandPath,
    clearPendingExpandPath: useCallback(() => setPendingExpandPath(null), []),
    expandToFile: useCallback((notebookId: string, path: string) => setPendingExpandPath({ notebookId, path }), []),
    reloadNotebooks,
    syncNotebooksFromServer,
    restoreTabs,
    pendingPrs,
    /** Set the navigation callback for URL-based routing of link clicks */
    setNavigateToFile: useCallback((fn: ((notebookId: string, path: string) => void) | null) => {
      navigateToFileRef.current = fn;
    }, []),
  };
}

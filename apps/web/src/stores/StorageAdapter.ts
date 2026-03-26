/**
 * StorageAdapter — abstract interface for local notebook storage.
 *
 * Implementations:
 *   - IndexedDB (web): localNotebookStore.ts
 *   - Filesystem (desktop): tauriNotebookStore.ts
 */

// Re-export types from the canonical source
export type { NotebookMeta, FileEntry } from './localNotebookStore';

import type { NotebookMeta, FileEntry } from './localNotebookStore';

export interface StorageAdapter {
  setStorageScope(userId: string | null): void;

  // Notebook CRUD
  createNotebook(
    name: string,
    sourceType?: NotebookMeta['sourceType'],
    sourceConfig?: Record<string, unknown>,
  ): Promise<NotebookMeta>;
  upsertNotebook(notebook: NotebookMeta): Promise<void>;
  listNotebooks(): Promise<NotebookMeta[]>;
  renameNotebook(id: string, name: string): Promise<void>;
  deleteNotebook(id: string): Promise<void>;
  reorderNotebooks(orderedIds: string[]): Promise<void>;

  // File/Folder CRUD
  createFile(
    notebookId: string,
    parentPath: string,
    name: string,
    type: 'file' | 'folder',
    content?: string,
  ): Promise<FileEntry>;
  getFile(notebookId: string, path: string): Promise<FileEntry | undefined>;
  listFiles(notebookId: string): Promise<FileEntry[]>;
  listChildren(notebookId: string, parentPath: string): Promise<FileEntry[]>;
  saveFileContent(notebookId: string, path: string, content: string): Promise<void>;
  renameFile(notebookId: string, oldPath: string, newName: string): Promise<FileEntry>;
  deleteFile(notebookId: string, path: string): Promise<void>;
  moveFile(notebookId: string, oldPath: string, newParentPath: string): Promise<FileEntry>;
  ensureAssetsFolder(notebookId: string, parentPath: string): Promise<string>;
}

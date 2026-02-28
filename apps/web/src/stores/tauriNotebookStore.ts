/**
 * Tauri filesystem adapter — uses Tauri invoke() commands for all storage ops.
 * Each method maps to a Rust command in apps/desktop/src-tauri/src/.
 *
 * This adapter is only used when running inside Tauri (desktop app).
 */

import type { StorageAdapter } from './StorageAdapter';
import type { NotebookMeta, FileEntry } from './localNotebookStore';

// Lazy import to avoid bundling @tauri-apps/api in web builds
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}

export class TauriFilesystemAdapter implements StorageAdapter {
  setStorageScope(_userId: string | null): void {
    // Desktop notebooks are scoped by OS user, not by app user.
    // The Rust backend handles user-level isolation via the app data directory.
  }

  async createNotebook(
    name: string,
    sourceType: NotebookMeta['sourceType'] = 'local',
    sourceConfig: Record<string, unknown> = {},
  ): Promise<NotebookMeta> {
    return invoke('create_notebook', { name, sourceType, sourceConfig });
  }

  async upsertNotebook(notebook: NotebookMeta): Promise<void> {
    return invoke('upsert_notebook', { notebook });
  }

  async listNotebooks(): Promise<NotebookMeta[]> {
    return invoke('list_notebooks');
  }

  async renameNotebook(id: string, name: string): Promise<void> {
    return invoke('rename_notebook', { id, name });
  }

  async deleteNotebook(id: string): Promise<void> {
    return invoke('delete_notebook', { id });
  }

  async reorderNotebooks(orderedIds: string[]): Promise<void> {
    return invoke('reorder_notebooks', { orderedIds });
  }

  async createFile(
    notebookId: string,
    parentPath: string,
    name: string,
    type: 'file' | 'folder',
    content = '',
  ): Promise<FileEntry> {
    return invoke('create_file', { notebookId, parentPath, name, fileType: type, content });
  }

  async getFile(notebookId: string, path: string): Promise<FileEntry | undefined> {
    return invoke('get_file', { notebookId, path });
  }

  async listFiles(notebookId: string): Promise<FileEntry[]> {
    return invoke('list_notebook_files', { notebookId });
  }

  async listChildren(notebookId: string, parentPath: string): Promise<FileEntry[]> {
    return invoke('list_children', { notebookId, parentPath });
  }

  async saveFileContent(notebookId: string, path: string, content: string): Promise<void> {
    return invoke('write_file', { notebookId, path, content });
  }

  async renameFile(notebookId: string, oldPath: string, newName: string): Promise<FileEntry> {
    return invoke('rename_file', { notebookId, oldPath, newName });
  }

  async deleteFile(notebookId: string, path: string): Promise<void> {
    return invoke('delete_file', { notebookId, path });
  }

  async moveFile(notebookId: string, oldPath: string, newParentPath: string): Promise<FileEntry> {
    return invoke('move_file', { notebookId, oldPath, newParentPath });
  }

  async ensureAssetsFolder(notebookId: string, parentPath: string): Promise<string> {
    return invoke('ensure_assets_folder', { notebookId, parentPath });
  }
}

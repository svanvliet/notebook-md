/**
 * IndexedDB adapter — wraps the existing localNotebookStore module functions
 * into the StorageAdapter interface for use via the adapter factory.
 */

import type { StorageAdapter } from './StorageAdapter';
import * as store from './localNotebookStore';

export class IndexedDBAdapter implements StorageAdapter {
  setStorageScope(userId: string | null): void {
    store.setStorageScope(userId);
  }

  createNotebook = store.createNotebook;
  upsertNotebook = store.upsertNotebook;
  listNotebooks = store.listNotebooks;
  renameNotebook = store.renameNotebook;
  deleteNotebook = store.deleteNotebook;
  reorderNotebooks = store.reorderNotebooks;
  createFile = store.createFile;
  getFile = store.getFile;
  listFiles = store.listFiles;
  listChildren = store.listChildren;
  saveFileContent = store.saveFileContent;
  renameFile = store.renameFile;
  deleteFile = store.deleteFile;
  moveFile = store.moveFile;
  ensureAssetsFolder = store.ensureAssetsFolder;
}

/**
 * Storage adapter factory — detects the runtime environment and returns
 * the appropriate StorageAdapter implementation.
 *
 * - In a browser: IndexedDBAdapter (web)
 * - In Tauri: TauriFilesystemAdapter (desktop)
 */

import type { StorageAdapter } from './StorageAdapter';
import { IndexedDBAdapter } from './IndexedDBAdapter';
import { TauriFilesystemAdapter } from './tauriNotebookStore';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

let _adapter: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (_adapter) return _adapter;

  _adapter = isTauriEnvironment()
    ? new TauriFilesystemAdapter()
    : new IndexedDBAdapter();

  return _adapter;
}

/** Returns true when running inside the Tauri desktop app. */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
}

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StorageAdapter } from '../stores/StorageAdapter';
import { IndexedDBAdapter } from '../stores/IndexedDBAdapter';
import { TauriFilesystemAdapter } from '../stores/tauriNotebookStore';

// Mock localNotebookStore so we don't need a real IndexedDB
vi.mock('../stores/localNotebookStore', () => ({
  setStorageScope: vi.fn(),
  createNotebook: vi.fn().mockResolvedValue({ id: '1', name: 'Test' }),
  upsertNotebook: vi.fn().mockResolvedValue(undefined),
  listNotebooks: vi.fn().mockResolvedValue([]),
  renameNotebook: vi.fn().mockResolvedValue(undefined),
  deleteNotebook: vi.fn().mockResolvedValue(undefined),
  reorderNotebooks: vi.fn().mockResolvedValue(undefined),
  createFile: vi.fn().mockResolvedValue({ path: 'test.md', name: 'test.md', type: 'file' }),
  getFile: vi.fn().mockResolvedValue({ path: 'test.md', content: '# Hello' }),
  listFiles: vi.fn().mockResolvedValue([]),
  listChildren: vi.fn().mockResolvedValue([]),
  saveFileContent: vi.fn().mockResolvedValue(undefined),
  renameFile: vi.fn().mockResolvedValue({ path: 'new.md', name: 'new.md' }),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  moveFile: vi.fn().mockResolvedValue({ path: 'folder/test.md' }),
  ensureAssetsFolder: vi.fn().mockResolvedValue('assets'),
}));

describe('StorageAdapter – IndexedDBAdapter', () => {
  let adapter: StorageAdapter;

  beforeEach(() => {
    adapter = new IndexedDBAdapter();
  });

  it('implements all StorageAdapter methods', () => {
    const methods: (keyof StorageAdapter)[] = [
      'setStorageScope', 'createNotebook', 'upsertNotebook', 'listNotebooks',
      'renameNotebook', 'deleteNotebook', 'reorderNotebooks',
      'createFile', 'getFile', 'listFiles', 'listChildren',
      'saveFileContent', 'renameFile', 'deleteFile', 'moveFile', 'ensureAssetsFolder',
    ];
    for (const method of methods) {
      expect(typeof adapter[method]).toBe('function');
    }
  });

  it('delegates createNotebook to the underlying store', async () => {
    const result = await adapter.createNotebook('My Notebook');
    expect(result).toEqual({ id: '1', name: 'Test' });
  });

  it('delegates listNotebooks to the underlying store', async () => {
    const result = await adapter.listNotebooks();
    expect(result).toEqual([]);
  });

  it('delegates getFile to the underlying store', async () => {
    const result = await adapter.getFile('nb1', 'test.md');
    expect(result).toEqual({ path: 'test.md', content: '# Hello' });
  });
});

describe('StorageAdapter – TauriFilesystemAdapter', () => {
  it('implements all StorageAdapter methods', () => {
    const adapter: StorageAdapter = new TauriFilesystemAdapter();
    const methods: (keyof StorageAdapter)[] = [
      'setStorageScope', 'createNotebook', 'upsertNotebook', 'listNotebooks',
      'renameNotebook', 'deleteNotebook', 'reorderNotebooks',
      'createFile', 'getFile', 'listFiles', 'listChildren',
      'saveFileContent', 'renameFile', 'deleteFile', 'moveFile', 'ensureAssetsFolder',
    ];
    for (const method of methods) {
      expect(typeof adapter[method]).toBe('function');
    }
  });
});

describe('storageAdapterFactory', () => {
  beforeEach(() => {
    // Reset the cached adapter between tests
    vi.resetModules();
  });

  it('returns IndexedDBAdapter in browser environment', async () => {
    delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
    const { getStorageAdapter, isTauriEnvironment } = await import('../stores/storageAdapterFactory');
    expect(isTauriEnvironment()).toBe(false);
    const adapter = getStorageAdapter();
    expect(adapter.constructor.name).toBe('IndexedDBAdapter');
  });

  it('returns TauriFilesystemAdapter in Tauri environment', async () => {
    (window as Record<string, unknown>).__TAURI_INTERNALS__ = { __tauriModule: 'mock' };
    const { getStorageAdapter, isTauriEnvironment } = await import('../stores/storageAdapterFactory');
    expect(isTauriEnvironment()).toBe(true);
    const adapter = getStorageAdapter();
    expect(adapter.constructor.name).toBe('TauriFilesystemAdapter');
    delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it('caches the adapter instance', async () => {
    delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
    const { getStorageAdapter } = await import('../stores/storageAdapterFactory');
    const a1 = getStorageAdapter();
    const a2 = getStorageAdapter();
    expect(a1).toBe(a2);
  });
});

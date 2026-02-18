import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  createNotebook,
  listNotebooks,
  reorderNotebooks,
  createFile,
  listFiles,
  moveFile,
  setStorageScope,
} from '../stores/localNotebookStore';

describe('localNotebookStore', () => {
  beforeEach(() => {
    // Reset scope to use a fresh DB per test
    setStorageScope(`test-${Date.now()}-${Math.random()}`);
  });

  describe('reorderNotebooks', () => {
    it('persists notebook order via sortOrder', async () => {
      const nb1 = await createNotebook('First', 'local');
      const nb2 = await createNotebook('Second', 'local');
      const nb3 = await createNotebook('Third', 'local');

      // Reorder: Third, First, Second
      await reorderNotebooks([nb3.id, nb1.id, nb2.id]);
      const nbs = await listNotebooks();
      expect(nbs.map((n) => n.name)).toEqual(['Third', 'First', 'Second']);
    });

    it('handles single notebook', async () => {
      const nb1 = await createNotebook('Only', 'local');
      await reorderNotebooks([nb1.id]);
      const nbs = await listNotebooks();
      expect(nbs).toHaveLength(1);
      expect(nbs[0].name).toBe('Only');
    });
  });

  describe('moveFile', () => {
    it('moves a file to a different folder', async () => {
      const nb = await createNotebook('Test', 'local');
      await createFile(nb.id, '', 'docs', 'folder');
      await createFile(nb.id, '', 'readme.md', 'file', '# Hello');

      await moveFile(nb.id, 'readme.md', 'docs');

      const files = await listFiles(nb.id);
      const moved = files.find((f) => f.name === 'readme.md');
      expect(moved).toBeDefined();
      expect(moved!.path).toBe('docs/readme.md');
      expect(moved!.parentPath).toBe('docs');
    });

    it('moves a file to root', async () => {
      const nb = await createNotebook('Test', 'local');
      await createFile(nb.id, '', 'docs', 'folder');
      await createFile(nb.id, 'docs', 'readme.md', 'file', '# Hello');

      await moveFile(nb.id, 'docs/readme.md', '');

      const files = await listFiles(nb.id);
      const moved = files.find((f) => f.name === 'readme.md');
      expect(moved).toBeDefined();
      expect(moved!.path).toBe('readme.md');
      expect(moved!.parentPath).toBe('');
    });

    it('moves a folder with children', async () => {
      const nb = await createNotebook('Test', 'local');
      await createFile(nb.id, '', 'src', 'folder');
      await createFile(nb.id, 'src', 'index.md', 'file', '# Index');
      await createFile(nb.id, '', 'archive', 'folder');

      await moveFile(nb.id, 'src', 'archive');

      const files = await listFiles(nb.id);
      const movedFolder = files.find((f) => f.name === 'src' && f.type === 'folder');
      const movedFile = files.find((f) => f.name === 'index.md');
      expect(movedFolder).toBeDefined();
      expect(movedFolder!.path).toBe('archive/src');
      expect(movedFile).toBeDefined();
      expect(movedFile!.path).toBe('archive/src/index.md');
      expect(movedFile!.parentPath).toBe('archive/src');
    });

    it('throws if file not found', async () => {
      const nb = await createNotebook('Test', 'local');
      await expect(moveFile(nb.id, 'nonexistent.md', 'docs')).rejects.toThrow();
    });
  });

  describe('notebook sortOrder', () => {
    it('new notebooks have sortOrder set', async () => {
      const nb = await createNotebook('Test', 'local');
      expect(nb.sortOrder).toBeDefined();
      expect(typeof nb.sortOrder).toBe('number');
    });

    it('listNotebooks returns sorted by sortOrder', async () => {
      // Create in quick succession — timestamps may be same
      const nb1 = await createNotebook('A', 'local');
      const nb2 = await createNotebook('B', 'local');

      // Force reverse order
      await reorderNotebooks([nb2.id, nb1.id]);
      const nbs = await listNotebooks();
      expect(nbs[0].id).toBe(nb2.id);
      expect(nbs[1].id).toBe(nb1.id);
    });
  });
});

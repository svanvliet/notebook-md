import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  createNotebook,
  listNotebooks,
  reorderNotebooks,
  createFile,
  listFiles,
  getFile,
  moveFile,
  ensureAssetsFolder,
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

  describe('cross-notebook copy', () => {
    it('copies a file from one notebook to another', async () => {
      const src = await createNotebook('Source', 'local');
      const tgt = await createNotebook('Target', 'local');
      await createFile(src.id, '', 'readme.md', 'file', '# Hello');

      // Simulate copy: read from source, create in target
      const sourceFile = await getFile(src.id, 'readme.md');
      expect(sourceFile).toBeDefined();
      await createFile(tgt.id, '', sourceFile!.name, sourceFile!.type, sourceFile!.content ?? '');

      const tgtFiles = await listFiles(tgt.id);
      const copied = tgtFiles.find((f) => f.name === 'readme.md');
      expect(copied).toBeDefined();
      expect(copied!.content).toBe('# Hello');
      expect(copied!.notebookId).toBe(tgt.id);

      // Original still exists
      const srcFiles = await listFiles(src.id);
      expect(srcFiles.find((f) => f.name === 'readme.md')).toBeDefined();
    });

    it('copies a folder with children to another notebook', async () => {
      const src = await createNotebook('Source', 'local');
      const tgt = await createNotebook('Target', 'local');
      await createFile(src.id, '', 'docs', 'folder');
      await createFile(src.id, 'docs', 'intro.md', 'file', '# Intro');
      await createFile(src.id, 'docs', 'guide.md', 'file', '# Guide');

      // Copy folder and children
      await createFile(tgt.id, '', 'docs', 'folder');
      const allSrc = await listFiles(src.id);
      const children = allSrc.filter((f) => f.parentPath === 'docs' && f.type === 'file');
      for (const child of children) {
        await createFile(tgt.id, 'docs', child.name, child.type, child.content ?? '');
      }

      const tgtFiles = await listFiles(tgt.id);
      expect(tgtFiles).toHaveLength(3); // folder + 2 files
      expect(tgtFiles.find((f) => f.name === 'intro.md')?.content).toBe('# Intro');
      expect(tgtFiles.find((f) => f.name === 'guide.md')?.content).toBe('# Guide');
    });

    it('copies a file into a subfolder of another notebook', async () => {
      const src = await createNotebook('Source', 'local');
      const tgt = await createNotebook('Target', 'local');
      await createFile(src.id, '', 'notes.md', 'file', '# Notes');
      await createFile(tgt.id, '', 'archive', 'folder');

      const sourceFile = await getFile(src.id, 'notes.md');
      expect(sourceFile).toBeDefined();
      await createFile(tgt.id, 'archive', sourceFile!.name, sourceFile!.type, sourceFile!.content ?? '');

      const tgtFiles = await listFiles(tgt.id);
      const copied = tgtFiles.find((f) => f.name === 'notes.md');
      expect(copied).toBeDefined();
      expect(copied!.path).toBe('archive/notes.md');
      expect(copied!.parentPath).toBe('archive');
      expect(copied!.content).toBe('# Notes');
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

  describe('ensureAssetsFolder', () => {
    it('creates assets folder at root if it does not exist', async () => {
      const nb = await createNotebook('Test', 'local');
      const assetsPath = await ensureAssetsFolder(nb.id, '');
      expect(assetsPath).toBe('assets');

      const files = await listFiles(nb.id);
      const folder = files.find((f) => f.path === 'assets');
      expect(folder).toBeDefined();
      expect(folder!.type).toBe('folder');
    });

    it('does not duplicate if assets folder already exists', async () => {
      const nb = await createNotebook('Test', 'local');
      await ensureAssetsFolder(nb.id, '');
      await ensureAssetsFolder(nb.id, '');

      const files = await listFiles(nb.id);
      const folders = files.filter((f) => f.path === 'assets');
      expect(folders).toHaveLength(1);
    });

    it('creates assets folder under a parent path', async () => {
      const nb = await createNotebook('Test', 'local');
      await createFile(nb.id, '', 'docs', 'folder');
      const assetsPath = await ensureAssetsFolder(nb.id, 'docs');
      expect(assetsPath).toBe('docs/assets');

      const folder = await getFile(nb.id, 'docs/assets');
      expect(folder).toBeDefined();
      expect(folder!.type).toBe('folder');
    });
  });

  describe('upsertNotebook', () => {
    it('inserts a new notebook by id', async () => {
      const { upsertNotebook } = await import('../stores/localNotebookStore');
      const nb = {
        id: 'server-nb-1',
        name: 'Remote NB',
        sourceType: 'github' as const,
        sourceConfig: { owner: 'test', repo: 'repo' },
        sortOrder: 100,
        createdAt: 100,
        updatedAt: 200,
      };
      await upsertNotebook(nb);
      const nbs = await listNotebooks();
      const found = nbs.find((n) => n.id === 'server-nb-1');
      expect(found).toBeDefined();
      expect(found!.name).toBe('Remote NB');
      expect(found!.sourceType).toBe('github');
    });

    it('updates existing notebook without duplicating', async () => {
      const { upsertNotebook } = await import('../stores/localNotebookStore');
      const nb = {
        id: 'server-nb-2',
        name: 'Original',
        sourceType: 'onedrive' as const,
        sourceConfig: {},
        sortOrder: 100,
        createdAt: 100,
        updatedAt: 200,
      };
      await upsertNotebook(nb);
      await upsertNotebook({ ...nb, name: 'Updated' });

      const nbs = await listNotebooks();
      const matching = nbs.filter((n) => n.id === 'server-nb-2');
      expect(matching).toHaveLength(1);
      expect(matching[0].name).toBe('Updated');
    });

    it('does not overwrite local notebooks', async () => {
      const { upsertNotebook } = await import('../stores/localNotebookStore');
      const local = await createNotebook('Local NB', 'local');
      await upsertNotebook({
        id: 'server-nb-3',
        name: 'Remote',
        sourceType: 'github' as const,
        sourceConfig: {},
        sortOrder: 999,
        createdAt: 999,
        updatedAt: 999,
      });
      const nbs = await listNotebooks();
      expect(nbs.find((n) => n.id === local.id)?.name).toBe('Local NB');
      expect(nbs.find((n) => n.id === 'server-nb-3')?.name).toBe('Remote');
    });
  });
});

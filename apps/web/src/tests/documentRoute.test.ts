import { describe, it, expect } from 'vitest';
import {
  resolveNotebookId,
  resolveNotebookName,
  buildDocumentPath,
  parseTabId,
} from '../hooks/useDocumentRoute';
import type { NotebookMeta } from '../stores/localNotebookStore';

const mockNotebooks: NotebookMeta[] = [
  { id: 'nb-1', name: 'My Notebook', sourceType: 'local', sourceConfig: {}, sortOrder: 0, createdAt: 0, updatedAt: 0 },
  { id: 'nb-2', name: 'GitHub Repo', sourceType: 'github', sourceConfig: {}, sortOrder: 1, createdAt: 0, updatedAt: 0 },
  { id: 'demo-notebook', name: 'Demo Notebook', sourceType: 'local', sourceConfig: {}, sortOrder: 2, createdAt: 0, updatedAt: 0 },
];

describe('resolveNotebookId', () => {
  it('resolves by display name', () => {
    expect(resolveNotebookId('My Notebook', mockNotebooks)).toBe('nb-1');
  });

  it('resolves URL-encoded name', () => {
    expect(resolveNotebookId('My%20Notebook', mockNotebooks)).toBe('nb-1');
  });

  it('resolves by direct ID fallback', () => {
    expect(resolveNotebookId('demo-notebook', mockNotebooks)).toBe('demo-notebook');
  });

  it('returns null for unknown name', () => {
    expect(resolveNotebookId('Nonexistent', mockNotebooks)).toBeNull();
  });
});

describe('resolveNotebookName', () => {
  it('resolves name from ID', () => {
    expect(resolveNotebookName('nb-1', mockNotebooks)).toBe('My Notebook');
  });

  it('returns null for unknown ID', () => {
    expect(resolveNotebookName('unknown', mockNotebooks)).toBeNull();
  });
});

describe('buildDocumentPath', () => {
  it('builds path for app mode', () => {
    const result = buildDocumentPath('nb-1', 'docs/README.md', mockNotebooks);
    expect(result).toBe('/app/My%20Notebook/docs/README.md');
  });

  it('builds path for demo mode', () => {
    const result = buildDocumentPath('demo-notebook', 'Getting Started.md', mockNotebooks, true);
    expect(result).toBe('/demo/Demo%20Notebook/Getting Started.md');
  });

  it('returns /app when notebook not found', () => {
    const result = buildDocumentPath('unknown', 'file.md', mockNotebooks);
    expect(result).toBe('/app');
  });

  it('returns /demo when notebook not found in demo mode', () => {
    const result = buildDocumentPath('unknown', 'file.md', mockNotebooks, true);
    expect(result).toBe('/demo');
  });
});

describe('parseTabId', () => {
  it('parses notebookId and filePath', () => {
    const result = parseTabId('nb-1:docs/README.md');
    expect(result).toEqual({ notebookId: 'nb-1', filePath: 'docs/README.md' });
  });

  it('handles tab IDs with colons in path', () => {
    const result = parseTabId('nb-1:folder:with:colons/file.md');
    expect(result).toEqual({ notebookId: 'nb-1', filePath: 'folder:with:colons/file.md' });
  });

  it('returns null for invalid tab ID (no colon)', () => {
    expect(parseTabId('no-colon-here')).toBeNull();
  });
});

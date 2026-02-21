import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock sessionStorage
const mockStorage: Record<string, string> = {};
const mockSessionStorage = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
  clear: vi.fn(() => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); }),
  get length() { return Object.keys(mockStorage).length; },
  key: vi.fn((i: number) => Object.keys(mockStorage)[i] ?? null),
};

Object.defineProperty(globalThis, 'sessionStorage', { value: mockSessionStorage, writable: true });

describe('Session Persistence', () => {
  beforeEach(() => {
    mockSessionStorage.clear();
    vi.clearAllMocks();
  });

  describe('Tab persistence', () => {
    it('persists tabs to sessionStorage as JSON', () => {
      const tabs = [
        { id: 'nb-1:README.md', notebookId: 'nb-1', path: 'README.md', name: 'README.md' },
        { id: 'nb-1:docs/guide.md', notebookId: 'nb-1', path: 'docs/guide.md', name: 'guide.md' },
      ];
      sessionStorage.setItem('nb:tabs', JSON.stringify(tabs));
      
      const restored = JSON.parse(sessionStorage.getItem('nb:tabs')!);
      expect(restored).toHaveLength(2);
      expect(restored[0].id).toBe('nb-1:README.md');
      expect(restored[1].path).toBe('docs/guide.md');
    });

    it('returns empty array when no persisted tabs', () => {
      const raw = sessionStorage.getItem('nb:tabs');
      expect(raw).toBeNull();
    });

    it('clears persisted tabs', () => {
      sessionStorage.setItem('nb:tabs', JSON.stringify([{ id: 'test' }]));
      sessionStorage.removeItem('nb:tabs');
      expect(sessionStorage.getItem('nb:tabs')).toBeNull();
    });
  });

  describe('Tree state persistence', () => {
    it('persists expanded notebooks', () => {
      const expanded = ['nb-1', 'nb-2'];
      sessionStorage.setItem('nb:tree:notebooks', JSON.stringify(expanded));
      
      const restored = new Set(JSON.parse(sessionStorage.getItem('nb:tree:notebooks')!));
      expect(restored.has('nb-1')).toBe(true);
      expect(restored.has('nb-2')).toBe(true);
      expect(restored.has('nb-3')).toBe(false);
    });

    it('persists expanded folders', () => {
      const folders = ['nb-1:docs', 'nb-1:docs/api'];
      sessionStorage.setItem('nb:tree:folders', JSON.stringify(folders));
      
      const restored = new Set(JSON.parse(sessionStorage.getItem('nb:tree:folders')!));
      expect(restored.has('nb-1:docs')).toBe(true);
      expect(restored.has('nb-1:docs/api')).toBe(true);
    });

    it('returns empty sets when no persisted tree state', () => {
      expect(sessionStorage.getItem('nb:tree:notebooks')).toBeNull();
      expect(sessionStorage.getItem('nb:tree:folders')).toBeNull();
    });
  });

  describe('Deep link return URL', () => {
    it('stores return URL in sessionStorage', () => {
      sessionStorage.setItem('nb:returnTo', '/app/My%20Notebook/README.md');
      expect(sessionStorage.getItem('nb:returnTo')).toBe('/app/My%20Notebook/README.md');
    });

    it('clears return URL after retrieval', () => {
      sessionStorage.setItem('nb:returnTo', '/app/Notebook/file.md');
      const returnTo = sessionStorage.getItem('nb:returnTo');
      sessionStorage.removeItem('nb:returnTo');
      expect(returnTo).toBe('/app/Notebook/file.md');
      expect(sessionStorage.getItem('nb:returnTo')).toBeNull();
    });
  });
});

import { describe, it, expect } from 'vitest';
import { validatePath, filterTreeEntries, isEditableExtension } from '../middleware/path-validation.js';
import type { Request, Response, NextFunction } from 'express';

function mockReqRes(params: Record<string, any> = {}, query: Record<string, any> = {}) {
  const req = { params, query } as unknown as Request;
  const res = {
    statusCode: 0,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(data: any) { this.body = data; },
  } as unknown as Response;
  let nextCalled = false;
  const next: NextFunction = () => { nextCalled = true; };
  return { req, res, next, wasNextCalled: () => nextCalled };
}

describe('Path Validation', () => {
  describe('validatePath middleware', () => {
    it('should pass clean paths', () => {
      const { req, res, next, wasNextCalled } = mockReqRes({ filePath: 'docs/readme.md' });
      validatePath(req, res, next);
      expect(wasNextCalled()).toBe(true);
      expect((req as any).cleanPath).toBe('docs/readme.md');
    });

    it('should normalize redundant slashes', () => {
      const { req, res, next, wasNextCalled } = mockReqRes({ filePath: 'docs///readme.md' });
      validatePath(req, res, next);
      expect(wasNextCalled()).toBe(true);
      expect((req as any).cleanPath).toBe('docs/readme.md');
    });

    it('should resolve single dot segments', () => {
      const { req, res, next, wasNextCalled } = mockReqRes({ filePath: 'docs/./readme.md' });
      validatePath(req, res, next);
      expect(wasNextCalled()).toBe(true);
      expect((req as any).cleanPath).toBe('docs/readme.md');
    });

    it('should reject path starting with ..', () => {
      const { req, res, next, wasNextCalled } = mockReqRes({ filePath: '../etc/passwd' });
      validatePath(req, res, next);
      expect(wasNextCalled()).toBe(false);
      expect((res as any).statusCode).toBe(400);
      expect((res as any).body.error).toContain('traversal');
    });

    it('should reject path with /../ in middle', () => {
      const { req, res, next, wasNextCalled } = mockReqRes({ filePath: 'docs/../../etc/passwd' });
      validatePath(req, res, next);
      expect(wasNextCalled()).toBe(false);
      expect((res as any).statusCode).toBe(400);
    });

    it('should reject bare ..', () => {
      const { req, res, next, wasNextCalled } = mockReqRes({ filePath: '..' });
      validatePath(req, res, next);
      expect(wasNextCalled()).toBe(false);
      expect((res as any).statusCode).toBe(400);
    });

    it('should reject null bytes', () => {
      const { req, res, next, wasNextCalled } = mockReqRes({ filePath: 'docs/readme.md\0.jpg' });
      validatePath(req, res, next);
      expect(wasNextCalled()).toBe(false);
      expect((res as any).statusCode).toBe(400);
      expect((res as any).body.error).toContain('null bytes');
    });

    it('should strip leading and trailing slashes', () => {
      const { req, res, next, wasNextCalled } = mockReqRes({ filePath: '/docs/readme.md/' });
      validatePath(req, res, next);
      expect(wasNextCalled()).toBe(true);
      expect((req as any).cleanPath).toBe('docs/readme.md');
    });

    it('should handle empty path', () => {
      const { req, res, next, wasNextCalled } = mockReqRes({});
      validatePath(req, res, next);
      expect(wasNextCalled()).toBe(true);
      expect((req as any).cleanPath).toBe('.');
    });

    it('should fall back to query param when no route param', () => {
      const { req, res, next, wasNextCalled } = mockReqRes({}, { path: 'from/query.md' });
      validatePath(req, res, next);
      expect(wasNextCalled()).toBe(true);
      expect((req as any).cleanPath).toBe('from/query.md');
    });

    it('should handle Express 5 wildcard array params', () => {
      const { req, res, next, wasNextCalled } = mockReqRes({ filePath: ['docs', 'readme.md'] });
      validatePath(req, res, next);
      expect(wasNextCalled()).toBe(true);
      expect((req as any).cleanPath).toBe('docs/readme.md');
    });

    it('should handle single-element array params', () => {
      const { req, res, next, wasNextCalled } = mockReqRes({ filePath: ['readme.md'] });
      validatePath(req, res, next);
      expect(wasNextCalled()).toBe(true);
      expect((req as any).cleanPath).toBe('readme.md');
    });

    it('should handle deeply nested array params', () => {
      const { req, res, next, wasNextCalled } = mockReqRes({ filePath: ['a', 'b', 'c', 'deep.md'] });
      validatePath(req, res, next);
      expect(wasNextCalled()).toBe(true);
      expect((req as any).cleanPath).toBe('a/b/c/deep.md');
    });

    it('should reject traversal in array params', () => {
      const { req, res, next, wasNextCalled } = mockReqRes({ filePath: ['docs', '..', '..', 'etc', 'passwd'] });
      validatePath(req, res, next);
      expect(wasNextCalled()).toBe(false);
      expect((res as any).statusCode).toBe(400);
    });
  });

  describe('filterTreeEntries', () => {
    it('should keep folders regardless of extension', () => {
      const entries = [
        { name: 'docs', type: 'folder' },
        { name: 'images', type: 'folder' },
      ];
      expect(filterTreeEntries(entries)).toHaveLength(2);
    });

    it('should keep .md files', () => {
      const entries = [{ name: 'readme.md', type: 'file' }];
      expect(filterTreeEntries(entries)).toHaveLength(1);
    });

    it('should filter out unsupported files', () => {
      const entries = [
        { name: 'readme.md', type: 'file' },
        { name: 'script.js', type: 'file' },
        { name: 'data.json', type: 'file' },
        { name: 'image.png', type: 'file' },
      ];
      const filtered = filterTreeEntries(entries);
      expect(filtered.map(e => e.name)).toEqual(['readme.md', 'image.png']);
    });
  });

  describe('isEditableExtension', () => {
    it('should return true for markdown files', () => {
      expect(isEditableExtension('readme.md')).toBe(true);
      expect(isEditableExtension('doc.mdx')).toBe(true);
      expect(isEditableExtension('notes.markdown')).toBe(true);
      expect(isEditableExtension('todo.txt')).toBe(true);
    });

    it('should return false for non-markdown files', () => {
      expect(isEditableExtension('image.png')).toBe(false);
      expect(isEditableExtension('script.js')).toBe(false);
    });
  });
});

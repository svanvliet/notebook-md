import { normalize, resolve, posix } from 'path';
import type { Request, Response, NextFunction } from 'express';

/**
 * Supported file extensions for the file tree view.
 * Files outside this list are hidden in directory listings (but can still be accessed directly).
 */
const TREE_EXTENSIONS = new Set([
  '.md', '.mdx', '.markdown', '.txt',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
]);

/**
 * Validate and canonicalize a file path from the request.
 * - Resolves `.` and `..` segments
 * - Rejects paths that escape the root (directory traversal)
 * - Strips leading/trailing slashes for consistency
 * - Stores cleaned path on `req.cleanPath`
 */
export function validatePath(req: Request, res: Response, next: NextFunction): void {
  // In Express 5, wildcard params ({*filePath}) are arrays of path segments
  const rawParam = (req.params as any).filePath;
  const rawPath = Array.isArray(rawParam) ? rawParam.join('/') : rawParam ?? req.query.path as string ?? '';

  // Normalize: resolve . and .., collapse multiple slashes
  const cleaned = posix.normalize(rawPath).replace(/^\/+|\/+$/g, '');

  // Check for traversal: the normalized path must not start with ..
  if (cleaned.startsWith('..') || cleaned.includes('/../') || cleaned === '..') {
    res.status(400).json({ error: 'Invalid path: directory traversal not allowed' });
    return;
  }

  // Check for null bytes (path injection)
  if (cleaned.includes('\0')) {
    res.status(400).json({ error: 'Invalid path: null bytes not allowed' });
    return;
  }

  (req as any).cleanPath = cleaned;
  next();
}

/**
 * Filter a list of file entries to only those with supported extensions.
 * Folders are always included.
 */
export function filterTreeEntries(entries: { name: string; type: string }[]): typeof entries {
  return entries.filter(e => {
    if (e.type === 'folder') return true;
    const ext = e.name.toLowerCase().slice(e.name.lastIndexOf('.'));
    return TREE_EXTENSIONS.has(ext);
  });
}

/**
 * Check if a file extension is editable in the Markdown editor.
 */
export function isEditableExtension(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return ['.md', '.mdx', '.markdown', '.txt'].includes(ext);
}

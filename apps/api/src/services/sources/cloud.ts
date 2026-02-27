import { query } from '../../db/pool.js';
import { encrypt, decrypt } from '../../lib/encryption.js';
import { updateStorageUsage } from '../usageAccounting.js';
import { registerSourceAdapter } from './types.js';
import type { SourceAdapter, FileEntry, FileContent, WriteResult } from './types.js';
import { createHash } from 'crypto';

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

class CloudAdapter implements SourceAdapter {
  readonly provider = 'cloud';

  /**
   * For Cloud, rootPath is the notebook UUID. accessToken is unused (auth is via session).
   */

  async listFiles(_accessToken: string, rootPath: string, dirPath: string): Promise<FileEntry[]> {
    const notebookId = rootPath;
    const prefix = dirPath ? `${dirPath}/` : '';

    const result = await query<{
      path: string;
      size_bytes: number;
      updated_at: Date;
    }>(
      'SELECT path, size_bytes, updated_at FROM cloud_documents WHERE notebook_id = $1 AND path LIKE $2 ORDER BY path',
      [notebookId, `${prefix}%`],
    );

    return result.rows.map(row => {
      const isFolder = row.path.endsWith('/');
      const displayPath = isFolder ? row.path.slice(0, -1) : row.path;
      const name = displayPath.split('/').pop() || displayPath;
      return {
        path: displayPath,
        name,
        type: (isFolder ? 'folder' : 'file') as 'file' | 'folder',
        size: row.size_bytes,
        lastModified: row.updated_at.toISOString(),
      };
    });
  }

  async listTree(_accessToken: string, rootPath: string): Promise<FileEntry[]> {
    return this.listFiles('', rootPath, '');
  }

  async readFile(_accessToken: string, rootPath: string, filePath: string): Promise<FileContent> {
    const notebookId = rootPath;

    const result = await query<{
      id: string;
      content_enc: string | null;
      content_hash: string | null;
      updated_at: Date;
    }>(
      'SELECT id, content_enc, content_hash, updated_at FROM cloud_documents WHERE notebook_id = $1 AND path = $2',
      [notebookId, filePath],
    );

    if (result.rows.length === 0) {
      throw new Error('File not found');
    }

    const row = result.rows[0];
    const content = row.content_enc ? decrypt(row.content_enc) : '';

    return {
      path: filePath,
      name: filePath.split('/').pop() || filePath,
      content,
      encoding: 'utf-8',
      sha: row.content_hash ?? undefined,
      lastModified: row.updated_at.toISOString(),
      documentId: row.id,
    };
  }

  async writeFile(_accessToken: string, rootPath: string, filePath: string, content: string): Promise<WriteResult> {
    const notebookId = rootPath;
    const encrypted = encrypt(content);
    const contentHash = hashContent(content);
    const sizeBytes = Buffer.byteLength(content, 'utf-8');

    // Get old size for delta calculation
    const oldResult = await query<{ size_bytes: number }>(
      'SELECT size_bytes FROM cloud_documents WHERE notebook_id = $1 AND path = $2',
      [notebookId, filePath],
    );
    const oldSize = oldResult.rows[0]?.size_bytes ?? 0;

    await query(
      `UPDATE cloud_documents SET content_enc = $1, content_hash = $2, size_bytes = $3, updated_at = now()
       WHERE notebook_id = $4 AND path = $5`,
      [encrypted, contentHash, sizeBytes, notebookId, filePath],
    );

    // Update storage usage (delta)
    const ownerResult = await query<{ user_id: string }>(
      'SELECT user_id FROM notebooks WHERE id = $1',
      [notebookId],
    );
    if (ownerResult.rows[0]) {
      await updateStorageUsage(ownerResult.rows[0].user_id, sizeBytes - oldSize);
    }

    return { path: filePath, sha: contentHash };
  }

  async createFile(_accessToken: string, rootPath: string, filePath: string, content: string): Promise<WriteResult> {
    const notebookId = rootPath;

    // Look up notebook owner for usage tracking
    const ownerResult = await query<{ user_id: string }>(
      'SELECT user_id FROM notebooks WHERE id = $1',
      [notebookId],
    );
    const userId = ownerResult.rows[0]?.user_id;

    // Folder creation: path ends with /
    if (filePath.endsWith('/')) {
      await query(
        `INSERT INTO cloud_documents (notebook_id, path, content_enc, size_bytes, created_by, updated_by)
         VALUES ($1, $2, NULL, 0, $3, $3)
         ON CONFLICT (notebook_id, path) DO NOTHING`,
        [notebookId, filePath, userId],
      );
      return { path: filePath.slice(0, -1), sha: '' };
    }

    const encrypted = encrypt(content);
    const contentHash = hashContent(content);
    const sizeBytes = Buffer.byteLength(content, 'utf-8');

    await query(
      `INSERT INTO cloud_documents (notebook_id, path, content_enc, content_hash, size_bytes, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6)`,
      [notebookId, filePath, encrypted, contentHash, sizeBytes, userId],
    );

    // Update storage usage
    if (userId) {
      await updateStorageUsage(userId, sizeBytes);
    }

    return { path: filePath, sha: contentHash };
  }

  async deleteFile(_accessToken: string, rootPath: string, filePath: string): Promise<void> {
    const notebookId = rootPath;

    // Delete the file itself AND any children (if folder sentinel or prefix)
    const sizeResult = await query<{ total: string }>(
      `SELECT COALESCE(SUM(size_bytes), 0) as total FROM cloud_documents
       WHERE notebook_id = $1 AND (path = $2 OR path = $3 OR path LIKE $4)`,
      [notebookId, filePath, `${filePath}/`, `${filePath}/%`],
    );
    const totalBytes = parseInt(sizeResult.rows[0].total, 10);

    await query(
      `DELETE FROM cloud_documents WHERE notebook_id = $1 AND (path = $2 OR path = $3 OR path LIKE $4)`,
      [notebookId, filePath, `${filePath}/`, `${filePath}/%`],
    );

    // Decrement storage usage
    const ownerResult = await query<{ user_id: string }>(
      'SELECT user_id FROM notebooks WHERE id = $1',
      [notebookId],
    );
    if (ownerResult.rows[0] && totalBytes > 0) {
      await updateStorageUsage(ownerResult.rows[0].user_id, -totalBytes);
    }
  }

  async renameFile(_accessToken: string, rootPath: string, oldPath: string, newPath: string): Promise<WriteResult> {
    const notebookId = rootPath;

    // Try renaming as a single file first
    const result = await query<{ content_hash: string }>(
      `UPDATE cloud_documents SET path = $1, updated_at = now()
       WHERE notebook_id = $2 AND path = $3
       RETURNING content_hash`,
      [newPath, notebookId, oldPath],
    );

    if (result.rows.length > 0) {
      return { path: newPath, sha: result.rows[0].content_hash };
    }

    // Not a file — try renaming as a folder (stored with trailing /)
    const oldFolderPath = oldPath.endsWith('/') ? oldPath : `${oldPath}/`;
    const newFolderPath = newPath.endsWith('/') ? newPath : `${newPath}/`;

    // Rename the folder entry itself
    await query(
      `UPDATE cloud_documents SET path = $1, updated_at = now()
       WHERE notebook_id = $2 AND path = $3`,
      [newFolderPath, notebookId, oldFolderPath],
    );

    // Rename all children (replace old prefix with new prefix)
    await query(
      `UPDATE cloud_documents
       SET path = $1 || substring(path FROM $2), updated_at = now()
       WHERE notebook_id = $3 AND path LIKE $4 AND path != $5`,
      [newFolderPath, String(oldFolderPath.length + 1), notebookId, `${oldFolderPath}%`, oldFolderPath],
    );

    return { path: newPath, sha: '' };
  }
}

// Register at module load
registerSourceAdapter(new CloudAdapter());

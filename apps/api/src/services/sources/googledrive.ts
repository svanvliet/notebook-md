/**
 * Google Drive source adapter — implements SourceAdapter using Google Drive API v3.
 *
 * Unlike OneDrive (path-based), Google Drive is ID-based. The rootPath stores the
 * folder ID selected during notebook setup. We resolve path segments to file IDs
 * by querying children by name within parent folders.
 */

import { logger } from '../../lib/logger.js';
import type { SourceAdapter, FileEntry, FileContent, WriteResult } from './types.js';
import { registerSourceAdapter } from './types.js';

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Resolve a relative path (e.g., "subfolder/file.md") to a Google Drive file ID
 * by walking each segment from the parent folder.
 */
async function resolvePathToId(
  accessToken: string,
  parentId: string,
  relativePath: string,
): Promise<string | null> {
  if (!relativePath) return parentId;

  const segments = relativePath.split('/').filter(Boolean);
  let currentId = parentId;

  for (const segment of segments) {
    const q = `name='${segment.replace(/'/g, "\\'")}' and '${currentId}' in parents and trashed=false`;
    const url = `${DRIVE_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`;
    const res = await fetch(url, { headers: headers(accessToken) });

    if (!res.ok) {
      logger.error('Google Drive resolve path failed', { status: res.status, segment, parentId: currentId });
      return null;
    }

    const data = (await res.json()) as { files: Array<{ id: string; name: string }> };
    if (data.files.length === 0) return null;
    currentId = data.files[0].id;
  }

  return currentId;
}

/** Get the parent folder ID for a file path. */
function parentPath(filePath: string): string {
  const parts = filePath.split('/');
  parts.pop();
  return parts.join('/');
}

const googleDriveAdapter: SourceAdapter = {
  provider: 'google-drive',

  async listFiles(accessToken: string, rootFolderId: string, dirPath: string): Promise<FileEntry[]> {
    const folderId = dirPath
      ? await resolvePathToId(accessToken, rootFolderId, dirPath)
      : rootFolderId;

    if (!folderId) {
      throw new Error('Google Drive: folder not found');
    }

    const q = `'${folderId}' in parents and trashed=false`;
    const fields = 'files(id,name,mimeType,size,modifiedTime)';
    const url = `${DRIVE_BASE}/files?q=${encodeURIComponent(q)}&fields=${fields}&pageSize=200&orderBy=folder,name`;
    const res = await fetch(url, { headers: headers(accessToken) });

    if (!res.ok) {
      const body = await res.text();
      logger.error('Google Drive listFiles failed', { status: res.status, body, folderId });
      throw new Error(`Google Drive: failed to list files (${res.status})`);
    }

    const data = (await res.json()) as {
      files: Array<{
        id: string;
        name: string;
        mimeType: string;
        size?: string;
        modifiedTime?: string;
      }>;
    };

    return data.files.map((item) => ({
      path: dirPath ? `${dirPath}/${item.name}` : item.name,
      name: item.name,
      type: item.mimeType === 'application/vnd.google-apps.folder' ? 'folder' as const : 'file' as const,
      size: item.size ? Number(item.size) : undefined,
      lastModified: item.modifiedTime,
      sha: item.id, // Store file ID in sha field for updates
    }));
  },

  async readFile(accessToken: string, rootFolderId: string, filePath: string): Promise<FileContent> {
    const fileId = await resolvePathToId(accessToken, rootFolderId, filePath);
    if (!fileId) {
      throw new Error(`Google Drive: file not found: ${filePath}`);
    }

    // Get metadata
    const metaUrl = `${DRIVE_BASE}/files/${fileId}?fields=id,name,modifiedTime`;
    const metaRes = await fetch(metaUrl, { headers: headers(accessToken) });
    const meta = metaRes.ok
      ? (await metaRes.json()) as { id: string; name: string; modifiedTime?: string }
      : { id: fileId, name: filePath.split('/').pop() ?? filePath };

    // Get content
    const contentUrl = `${DRIVE_BASE}/files/${fileId}?alt=media`;
    const contentRes = await fetch(contentUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!contentRes.ok) {
      const body = await contentRes.text();
      logger.error('Google Drive readFile failed', { status: contentRes.status, body, filePath });
      throw new Error(`Google Drive: failed to read file (${contentRes.status})`);
    }

    const content = await contentRes.text();
    const name = filePath.split('/').pop() ?? filePath;

    return {
      path: filePath,
      name,
      content,
      encoding: 'utf-8',
      sha: fileId,
      lastModified: (meta as { modifiedTime?: string }).modifiedTime,
    };
  },

  async writeFile(accessToken: string, rootFolderId: string, filePath: string, content: string): Promise<WriteResult> {
    const fileId = await resolvePathToId(accessToken, rootFolderId, filePath);
    if (!fileId) {
      throw new Error(`Google Drive: file not found for write: ${filePath}`);
    }

    const url = `${UPLOAD_BASE}/files/${fileId}?uploadType=media`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'text/markdown',
      },
      body: content,
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error('Google Drive writeFile failed', { status: res.status, body, filePath });
      throw new Error(`Google Drive: failed to write file (${res.status})`);
    }

    const data = (await res.json()) as { id: string };
    return {
      path: filePath,
      sha: data.id,
      message: 'File saved to Google Drive',
    };
  },

  async createFile(accessToken: string, rootFolderId: string, filePath: string, content: string): Promise<WriteResult> {
    // Resolve parent folder ID
    const parent = parentPath(filePath);
    const parentId = parent
      ? await resolvePathToId(accessToken, rootFolderId, parent)
      : rootFolderId;

    if (!parentId) {
      throw new Error(`Google Drive: parent folder not found: ${parent}`);
    }

    const fileName = filePath.split('/').pop()!;

    // Multipart upload: metadata + content
    const boundary = '----NotebookMdBoundary';
    const metadata = JSON.stringify({
      name: fileName,
      parents: [parentId],
      mimeType: 'text/markdown',
    });

    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      `--${boundary}`,
      'Content-Type: text/markdown',
      '',
      content,
      `--${boundary}--`,
    ].join('\r\n');

    const url = `${UPLOAD_BASE}/files?uploadType=multipart`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    if (!res.ok) {
      const resBody = await res.text();
      logger.error('Google Drive createFile failed', { status: res.status, body: resBody, filePath });
      throw new Error(`Google Drive: failed to create file (${res.status})`);
    }

    const data = (await res.json()) as { id: string };
    return {
      path: filePath,
      sha: data.id,
      message: 'File created on Google Drive',
    };
  },

  async deleteFile(accessToken: string, rootFolderId: string, filePath: string): Promise<void> {
    const fileId = await resolvePathToId(accessToken, rootFolderId, filePath);
    if (!fileId) return; // Already gone

    // Move to trash instead of permanent delete (safer)
    const url = `${DRIVE_BASE}/files/${fileId}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: headers(accessToken),
      body: JSON.stringify({ trashed: true }),
    });

    if (!res.ok && res.status !== 404) {
      const body = await res.text();
      logger.error('Google Drive deleteFile failed', { status: res.status, body, filePath });
      throw new Error(`Google Drive: failed to delete file (${res.status})`);
    }
  },

  async renameFile(accessToken: string, rootFolderId: string, oldPath: string, newPath: string): Promise<WriteResult> {
    const fileId = await resolvePathToId(accessToken, rootFolderId, oldPath);
    if (!fileId) {
      throw new Error(`Google Drive: file not found for rename: ${oldPath}`);
    }

    const newName = newPath.split('/').pop()!;
    const oldParent = parentPath(oldPath);
    const newParent = parentPath(newPath);

    const body: Record<string, unknown> = { name: newName };

    // If moving to a different folder
    if (oldParent !== newParent) {
      const oldParentId = oldParent
        ? await resolvePathToId(accessToken, rootFolderId, oldParent)
        : rootFolderId;
      const newParentId = newParent
        ? await resolvePathToId(accessToken, rootFolderId, newParent)
        : rootFolderId;

      if (!newParentId) {
        throw new Error(`Google Drive: target folder not found: ${newParent}`);
      }

      // Drive API uses addParents/removeParents query params for moves
      const url = `${DRIVE_BASE}/files/${fileId}?addParents=${newParentId}&removeParents=${oldParentId}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: headers(accessToken),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const resBody = await res.text();
        logger.error('Google Drive renameFile (move) failed', { status: res.status, body: resBody });
        throw new Error(`Google Drive: failed to move file (${res.status})`);
      }

      const data = (await res.json()) as { id: string };
      return { path: newPath, sha: data.id, message: 'File moved on Google Drive' };
    }

    // Simple rename
    const url = `${DRIVE_BASE}/files/${fileId}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: headers(accessToken),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const resBody = await res.text();
      logger.error('Google Drive renameFile failed', { status: res.status, body: resBody });
      throw new Error(`Google Drive: failed to rename file (${res.status})`);
    }

    const data = (await res.json()) as { id: string };
    return { path: newPath, sha: data.id, message: 'File renamed on Google Drive' };
  },
};

// Register on import
registerSourceAdapter(googleDriveAdapter);

export default googleDriveAdapter;

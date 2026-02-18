/**
 * OneDrive source adapter — implements SourceAdapter using Microsoft Graph API.
 *
 * rootPath is the OneDrive folder path (e.g., "Notebooks/MyProject").
 * All operations use the /me/drive/root:/path: pattern for path-based access.
 */

import { logger } from '../../lib/logger.js';
import type { SourceAdapter, FileEntry, FileContent, WriteResult } from './types.js';
import { registerSourceAdapter } from './types.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/** Build the Graph API path for a OneDrive item. Empty itemPath = root folder. */
function driveItemPath(rootPath: string, itemPath: string): string {
  const full = itemPath ? `${rootPath}/${itemPath}` : rootPath;
  // /me/drive/root:/path:/children  or  /me/drive/root:/path:/content
  return `/me/drive/root:/${encodeURIComponent(full).replace(/%2F/g, '/')}:`;
}

const oneDriveAdapter: SourceAdapter = {
  provider: 'onedrive',

  async listFiles(accessToken: string, rootPath: string, dirPath: string): Promise<FileEntry[]> {
    const drivePath = dirPath
      ? `${driveItemPath(rootPath, dirPath)}/children`
      : `${driveItemPath(rootPath, '')}/children`;

    const url = `${GRAPH_BASE}${drivePath}?$select=name,size,lastModifiedDateTime,folder,file&$top=200`;
    const res = await fetch(url, { headers: headers(accessToken) });

    if (!res.ok) {
      const body = await res.text();
      logger.error('OneDrive listFiles failed', { status: res.status, body, rootPath, dirPath });
      throw new Error(`OneDrive: failed to list files (${res.status})`);
    }

    const data = (await res.json()) as {
      value: Array<{
        name: string;
        size?: number;
        lastModifiedDateTime?: string;
        folder?: { childCount: number };
        file?: { mimeType: string };
      }>;
    };

    return data.value.map((item) => ({
      path: dirPath ? `${dirPath}/${item.name}` : item.name,
      name: item.name,
      type: item.folder ? 'folder' as const : 'file' as const,
      size: item.size,
      lastModified: item.lastModifiedDateTime,
    }));
  },

  async readFile(accessToken: string, rootPath: string, filePath: string): Promise<FileContent> {
    const url = `${GRAPH_BASE}${driveItemPath(rootPath, filePath)}/content`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: 'follow',
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error('OneDrive readFile failed', { status: res.status, body, rootPath, filePath });
      throw new Error(`OneDrive: failed to read file (${res.status})`);
    }

    const content = await res.text();

    // Fetch metadata for lastModified
    const metaRes = await fetch(
      `${GRAPH_BASE}${driveItemPath(rootPath, filePath)}?$select=name,lastModifiedDateTime,eTag`,
      { headers: headers(accessToken) },
    );
    const meta = metaRes.ok
      ? (await metaRes.json()) as { name: string; lastModifiedDateTime?: string; eTag?: string }
      : { name: filePath.split('/').pop() ?? filePath };

    const name = filePath.split('/').pop() ?? filePath;

    return {
      path: filePath,
      name,
      content,
      encoding: 'utf-8',
      sha: (meta as { eTag?: string }).eTag ?? undefined,
      lastModified: (meta as { lastModifiedDateTime?: string }).lastModifiedDateTime,
    };
  },

  async writeFile(accessToken: string, rootPath: string, filePath: string, content: string): Promise<WriteResult> {
    const url = `${GRAPH_BASE}${driveItemPath(rootPath, filePath)}/content`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'text/plain',
      },
      body: content,
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error('OneDrive writeFile failed', { status: res.status, body, rootPath, filePath });
      throw new Error(`OneDrive: failed to write file (${res.status})`);
    }

    const data = (await res.json()) as { eTag?: string };
    return {
      path: filePath,
      sha: data.eTag ?? undefined,
      message: 'File saved to OneDrive',
    };
  },

  async createFile(accessToken: string, rootPath: string, filePath: string, content: string): Promise<WriteResult> {
    // OneDrive creates on write — PUT to a non-existent path creates the file
    return oneDriveAdapter.writeFile(accessToken, rootPath, filePath, content);
  },

  async deleteFile(accessToken: string, rootPath: string, filePath: string): Promise<void> {
    const url = `${GRAPH_BASE}${driveItemPath(rootPath, filePath)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok && res.status !== 404) {
      const body = await res.text();
      logger.error('OneDrive deleteFile failed', { status: res.status, body, rootPath, filePath });
      throw new Error(`OneDrive: failed to delete file (${res.status})`);
    }
  },

  async renameFile(accessToken: string, rootPath: string, oldPath: string, newPath: string): Promise<WriteResult> {
    const newName = newPath.split('/').pop()!;
    const newParent = newPath.includes('/') ? newPath.substring(0, newPath.lastIndexOf('/')) : '';

    // If just renaming (same folder), use PATCH with name
    const oldParent = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : '';

    const body: Record<string, unknown> = { name: newName };

    // If moving to a different folder, also set parentReference
    if (oldParent !== newParent) {
      const parentDrivePath = newParent
        ? `${driveItemPath(rootPath, newParent)}`
        : `${driveItemPath(rootPath, '')}`;
      // Get the parent folder's driveItem id
      const parentRes = await fetch(`${GRAPH_BASE}${parentDrivePath}?$select=id`, {
        headers: headers(accessToken),
      });
      if (parentRes.ok) {
        const parentData = (await parentRes.json()) as { id: string };
        body.parentReference = { id: parentData.id };
      }
    }

    const url = `${GRAPH_BASE}${driveItemPath(rootPath, oldPath)}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: headers(accessToken),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const resBody = await res.text();
      logger.error('OneDrive renameFile failed', { status: res.status, body: resBody, rootPath, oldPath, newPath });
      throw new Error(`OneDrive: failed to rename file (${res.status})`);
    }

    const data = (await res.json()) as { eTag?: string };
    return {
      path: newPath,
      sha: data.eTag ?? undefined,
      message: 'File renamed on OneDrive',
    };
  },
};

// Register on import
registerSourceAdapter(oneDriveAdapter);

export default oneDriveAdapter;

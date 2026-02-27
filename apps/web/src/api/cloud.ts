import { apiFetch } from './apiFetch';

/** Encode a file path for use in a URL, encoding each segment but preserving `/`. */
function encodeFilePath(filePath: string): string {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

export interface CloudFileEntry {
  path: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  lastModified?: string;
}

export async function listCloudTree(notebookId: string): Promise<CloudFileEntry[]> {
  const params = new URLSearchParams({ root: notebookId });
  const res = await apiFetch(`/api/sources/cloud/tree?${params.toString()}`);
  if (!res.ok) {
    const err = new Error('Failed to load cloud files');
    (err as any).status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.entries ?? [];
}

export async function createCloudFile(notebookId: string, filePath: string, content: string = '', type: 'file' | 'folder' = 'file'): Promise<void> {
  const res = await apiFetch(`/api/sources/cloud/files/${encodeFilePath(filePath)}?root=${notebookId}`, {
    method: 'POST',
    body: JSON.stringify({ content: type === 'folder' ? '' : content, type }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Failed to create file');
  }
}

export async function renameCloudFile(notebookId: string, oldPath: string, newPath: string): Promise<{ path: string }> {
  const res = await apiFetch(`/api/sources/cloud/files/${encodeFilePath(oldPath)}?root=${notebookId}`, {
    method: 'PATCH',
    body: JSON.stringify({ newPath }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Failed to rename file');
  }
  return res.json();
}

export async function deleteCloudFile(notebookId: string, filePath: string): Promise<void> {
  const res = await apiFetch(`/api/sources/cloud/files/${encodeFilePath(filePath)}?root=${notebookId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete file');
}

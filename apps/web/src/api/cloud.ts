import { apiFetch } from './apiFetch';

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
  if (!res.ok) throw new Error('Failed to load cloud files');
  const data = await res.json();
  return data.entries ?? [];
}

export async function createCloudFile(notebookId: string, filePath: string, content: string = '', type: 'file' | 'folder' = 'file'): Promise<void> {
  // Folders are stored with a trailing / sentinel
  const apiPath = type === 'folder' ? `${filePath}/` : filePath;
  const res = await apiFetch(`/api/sources/cloud/files/${encodeURIComponent(apiPath)}?root=${notebookId}`, {
    method: 'POST',
    body: JSON.stringify({ content: type === 'folder' ? '' : content }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Failed to create file');
  }
}

export async function deleteCloudFile(notebookId: string, filePath: string): Promise<void> {
  const res = await apiFetch(`/api/sources/cloud/files/${encodeURIComponent(filePath)}?root=${notebookId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete file');
}

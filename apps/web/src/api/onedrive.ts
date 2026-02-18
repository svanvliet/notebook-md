/**
 * Client-side API wrapper for OneDrive source operations.
 * All calls go through our backend proxy (not directly to Microsoft Graph).
 */

const API_BASE = '';

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface OneDriveFolder {
  name: string;
  path: string;
  childCount: number;
}

/** List folders at a given OneDrive path (for the folder picker). */
export async function listOneDriveFolders(folderPath = ''): Promise<OneDriveFolder[]> {
  const params = new URLSearchParams();
  if (folderPath) params.set('path', folderPath);
  return api(`/api/onedrive/folders?${params.toString()}`);
}

/** Check if user has a linked Microsoft account with file access. */
export async function checkOneDriveAccess(): Promise<{ linked: boolean; displayName?: string }> {
  return api('/api/onedrive/status');
}

// ── File operations (via source proxy) ───────────────────────────────────

export interface OneDriveFileEntry {
  path: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  lastModified?: string;
}

export interface OneDriveFileContent {
  path: string;
  name: string;
  content: string;
  encoding: string;
  sha?: string;
  lastModified?: string;
}

export async function listOneDriveFiles(rootPath: string, dirPath = ''): Promise<OneDriveFileEntry[]> {
  const params = new URLSearchParams({ root: rootPath });
  if (dirPath) params.set('path', dirPath);
  const data = await api<{ entries: OneDriveFileEntry[] }>(`/api/sources/onedrive/files?${params.toString()}`);
  return data.entries;
}

export async function readOneDriveFile(rootPath: string, filePath: string): Promise<OneDriveFileContent> {
  return api(`/api/sources/onedrive/files/${encodeURIComponent(filePath)}?root=${encodeURIComponent(rootPath)}`);
}

export async function writeOneDriveFile(
  rootPath: string,
  filePath: string,
  content: string,
  sha?: string,
): Promise<{ path: string; sha?: string }> {
  return api(`/api/sources/onedrive/files/${encodeURIComponent(filePath)}?root=${encodeURIComponent(rootPath)}`, {
    method: 'PUT',
    body: JSON.stringify({ content, sha }),
  });
}

export async function createOneDriveFile(
  rootPath: string,
  filePath: string,
  content: string,
): Promise<{ path: string; sha?: string }> {
  return api(`/api/sources/onedrive/files/${encodeURIComponent(filePath)}?root=${encodeURIComponent(rootPath)}`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export async function deleteOneDriveFile(rootPath: string, filePath: string): Promise<void> {
  await api(`/api/sources/onedrive/files/${encodeURIComponent(filePath)}?root=${encodeURIComponent(rootPath)}`, {
    method: 'DELETE',
  });
}

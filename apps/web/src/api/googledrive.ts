/**
 * Client-side API wrapper for Google Drive source operations.
 * All calls go through our backend proxy (not directly to Google APIs).
 */

import { apiFetch } from './apiFetch.js';

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await apiFetch(path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface GoogleDriveFolder {
  id: string;
  name: string;
}

/** Check if user has a linked Google account with Drive access. */
export async function checkGoogleDriveAccess(): Promise<{ linked: boolean; reason?: string }> {
  return api('/api/googledrive/status');
}

/** List folders within a Google Drive folder (for the folder picker). */
export async function listGoogleDriveFolders(parentId = 'root'): Promise<GoogleDriveFolder[]> {
  const params = new URLSearchParams();
  if (parentId && parentId !== 'root') params.set('parentId', parentId);
  return api(`/api/googledrive/folders?${params.toString()}`);
}

// ── File operations (via source proxy) ───────────────────────────────────

export interface GoogleDriveFileEntry {
  path: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  lastModified?: string;
  sha?: string; // Google Drive file ID
}

export interface GoogleDriveFileContent {
  path: string;
  name: string;
  content: string;
  encoding: string;
  sha?: string;
  lastModified?: string;
}

export async function listGoogleDriveFiles(rootFolderId: string, dirPath = ''): Promise<GoogleDriveFileEntry[]> {
  const params = new URLSearchParams({ root: rootFolderId });
  if (dirPath) params.set('path', dirPath);
  const data = await api<{ entries: GoogleDriveFileEntry[] }>(`/api/sources/google-drive/files?${params.toString()}`);
  return data.entries;
}

/** Fetch entire folder tree in a single API call */
export async function listGoogleDriveTree(rootFolderId: string): Promise<GoogleDriveFileEntry[]> {
  const params = new URLSearchParams({ root: rootFolderId });
  const data = await api<{ entries: GoogleDriveFileEntry[] }>(`/api/sources/google-drive/tree?${params.toString()}`);
  return data.entries;
}

export async function readGoogleDriveFile(rootFolderId: string, filePath: string): Promise<GoogleDriveFileContent> {
  return api(`/api/sources/google-drive/files/${encodeURIComponent(filePath)}?root=${encodeURIComponent(rootFolderId)}`);
}

export async function writeGoogleDriveFile(
  rootFolderId: string,
  filePath: string,
  content: string,
  sha?: string,
): Promise<{ path: string; sha?: string }> {
  return api(`/api/sources/google-drive/files/${encodeURIComponent(filePath)}?root=${encodeURIComponent(rootFolderId)}`, {
    method: 'PUT',
    body: JSON.stringify({ content, sha }),
  });
}

export async function createGoogleDriveFile(
  rootFolderId: string,
  filePath: string,
  content: string,
): Promise<{ path: string; sha?: string }> {
  return api(`/api/sources/google-drive/files/${encodeURIComponent(filePath)}?root=${encodeURIComponent(rootFolderId)}`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export async function deleteGoogleDriveFile(rootFolderId: string, filePath: string): Promise<void> {
  await api(`/api/sources/google-drive/files/${encodeURIComponent(filePath)}?root=${encodeURIComponent(rootFolderId)}`, {
    method: 'DELETE',
  });
}

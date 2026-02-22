/**
 * Client-side API wrapper for GitHub source operations.
 * All calls go through our backend proxy (not directly to GitHub).
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

// ── Installation management ──────────────────────────────────────────────

export interface GitHubInstallation {
  id: string;
  installationId: number;
  accountLogin: string;
  accountType: string;
  reposSelection: string;
  suspended: boolean;
  createdAt: string;
}

export interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: string;
  private: boolean;
  default_branch: string;
}

export async function getInstallUrl(): Promise<string> {
  const data = await api<{ installUrl: string }>('/api/github/install');
  return data.installUrl;
}

export async function listInstallations(): Promise<GitHubInstallation[]> {
  const data = await api<{ installations: GitHubInstallation[] }>('/api/github/installations');
  return data.installations;
}

export async function listRepos(installationId: number, page = 1): Promise<{ repos: GitHubRepo[]; totalCount: number }> {
  return api(`/api/github/repos?installation_id=${installationId}&page=${page}&per_page=50`);
}

// ── Branch operations ────────────────────────────────────────────────────

export interface Branch {
  name: string;
  sha: string;
  protected: boolean;
}

export async function listBranches(owner: string, repo: string): Promise<Branch[]> {
  const data = await api<{ branches: Branch[] }>(`/api/github/branches?owner=${owner}&repo=${repo}`);
  return data.branches;
}

export async function createWorkingBranch(owner: string, repo: string, baseBranch?: string): Promise<{ branch: string; defaultBranch: string; ref: string; sha: string }> {
  return api('/api/github/branches', {
    method: 'POST',
    body: JSON.stringify({ owner, repo, baseBranch }),
  });
}

export interface PublishResult {
  outcome: 'merged' | 'pr_created' | 'conflict';
  sha?: string;
  prNumber?: number;
  prUrl?: string;
}

export async function publishBranch(
  owner: string,
  repo: string,
  head: string,
  base: string,
  commitMessage?: string,
  deleteBranchAfter = true,
  autoMerge = true,
): Promise<PublishResult> {
  return api('/api/github/publish', {
    method: 'POST',
    body: JSON.stringify({ owner, repo, head, base, commitMessage, deleteBranchAfter, autoMerge }),
  });
}

export async function deleteWorkingBranch(owner: string, repo: string, branch: string): Promise<void> {
  await api(`/api/github/branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}`, {
    method: 'DELETE',
  });
}

export async function checkPrStatus(owner: string, repo: string, branch: string): Promise<{ merged: boolean; prNumber?: number; baseBranch?: string }> {
  return api(`/api/github/pr-status?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}`);
}

// ── File operations (via source proxy) ───────────────────────────────────

export interface GitHubFileEntry {
  path: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  sha?: string;
}

export interface GitHubFileContent {
  path: string;
  name: string;
  content: string;
  encoding: string;
  sha?: string;
}

/** Encode a file path for URL usage — encode each segment but preserve slashes */
function encodePath(filePath: string): string {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

export async function listGitHubFiles(rootPath: string, dirPath = '', branch?: string): Promise<GitHubFileEntry[]> {
  const params = new URLSearchParams({ root: rootPath });
  if (dirPath) params.set('path', dirPath);
  if (branch) params.set('branch', branch);
  const data = await api<{ entries: GitHubFileEntry[] }>(`/api/sources/github/files?${params}`);
  return data.entries;
}

/** Fetch entire repo tree in a single API call */
export async function listGitHubTree(rootPath: string, branch?: string): Promise<GitHubFileEntry[]> {
  const params = new URLSearchParams({ root: rootPath });
  if (branch) params.set('branch', branch);
  const data = await api<{ entries: GitHubFileEntry[] }>(`/api/sources/github/tree?${params}`);
  return data.entries;
}

export async function readGitHubFile(rootPath: string, filePath: string, branch?: string): Promise<GitHubFileContent> {
  const params = new URLSearchParams({ root: rootPath });
  if (branch) params.set('branch', branch);
  return api(`/api/sources/github/files/${encodePath(filePath)}?${params}`);
}

export async function writeGitHubFile(rootPath: string, filePath: string, content: string, sha?: string, branch?: string): Promise<{ path: string; sha?: string }> {
  const params = new URLSearchParams({ root: rootPath });
  return api(`/api/sources/github/files/${encodePath(filePath)}?${params}`, {
    method: 'PUT',
    body: JSON.stringify({ content, sha, branch }),
  });
}

export async function createGitHubFile(rootPath: string, filePath: string, content = '', branch?: string): Promise<{ path: string; sha?: string }> {
  const params = new URLSearchParams({ root: rootPath });
  return api(`/api/sources/github/files/${encodePath(filePath)}?${params}`, {
    method: 'POST',
    body: JSON.stringify({ content, branch }),
  });
}

export async function deleteGitHubFile(rootPath: string, filePath: string, sha?: string): Promise<void> {
  const params = new URLSearchParams({ root: rootPath });
  if (sha) params.set('sha', sha);
  await api(`/api/sources/github/files/${encodePath(filePath)}?${params}`, {
    method: 'DELETE',
  });
}

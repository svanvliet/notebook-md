/**
 * GitHub Source Adapter — implements SourceAdapter for GitHub repos.
 *
 * Uses the GitHub Contents API via installation access tokens from the GitHub App.
 * Each operation resolves the installation for the repo's owner, gets an
 * installation token, then calls the appropriate API endpoint.
 *
 * rootPath format: "owner/repo" or "owner/repo/subfolder"
 * Working branch: "notebook-md/<short-id>" created from the default branch
 */

import type { SourceAdapter, FileEntry, FileContent, WriteResult } from './types.js';
import { registerSourceAdapter } from './types.js';
import { logger } from '../../lib/logger.js';

const API_BASE = 'https://api.github.com';
const HEADERS_BASE = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'Notebook.md',
};

function headers(token: string) {
  return { ...HEADERS_BASE, Authorization: `Bearer ${token}` };
}

/** Parse rootPath into { owner, repo, prefix } */
function parseRoot(rootPath: string): { owner: string; repo: string; prefix: string } {
  const parts = rootPath.split('/').filter(Boolean);
  if (parts.length < 2) throw new Error('rootPath must be at least "owner/repo"');
  return {
    owner: parts[0],
    repo: parts[1],
    prefix: parts.slice(2).join('/'),
  };
}

/** Join prefix + relative path, trimming slashes */
function joinPath(prefix: string, relative: string): string {
  const combined = [prefix, relative].filter(Boolean).join('/');
  return combined.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}

class GitHubAdapter implements SourceAdapter {
  readonly provider = 'github';

  async listFiles(accessToken: string, rootPath: string, dirPath: string): Promise<FileEntry[]> {
    const { owner, repo, prefix } = parseRoot(rootPath);
    const fullPath = joinPath(prefix, dirPath);
    const url = `${API_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(fullPath)}`;

    const res = await fetch(url, { headers: headers(accessToken) });
    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error(`GitHub Contents API: ${res.status}`);
    }

    const data = (await res.json()) as Array<{
      name: string;
      path: string;
      type: 'file' | 'dir' | 'symlink' | 'submodule';
      size: number;
      sha: string;
    }>;

    // API returns single object for a file, array for a directory
    const items = Array.isArray(data) ? data : [data];

    return items
      .filter((item) => item.type === 'file' || item.type === 'dir')
      .map((item) => ({
        path: prefix ? item.path.slice(prefix.length + 1) : item.path,
        name: item.name,
        type: item.type === 'dir' ? 'folder' as const : 'file' as const,
        size: item.size,
        sha: item.sha,
      }));
  }

  async readFile(accessToken: string, rootPath: string, filePath: string): Promise<FileContent> {
    const { owner, repo, prefix } = parseRoot(rootPath);
    const fullPath = joinPath(prefix, filePath);

    const res = await fetch(
      `${API_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(fullPath)}`,
      { headers: headers(accessToken) },
    );

    if (!res.ok) throw new Error(`GitHub Contents API: ${res.status}`);

    const data = (await res.json()) as {
      name: string;
      path: string;
      content: string;
      encoding: string;
      sha: string;
      size: number;
    };

    // GitHub returns base64-encoded content
    const content = data.encoding === 'base64'
      ? Buffer.from(data.content, 'base64').toString('utf-8')
      : data.content;

    return {
      path: prefix ? data.path.slice(prefix.length + 1) : data.path,
      name: data.name,
      content,
      encoding: 'utf-8',
      sha: data.sha,
    };
  }

  async writeFile(
    accessToken: string,
    rootPath: string,
    filePath: string,
    content: string,
    sha?: string,
  ): Promise<WriteResult> {
    const { owner, repo, prefix } = parseRoot(rootPath);
    const fullPath = joinPath(prefix, filePath);

    const body: Record<string, unknown> = {
      message: `Update ${filePath}`,
      content: Buffer.from(content, 'utf-8').toString('base64'),
    };
    if (sha) body.sha = sha;

    const res = await fetch(
      `${API_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(fullPath)}`,
      {
        method: 'PUT',
        headers: headers(accessToken),
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const errBody = await res.text();
      logger.error('GitHub writeFile failed', { status: res.status, body: errBody });
      throw new Error(`GitHub Contents API PUT: ${res.status}`);
    }

    const data = (await res.json()) as { content: { sha: string; path: string } };
    return { path: filePath, sha: data.content.sha };
  }

  async createFile(
    accessToken: string,
    rootPath: string,
    filePath: string,
    content: string,
  ): Promise<WriteResult> {
    // GitHub Contents API uses PUT for both create and update.
    // Omitting `sha` means create (fails if file exists).
    return this.writeFile(accessToken, rootPath, filePath, content);
  }

  async deleteFile(
    accessToken: string,
    rootPath: string,
    filePath: string,
    sha?: string,
  ): Promise<void> {
    const { owner, repo, prefix } = parseRoot(rootPath);
    const fullPath = joinPath(prefix, filePath);

    // Need the SHA if not provided
    let fileSha = sha;
    if (!fileSha) {
      const file = await this.readFile(accessToken, rootPath, filePath);
      fileSha = file.sha;
    }

    const res = await fetch(
      `${API_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(fullPath)}`,
      {
        method: 'DELETE',
        headers: headers(accessToken),
        body: JSON.stringify({
          message: `Delete ${filePath}`,
          sha: fileSha,
        }),
      },
    );

    if (!res.ok) throw new Error(`GitHub Contents API DELETE: ${res.status}`);
  }

  async renameFile(
    accessToken: string,
    rootPath: string,
    oldPath: string,
    newPath: string,
  ): Promise<WriteResult> {
    // GitHub has no rename API — read old, create new, delete old
    const file = await this.readFile(accessToken, rootPath, oldPath);
    const result = await this.createFile(accessToken, rootPath, newPath, file.content);
    await this.deleteFile(accessToken, rootPath, oldPath, file.sha);
    return result;
  }
}

// ── Branch operations (used by routes/github.ts) ────────────────────────

/**
 * Create a working branch from a base branch.
 */
export async function createWorkingBranch(
  accessToken: string,
  owner: string,
  repo: string,
  baseBranch: string,
  branchName: string,
): Promise<{ ref: string; sha: string }> {
  // Get the SHA of the base branch
  const refRes = await fetch(
    `${API_BASE}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
    { headers: headers(accessToken) },
  );
  if (!refRes.ok) throw new Error(`GitHub: failed to get base branch ref (${refRes.status})`);
  const refData = (await refRes.json()) as { object: { sha: string } };

  // Create the new branch
  const createRes = await fetch(
    `${API_BASE}/repos/${owner}/${repo}/git/refs`,
    {
      method: 'POST',
      headers: headers(accessToken),
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: refData.object.sha,
      }),
    },
  );

  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`GitHub: failed to create branch (${createRes.status}): ${body}`);
  }

  const data = (await createRes.json()) as { ref: string; object: { sha: string } };
  return { ref: data.ref, sha: data.object.sha };
}

/**
 * List branches for a repo (with optional filter).
 */
export async function listBranches(
  accessToken: string,
  owner: string,
  repo: string,
  page = 1,
  perPage = 30,
): Promise<Array<{ name: string; sha: string; protected: boolean }>> {
  const res = await fetch(
    `${API_BASE}/repos/${owner}/${repo}/branches?page=${page}&per_page=${perPage}`,
    { headers: headers(accessToken) },
  );
  if (!res.ok) throw new Error(`GitHub: failed to list branches (${res.status})`);

  const data = (await res.json()) as Array<{
    name: string;
    commit: { sha: string };
    protected: boolean;
  }>;

  return data.map((b) => ({
    name: b.name,
    sha: b.commit.sha,
    protected: b.protected,
  }));
}

/**
 * Squash-merge a working branch into the base branch.
 * Uses the GitHub Merge API with merge_method=squash.
 */
export async function publishBranch(
  accessToken: string,
  owner: string,
  repo: string,
  head: string,
  base: string,
  commitMessage?: string,
): Promise<{ sha: string; merged: boolean }> {
  const res = await fetch(
    `${API_BASE}/repos/${owner}/${repo}/merges`,
    {
      method: 'POST',
      headers: headers(accessToken),
      body: JSON.stringify({
        base,
        head,
        commit_message: commitMessage ?? `Publish notebook changes from ${head}`,
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub: merge failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { sha: string };
  return { sha: data.sha, merged: true };
}

/**
 * Delete a branch (cleanup after publish).
 */
export async function deleteBranch(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    { method: 'DELETE', headers: headers(accessToken) },
  );
  if (!res.ok && res.status !== 422) {
    throw new Error(`GitHub: failed to delete branch (${res.status})`);
  }
}

// Register the adapter
const githubAdapter = new GitHubAdapter();
registerSourceAdapter(githubAdapter);

export { githubAdapter };

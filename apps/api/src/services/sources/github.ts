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

/** Encode each segment of a path for URLs — preserves slashes */
function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/');
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

  async listFiles(accessToken: string, rootPath: string, dirPath: string, branch?: string): Promise<FileEntry[]> {
    const { owner, repo, prefix } = parseRoot(rootPath);
    const fullPath = joinPath(prefix, dirPath);
    let url = `${API_BASE}/repos/${owner}/${repo}/contents/${encodePath(fullPath)}`;
    if (branch) url += `?ref=${encodeURIComponent(branch)}`;

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

  async listTree(accessToken: string, rootPath: string, branch?: string): Promise<FileEntry[]> {
    const { owner, repo, prefix } = parseRoot(rootPath);

    // Resolve the tree SHA from the branch (default branch if not specified)
    const ref = branch ?? 'HEAD';
    const commitUrl = `${API_BASE}/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`;
    const commitRes = await fetch(commitUrl, { headers: headers(accessToken) });
    if (!commitRes.ok) throw new Error(`GitHub Commits API: ${commitRes.status}`);
    const commitData = (await commitRes.json()) as { commit: { tree: { sha: string } } };
    const treeSha = commitData.commit.tree.sha;

    // Fetch entire tree recursively in a single call
    const treeUrl = `${API_BASE}/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`;
    const treeRes = await fetch(treeUrl, { headers: headers(accessToken) });
    if (!treeRes.ok) throw new Error(`GitHub Trees API: ${treeRes.status}`);

    const treeData = (await treeRes.json()) as {
      tree: Array<{
        path: string;
        mode: string;
        type: 'blob' | 'tree';
        sha: string;
        size?: number;
      }>;
      truncated: boolean;
    };

    if (treeData.truncated) {
      logger.warn('GitHub tree was truncated (repo too large), falling back to contents API');
      return this.listFiles(accessToken, rootPath, '', branch);
    }

    return treeData.tree
      .filter((item) => {
        // Only include blobs (files) and trees (dirs)
        if (item.type !== 'blob' && item.type !== 'tree') return false;
        // If rootPath has a prefix (subfolder), only include items under it
        if (prefix && !item.path.startsWith(prefix + '/')) return false;
        return true;
      })
      .map((item) => {
        const relativePath = prefix ? item.path.slice(prefix.length + 1) : item.path;
        const name = relativePath.split('/').pop() ?? relativePath;
        return {
          path: relativePath,
          name,
          type: item.type === 'tree' ? 'folder' as const : 'file' as const,
          size: item.size,
          sha: item.sha,
        };
      });
  }

  async readFile(accessToken: string, rootPath: string, filePath: string, branch?: string): Promise<FileContent> {
    const { owner, repo, prefix } = parseRoot(rootPath);
    const fullPath = joinPath(prefix, filePath);

    let url = `${API_BASE}/repos/${owner}/${repo}/contents/${encodePath(fullPath)}`;
    if (branch) url += `?ref=${encodeURIComponent(branch)}`;

    const res = await fetch(url, { headers: headers(accessToken) });

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
    branch?: string,
  ): Promise<WriteResult> {
    const { owner, repo, prefix } = parseRoot(rootPath);
    const fullPath = joinPath(prefix, filePath);

    const body: Record<string, unknown> = {
      message: `Update ${filePath}`,
      content: Buffer.from(content, 'utf-8').toString('base64'),
    };
    if (sha) body.sha = sha;
    if (branch) body.branch = branch;

    const res = await fetch(
      `${API_BASE}/repos/${owner}/${repo}/contents/${encodePath(fullPath)}`,
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
    branch?: string,
  ): Promise<WriteResult> {
    // GitHub Contents API uses PUT for both create and update.
    // Omitting `sha` means create (fails if file exists).
    return this.writeFile(accessToken, rootPath, filePath, content, undefined, branch);
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
      `${API_BASE}/repos/${owner}/${repo}/contents/${encodePath(fullPath)}`,
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
 * Publish outcome from PR-based squash merge.
 */
export interface PublishResult {
  outcome: 'merged' | 'pr_created' | 'conflict';
  sha?: string;
  prNumber?: number;
  prUrl?: string;
}

/**
 * Publish a working branch to the base branch via PR-based squash merge.
 *
 * 1. Creates a pull request (head → base)
 * 2. Attempts to squash-merge immediately if autoMerge is true
 * 3. Returns structured outcome: merged, pr_created (needs review), or conflict
 */
export async function publishBranch(
  accessToken: string,
  owner: string,
  repo: string,
  head: string,
  base: string,
  commitMessage?: string,
  autoMerge = true,
): Promise<PublishResult> {
  const message = commitMessage ?? `Notebook.md: publish from ${head}`;

  // Step 1: Create a pull request
  const prRes = await fetch(
    `${API_BASE}/repos/${owner}/${repo}/pulls`,
    {
      method: 'POST',
      headers: headers(accessToken),
      body: JSON.stringify({
        title: message,
        head,
        base,
        body: `Published via [Notebook.md](https://www.notebookmd.io)`,
      }),
    },
  );

  // 422 with "No commits" means the branches are identical — nothing to publish
  if (prRes.status === 422) {
    const body = await prRes.json().catch(() => ({})) as Record<string, unknown>;
    const errors = (body.errors ?? []) as Array<{ message?: string }>;
    const noCommits = errors.some((e) => e.message?.includes('No commits'));
    if (noCommits) {
      return { outcome: 'merged', sha: undefined };
    }
    throw new Error(`GitHub: failed to create PR (422): ${JSON.stringify(body)}`);
  }

  if (!prRes.ok) {
    const body = await prRes.text();
    throw new Error(`GitHub: failed to create PR (${prRes.status}): ${body}`);
  }

  const prData = (await prRes.json()) as { number: number; html_url: string; mergeable: boolean | null };

  if (!autoMerge) {
    return { outcome: 'pr_created', prNumber: prData.number, prUrl: prData.html_url };
  }

  // Step 2: Attempt squash merge
  const mergeRes = await fetch(
    `${API_BASE}/repos/${owner}/${repo}/pulls/${prData.number}/merge`,
    {
      method: 'PUT',
      headers: headers(accessToken),
      body: JSON.stringify({
        commit_title: message,
        merge_method: 'squash',
      }),
    },
  );

  if (mergeRes.ok) {
    const mergeData = (await mergeRes.json()) as { sha: string };
    return { outcome: 'merged', sha: mergeData.sha, prNumber: prData.number, prUrl: prData.html_url };
  }

  // 405 = merge blocked (branch protection, required reviews, status checks)
  // 409 = merge conflict
  if (mergeRes.status === 409) {
    return { outcome: 'conflict', prNumber: prData.number, prUrl: prData.html_url };
  }

  if (mergeRes.status === 405) {
    logger.info('Auto-merge blocked by branch protection', { owner, repo, pr: prData.number });
    return { outcome: 'pr_created', prNumber: prData.number, prUrl: prData.html_url };
  }

  // Unexpected error — still return the PR so user can handle manually
  const mergeBody = await mergeRes.text();
  logger.error('Unexpected merge response', { status: mergeRes.status, body: mergeBody });
  return { outcome: 'pr_created', prNumber: prData.number, prUrl: prData.html_url };
}

/**
 * Reset a working branch to point at the same commit as the base branch.
 * Used after a successful squash merge when keeping the working branch.
 */
export async function resetBranchToBase(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  baseBranch: string,
): Promise<void> {
  // Get the base branch HEAD SHA
  const baseRes = await fetch(
    `${API_BASE}/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(baseBranch)}`,
    { headers: headers(accessToken) },
  );
  if (!baseRes.ok) throw new Error(`GitHub: failed to get base branch ref (${baseRes.status})`);
  const baseData = (await baseRes.json()) as { object: { sha: string } };

  // Force-update the working branch to point at base HEAD
  const updateRes = await fetch(
    `${API_BASE}/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    {
      method: 'PATCH',
      headers: headers(accessToken),
      body: JSON.stringify({ sha: baseData.object.sha, force: true }),
    },
  );
  if (!updateRes.ok) {
    const body = await updateRes.text();
    throw new Error(`GitHub: failed to reset branch (${updateRes.status}): ${body}`);
  }
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

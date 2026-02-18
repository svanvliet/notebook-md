/**
 * GitHub App authentication helpers.
 *
 * Uses the App's private key to create JWTs, then exchanges them for
 * short-lived installation access tokens scoped to specific installations.
 */

import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { logger } from './logger.js';
import { redis } from './redis.js';

let _privateKey: string | null = null;

function getAppId(): string {
  const id = process.env.GITHUB_APP_ID;
  if (!id) throw new Error('GITHUB_APP_ID not set');
  return id;
}

function getPrivateKey(): string {
  if (_privateKey) return _privateKey;
  const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  if (!keyPath) throw new Error('GITHUB_APP_PRIVATE_KEY_PATH not set');

  const absPath = resolve(process.cwd(), keyPath);
  _privateKey = readFileSync(absPath, 'utf8');
  return _privateKey;
}

/**
 * Create a short-lived JWT for authenticating as the GitHub App itself.
 * Valid for 10 minutes (GitHub maximum).
 */
export function createAppJWT(): string {
  const appId = getAppId();

  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iat: now - 60, // 60s clock skew
      exp: now + 600, // 10 min
      iss: appId,
    },
    getPrivateKey(),
    { algorithm: 'RS256' },
  );
}

/**
 * Get an installation access token for a specific GitHub App installation.
 * Caches in Redis (tokens are valid for 1 hour, we cache for 55 min).
 */
export async function getInstallationToken(installationId: number): Promise<string> {
  const cacheKey = `github:install-token:${installationId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const appJwt = createAppJWT();
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Notebook.md',
      },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    logger.error('Failed to get installation token', { installationId, status: res.status, body });
    throw new Error(`GitHub App: failed to get installation token (${res.status})`);
  }

  const data = (await res.json()) as { token: string; expires_at: string };

  // Cache for 55 minutes (token expires in 60)
  await redis.set(cacheKey, data.token, 'EX', 55 * 60);

  return data.token;
}

/**
 * List repos accessible to a specific installation.
 */
export async function listInstallationRepos(
  installationId: number,
  page = 1,
  perPage = 30,
): Promise<{ repos: Array<{ id: number; full_name: string; name: string; owner: string; private: boolean; default_branch: string }>; totalCount: number }> {
  const token = await getInstallationToken(installationId);
  const res = await fetch(
    `https://api.github.com/installation/repositories?page=${page}&per_page=${perPage}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Notebook.md',
      },
    },
  );

  if (!res.ok) {
    throw new Error(`GitHub: failed to list repos (${res.status})`);
  }

  const data = (await res.json()) as {
    total_count: number;
    repositories: Array<{
      id: number;
      full_name: string;
      name: string;
      owner: { login: string };
      private: boolean;
      default_branch: string;
    }>;
  };

  return {
    repos: data.repositories.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      name: r.name,
      owner: r.owner.login,
      private: r.private,
      default_branch: r.default_branch,
    })),
    totalCount: data.total_count,
  };
}

/**
 * GitHub-specific API routes.
 *
 * - App installation flow (install → callback → list installations → list repos)
 * - Working branch management (create, list, publish, delete)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { getInstallationToken, listInstallationRepos } from '../lib/github-app.js';
import { createWorkingBranch, listBranches, publishBranch, deleteBranch, resetBranchToBase } from '../services/sources/github.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';

const router = Router();

// Read env vars lazily (dotenv loads after ES module imports are resolved)
const getAppUrl = () => process.env.APP_URL ?? 'http://localhost:5173';
const getGitHubAppSlug = () => process.env.GITHUB_APP_SLUG ?? 'notebook-md';

// All routes require auth
router.use(requireAuth);

// ── GET /api/github/install — Redirect user to install the GitHub App ─────

router.get('/install', (req: Request, res: Response) => {
  const state = req.userId!;
  const installUrl = `https://github.com/apps/${getGitHubAppSlug()}/installations/new?state=${state}`;
  res.set('Cache-Control', 'no-store');
  res.json({ installUrl });
});

// ── GET /api/github/install/callback — GitHub redirects here after install ─

router.get('/install/callback', async (req: Request, res: Response) => {
  const installationId = Number(req.query.installation_id);
  const setupAction = req.query.setup_action as string;

  if (!installationId || isNaN(installationId)) {
    res.redirect(`${getAppUrl()}/settings?error=missing_installation_id`);
    return;
  }

  try {
    // Fetch installation details from GitHub to get account info
    const token = await getInstallationToken(installationId);

    // The installation token itself proves the installation is valid.
    // Fetch the installation metadata via the App JWT.
    const { createAppJWT } = await import('../lib/github-app.js');
    const appJwt = createAppJWT();
    const installRes = await fetch(
      `https://api.github.com/app/installations/${installationId}`,
      {
        headers: {
          Authorization: `Bearer ${appJwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Notebook.md',
        },
      },
    );

    if (!installRes.ok) {
      throw new Error(`Failed to fetch installation details: ${installRes.status}`);
    }

    const installData = (await installRes.json()) as {
      account: { login: string; type: string };
      repository_selection: string;
      suspended_at: string | null;
    };

    // Upsert the installation record
    await query(
      `INSERT INTO github_installations (user_id, installation_id, account_login, account_type, repos_selection, suspended_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (installation_id) DO UPDATE SET
         user_id = $1, account_login = $3, account_type = $4, repos_selection = $5, suspended_at = $6, updated_at = now()`,
      [
        req.userId!,
        installationId,
        installData.account.login,
        installData.account.type,
        installData.repository_selection,
        installData.suspended_at,
      ],
    );

    logger.info('GitHub App installed', {
      userId: req.userId,
      installationId,
      account: installData.account.login,
    });

    res.redirect(`${getAppUrl()}/?source=github&github_installed=true&account=${installData.account.login}`);
  } catch (err) {
    logger.error('GitHub install callback failed', { error: (err as Error).message });
    res.redirect(`${getAppUrl()}/settings?error=github_install_failed`);
  }
});

// ── GET /api/github/installations — List user's GitHub App installations ──

router.get('/installations', async (req: Request, res: Response) => {
  const result = await query<{
    id: string;
    installation_id: number;
    account_login: string;
    account_type: string;
    repos_selection: string;
    suspended_at: Date | null;
    created_at: Date;
  }>(
    'SELECT id, installation_id, account_login, account_type, repos_selection, suspended_at, created_at FROM github_installations WHERE user_id = $1 ORDER BY account_login',
    [req.userId!],
  );

  res.json({
    installations: result.rows.map((r) => ({
      id: r.id,
      installationId: r.installation_id,
      accountLogin: r.account_login,
      accountType: r.account_type,
      reposSelection: r.repos_selection,
      suspended: !!r.suspended_at,
      createdAt: r.created_at,
    })),
  });
});

// ── GET /api/github/repos — List repos for an installation ───────────────

router.get('/repos', async (req: Request, res: Response) => {
  const installationId = Number(req.query.installation_id);
  if (!installationId || isNaN(installationId)) {
    res.status(400).json({ error: 'installation_id query param required' });
    return;
  }

  // Verify the user owns this installation
  const check = await query(
    'SELECT 1 FROM github_installations WHERE installation_id = $1 AND user_id = $2',
    [installationId, req.userId!],
  );
  if (check.rows.length === 0) {
    res.status(403).json({ error: 'Installation not found or not authorized' });
    return;
  }

  try {
    const page = Number(req.query.page) || 1;
    const perPage = Math.min(Number(req.query.per_page) || 30, 100);
    const result = await listInstallationRepos(installationId, page, perPage);
    res.json(result);
  } catch (err) {
    const message = (err as Error).message;
    logger.error('Failed to list repos', { installationId, error: message });

    // If GitHub returns 401, the installation was likely removed — clean up
    if (message.includes('401')) {
      await query('DELETE FROM github_installations WHERE installation_id = $1', [installationId]);
      logger.info('Removed stale GitHub installation', { installationId });
      res.status(404).json({ error: 'GitHub App installation was removed. Please re-install.', code: 'INSTALLATION_REMOVED' });
      return;
    }

    res.status(502).json({ error: 'Failed to list repositories from GitHub' });
  }
});

// ── POST /api/github/branches — Create a working branch ──────────────────

router.post('/branches', async (req: Request, res: Response) => {
  const { owner, repo, baseBranch, branchName } = req.body;

  if (!owner || !repo) {
    res.status(400).json({ error: 'owner and repo are required' });
    return;
  }

  // Find installation for this owner
  const install = await query<{ installation_id: number }>(
    'SELECT installation_id FROM github_installations WHERE account_login = $1 AND user_id = $2',
    [owner, req.userId!],
  );
  if (install.rows.length === 0) {
    res.status(404).json({ error: 'No GitHub installation found for this account' });
    return;
  }

  try {
    const token = await getInstallationToken(install.rows[0].installation_id);

    // Auto-detect default branch if baseBranch not provided
    let base = baseBranch;
    if (!base) {
      const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'notebook-md' },
      });
      if (repoRes.ok) {
        const repoData = (await repoRes.json()) as { default_branch: string };
        base = repoData.default_branch;
      } else {
        base = 'main';
      }
    }

    const name = branchName ?? `notebook-md/${uuid().slice(0, 8)}`;
    const result = await createWorkingBranch(token, owner, repo, base, name);
    res.status(201).json({ branch: name, defaultBranch: base, ...result });
  } catch (err) {
    logger.error('Failed to create branch', { owner, repo, error: (err as Error).message });
    res.status(502).json({ error: 'Failed to create branch on GitHub' });
  }
});

// ── GET /api/github/branches — List branches for a repo ──────────────────

router.get('/branches', async (req: Request, res: Response) => {
  const owner = req.query.owner as string;
  const repo = req.query.repo as string;

  if (!owner || !repo) {
    res.status(400).json({ error: 'owner and repo query params required' });
    return;
  }

  const install = await query<{ installation_id: number }>(
    'SELECT installation_id FROM github_installations WHERE account_login = $1 AND user_id = $2',
    [owner, req.userId!],
  );
  if (install.rows.length === 0) {
    res.status(404).json({ error: 'No GitHub installation found for this account' });
    return;
  }

  try {
    const token = await getInstallationToken(install.rows[0].installation_id);
    const page = Number(req.query.page) || 1;
    const perPage = Math.min(Number(req.query.per_page) || 30, 100);
    const branches = await listBranches(token, owner, repo, page, perPage);
    res.json({ branches });
  } catch (err) {
    logger.error('Failed to list branches', { owner, repo, error: (err as Error).message });
    res.status(502).json({ error: 'Failed to list branches from GitHub' });
  }
});

// ── POST /api/github/publish — PR-based squash merge working branch → base ───

router.post('/publish', async (req: Request, res: Response) => {
  const { owner, repo, head, base, commitMessage, deleteBranchAfter, autoMerge } = req.body;

  if (!owner || !repo || !head || !base) {
    res.status(400).json({ error: 'owner, repo, head, and base are required' });
    return;
  }

  const install = await query<{ installation_id: number }>(
    'SELECT installation_id FROM github_installations WHERE account_login = $1 AND user_id = $2',
    [owner, req.userId!],
  );
  if (install.rows.length === 0) {
    res.status(404).json({ error: 'No GitHub installation found for this account' });
    return;
  }

  try {
    const token = await getInstallationToken(install.rows[0].installation_id);
    const result = await publishBranch(token, owner, repo, head, base, commitMessage, autoMerge !== false);

    if (result.outcome === 'merged') {
      if (deleteBranchAfter) {
        try {
          await deleteBranch(token, owner, repo, head);
          logger.info('Working branch deleted after publish', { owner, repo, branch: head });
        } catch (delErr) {
          logger.warn('Failed to delete branch after publish', { error: (delErr as Error).message });
        }
      } else {
        // Reset working branch to base HEAD so it's not diverged for future saves
        try {
          await resetBranchToBase(token, owner, repo, head, base);
          logger.info('Working branch reset to base HEAD', { owner, repo, branch: head, base });
        } catch (resetErr) {
          logger.warn('Failed to reset working branch', { error: (resetErr as Error).message });
        }
      }
    }

    res.json(result);
  } catch (err) {
    const msg = (err as Error).message;
    logger.error('Publish failed', { owner, repo, head, base, error: msg });

    // Detect permission issue — guide user to update their installation
    if (msg.includes('403') && msg.includes('not accessible')) {
      const installId = install.rows[0].installation_id;
      res.status(403).json({
        error: 'The Notebook.md GitHub App needs updated permissions to create pull requests.',
        settingsUrl: `https://github.com/settings/installations/${installId}`,
      });
      return;
    }

    res.status(502).json({ error: 'Failed to publish changes on GitHub' });
  }
});

// ── DELETE /api/github/branches — Delete a branch ──────────────────────────

router.delete('/branches', async (req: Request, res: Response) => {
  const owner = req.query.owner as string;
  const repo = req.query.repo as string;
  const branch = req.query.branch as string;

  if (!owner || !repo || !branch) {
    res.status(400).json({ error: 'owner, repo, and branch query params are required' });
    return;
  }

  const install = await query<{ installation_id: number }>(
    'SELECT installation_id FROM github_installations WHERE account_login = $1 AND user_id = $2',
    [owner, req.userId!],
  );
  if (install.rows.length === 0) {
    res.status(404).json({ error: 'No GitHub installation found for this account' });
    return;
  }

  try {
    const token = await getInstallationToken(install.rows[0].installation_id);
    await deleteBranch(token, owner, repo, branch);
    res.json({ message: 'Branch deleted' });
  } catch (err) {
    logger.error('Failed to delete branch', { owner, repo, branch, error: (err as Error).message });
    res.status(502).json({ error: 'Failed to delete branch on GitHub' });
  }
});

// ── GET /api/github/pr-status — Check if a working branch PR was merged ────

router.get('/pr-status', async (req: Request, res: Response) => {
  const owner = req.query.owner as string;
  const repo = req.query.repo as string;
  const branch = req.query.branch as string;

  if (!owner || !repo || !branch) {
    res.status(400).json({ error: 'owner, repo, and branch query params are required' });
    return;
  }

  const mergedKey = `github:pr-merged:${owner}/${repo}:${branch}`;
  const merged = await redis.get(mergedKey);

  if (merged) {
    const data = JSON.parse(merged) as { pr: number; base: string };
    res.json({ merged: true, prNumber: data.pr, baseBranch: data.base });
  } else {
    res.json({ merged: false });
  }
});

export default router;

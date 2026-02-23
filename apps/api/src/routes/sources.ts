import { Router } from 'express';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../lib/redis.js';
import { requireAuth } from '../middleware/auth.js';
import { validatePath, filterTreeEntries } from '../middleware/path-validation.js';
import { getSourceAdapter } from '../services/sources/types.js';
import { getValidAccessToken } from '../services/token-refresh.js';
import { getCircuitBreaker } from '../lib/circuit-breaker.js';
import { getInstallationToken } from '../lib/github-app.js';
import { query as dbQuery } from '../db/pool.js';
import { logger } from '../lib/logger.js';

const router = Router();

// ── Per-user rate limiting (Redis-backed) ─────────────────────────────────
const isTest = process.env.VITEST === 'true';

const sourceRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isTest ? 10000 : 300, // 300 req/min per user (tree browsing can burst)
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.userId ?? 'unknown',
  store: isTest ? undefined : new RedisStore({
    // @ts-expect-error - redis client types are compatible
    sendCommand: (...args: string[]) => redis.call(...args),
    prefix: 'rl:sources:',
  }),
  message: { error: 'Too many requests to source APIs, please slow down' },
});

// Apply auth + rate limit to all source routes
router.use(requireAuth);
router.use(sourceRateLimit);

// ── Middleware: resolve provider + access token + circuit breaker ──────────

async function resolveProvider(req: Request, res: Response): Promise<{ adapter: ReturnType<typeof getSourceAdapter>; accessToken: string } | null> {
  const provider = req.params.provider as string;

  // Cloud provider doesn't use circuit breakers or external tokens
  if (provider === 'cloud') {
    const adapter = getSourceAdapter(provider);
    if (!adapter) {
      res.status(404).json({ error: `Unknown source provider: ${provider}` });
      return null;
    }
    // For cloud, accessToken is unused; rootPath (notebook ID) is passed via query param
    return { adapter, accessToken: '' };
  }

  // Check circuit breaker
  const cb = getCircuitBreaker(provider);
  if (cb.isOpen()) {
    res.status(503).json({ error: `${provider} is temporarily unavailable, please try again shortly` });
    return null;
  }

  // Get adapter
  const adapter = getSourceAdapter(provider);
  if (!adapter) {
    res.status(404).json({ error: `Unknown source provider: ${provider}` });
    return null;
  }

  // Get valid access token — GitHub uses installation tokens, others use OAuth tokens
  let accessToken: string | null = null;

  // Map source adapter names to their OAuth provider (e.g., onedrive → microsoft, google-drive → google)
  const oauthProvider = provider === 'onedrive' ? 'microsoft' : provider === 'google-drive' ? 'google' : provider;

  if (provider === 'github') {
    // Extract owner from rootPath query param (format: "owner/repo" or "owner/repo/subpath")
    const rootPath = (req.query.root as string) ?? '';
    const owner = rootPath.split('/')[0];

    if (owner) {
      // Look up installation for this owner + user
      const installResult = await dbQuery<{ installation_id: number }>(
        'SELECT installation_id FROM github_installations WHERE account_login = $1 AND user_id = $2 AND suspended_at IS NULL',
        [owner, req.userId!],
      );

      if (installResult.rows.length > 0) {
        try {
          accessToken = await getInstallationToken(installResult.rows[0].installation_id);
        } catch (err) {
          logger.error('Failed to get installation token', { owner, error: (err as Error).message });
        }
      }
    }

    // Fallback to user OAuth token if no installation found
    if (!accessToken) {
      accessToken = await getValidAccessToken(req.userId!, oauthProvider);
    }
  } else {
    accessToken = await getValidAccessToken(req.userId!, oauthProvider);
  }

  if (!accessToken) {
    res.status(401).json({ error: `No valid ${oauthProvider} credentials. Please re-link your ${oauthProvider} account.` });
    return null;
  }

  return { adapter, accessToken };
}

// ── GET /api/sources/:provider/tree — List entire tree recursively ────────

router.get('/:provider/tree', async (req: Request, res: Response) => {
  const resolved = await resolveProvider(req, res);
  if (!resolved) return;

  const { adapter, accessToken } = resolved;
  const rootPath = (req.query.root as string) ?? '';
  const branch = (req.query.branch as string) || undefined;
  const cb = getCircuitBreaker(req.params.provider as string);

  try {
    const a = adapter!;
    let rawEntries: Awaited<ReturnType<typeof a.listFiles>>;
    if (a.listTree) {
      rawEntries = await a.listTree(accessToken, rootPath, branch);
    } else {
      rawEntries = await a.listFiles(accessToken, rootPath, '', branch);
    }
    cb.onSuccess();
    res.json({ entries: filterTreeEntries(rawEntries) });
  } catch (err) {
    cb.onFailure();
    logger.error('Source tree failed', { provider: req.params.provider as string, error: (err as Error).message });
    res.status(502).json({ error: `Failed to load tree from ${req.params.provider as string}` });
  }
});

// ── GET /api/sources/:provider/files — List directory ─────────────────────

router.get('/:provider/files', async (req: Request, res: Response) => {
  const resolved = await resolveProvider(req, res);
  if (!resolved) return;

  const { adapter, accessToken } = resolved;
  const rootPath = (req.query.root as string) ?? '';
  const dirPath = (req.query.path as string) ?? '';
  const branch = (req.query.branch as string) || undefined;
  const cb = getCircuitBreaker(req.params.provider as string);

  try {
    const entries = await adapter!.listFiles(accessToken, rootPath, dirPath, branch);
    cb.onSuccess();
    res.json({ entries: filterTreeEntries(entries) });
  } catch (err) {
    cb.onFailure();
    logger.error('Source list failed', { provider: req.params.provider as string, error: (err as Error).message });
    res.status(502).json({ error: `Failed to list files from ${req.params.provider as string}` });
  }
});

// ── GET /api/sources/:provider/files/* — Read file ────────────────────────

router.get('/:provider/files/{*filePath}', validatePath, async (req: Request, res: Response) => {
  const resolved = await resolveProvider(req, res);
  if (!resolved) return;

  const { adapter, accessToken } = resolved;
  const rootPath = (req.query.root as string) ?? '';
  const filePath = (req as any).cleanPath;
  const branch = (req.query.branch as string) || undefined;
  const cb = getCircuitBreaker(req.params.provider as string);

  try {
    const file = await adapter!.readFile(accessToken, rootPath, filePath, branch);
    cb.onSuccess();
    res.json(file);
  } catch (err) {
    cb.onFailure();
    logger.error('Source read failed', { provider: req.params.provider as string, path: filePath, error: (err as Error).message });
    res.status(502).json({ error: `Failed to read file from ${req.params.provider as string}` });
  }
});

// ── PUT /api/sources/:provider/files/* — Update file ──────────────────────

router.put('/:provider/files/{*filePath}', validatePath, async (req: Request, res: Response) => {
  const resolved = await resolveProvider(req, res);
  if (!resolved) return;

  const { adapter, accessToken } = resolved;
  const rootPath = (req.query.root as string) ?? '';
  const filePath = (req as any).cleanPath;
  const { content, sha, branch } = req.body;
  const cb = getCircuitBreaker(req.params.provider as string);

  if (typeof content !== 'string') {
    res.status(400).json({ error: 'content is required and must be a string' });
    return;
  }

  try {
    const result = await adapter!.writeFile(accessToken, rootPath, filePath, content, sha, branch);
    cb.onSuccess();
    res.json(result);
  } catch (err) {
    cb.onFailure();
    logger.error('Source write failed', { provider: req.params.provider as string, path: filePath, error: (err as Error).message });
    res.status(502).json({ error: `Failed to write file to ${req.params.provider as string}` });
  }
});

// ── POST /api/sources/:provider/files/* — Create file ─────────────────────

router.post('/:provider/files/{*filePath}', validatePath, async (req: Request, res: Response) => {
  const resolved = await resolveProvider(req, res);
  if (!resolved) return;

  const { adapter, accessToken } = resolved;
  const rootPath = (req.query.root as string) ?? '';
  let filePath = (req as any).cleanPath;
  const { content, branch, type } = req.body;
  // For Cloud folders, restore the trailing / sentinel that validatePath strips
  if (req.params.provider === 'cloud' && type === 'folder') {
    filePath = `${filePath}/`;
  }
  const cb = getCircuitBreaker(req.params.provider as string);

  try {
    const result = await adapter!.createFile(accessToken, rootPath, filePath, content ?? '', branch);
    cb.onSuccess();
    res.status(201).json(result);
  } catch (err) {
    cb.onFailure();
    logger.error('Source create failed', { provider: req.params.provider as string, path: filePath, error: (err as Error).message });
    res.status(502).json({ error: `Failed to create file on ${req.params.provider as string}` });
  }
});

// ── DELETE /api/sources/:provider/files/* — Delete file ───────────────────

router.delete('/:provider/files/{*filePath}', validatePath, async (req: Request, res: Response) => {
  const resolved = await resolveProvider(req, res);
  if (!resolved) return;

  const { adapter, accessToken } = resolved;
  const rootPath = (req.query.root as string) ?? '';
  const filePath = (req as any).cleanPath;
  const sha = req.query.sha as string | undefined;
  const cb = getCircuitBreaker(req.params.provider as string);

  try {
    await adapter!.deleteFile(accessToken, rootPath, filePath, sha);
    cb.onSuccess();
    res.json({ message: 'Deleted' });
  } catch (err) {
    cb.onFailure();
    logger.error('Source delete failed', { provider: req.params.provider as string, path: filePath, error: (err as Error).message });
    res.status(502).json({ error: `Failed to delete file on ${req.params.provider as string}` });
  }
});

export default router;

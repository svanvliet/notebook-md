/**
 * Webhook endpoint for GitHub App events.
 *
 * Verifies HMAC-SHA256 signatures, deduplicates delivery IDs via Redis,
 * and handles installation and push events.
 *
 * IMPORTANT: This route must receive the raw body for signature verification.
 * It's mounted BEFORE express.json() in app.ts for the /webhooks path.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { redis } from '../lib/redis.js';
import { query } from '../db/pool.js';
import { logger } from '../lib/logger.js';

const router = Router();

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const DELIVERY_TTL = 600; // 10 minutes

// ── Signature verification ────────────────────────────────────────────────

export function verifyWebhookSignature(payload: string, signature: string | undefined, secret?: string): boolean {
  const key = secret ?? WEBHOOK_SECRET;
  if (!key || !signature) return false;

  const expected = 'sha256=' + createHmac('sha256', key).update(payload).digest('hex');

  // Timing-safe comparison
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── POST /webhooks/github ─────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  // The body should be the raw string (configured in app.ts)
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const event = req.headers['x-github-event'] as string;
  const deliveryId = req.headers['x-github-delivery'] as string;

  // 1. Verify signature
  if (!verifyWebhookSignature(rawBody, signature)) {
    logger.warn('Webhook signature verification failed', { event, deliveryId });
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // 2. Deduplicate delivery
  if (deliveryId) {
    const dedupKey = `webhook:delivery:${deliveryId}`;
    const existing = await redis.set(dedupKey, '1', 'EX', DELIVERY_TTL, 'NX');
    if (!existing) {
      // Already processed
      res.status(200).json({ message: 'Already processed' });
      return;
    }
  }

  // 3. Parse payload
  let payload: Record<string, unknown>;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  logger.info('Webhook received', { event, deliveryId, action: payload.action });

  // 4. Route by event type
  try {
    switch (event) {
      case 'installation':
        await handleInstallation(payload);
        break;

      case 'push':
        await handlePush(payload);
        break;

      case 'pull_request':
        await handlePullRequest(payload);
        break;

      case 'ping':
        // GitHub sends a ping when the webhook is first configured
        logger.info('GitHub webhook ping received');
        break;

      default:
        logger.debug('Unhandled webhook event', { event });
    }

    res.status(200).json({ message: 'OK' });
  } catch (err) {
    logger.error('Webhook handler failed', { event, error: (err as Error).message });
    res.status(500).json({ error: 'Internal error processing webhook' });
  }
});

// ── Event handlers ────────────────────────────────────────────────────────

async function handleInstallation(payload: Record<string, unknown>) {
  const action = payload.action as string;
  const installation = payload.installation as {
    id: number;
    account: { login: string; type: string };
    repository_selection: string;
    suspended_at: string | null;
  };

  switch (action) {
    case 'created':
      // New installation — update if exists (user might have already stored it via callback)
      logger.info('GitHub App installation created', {
        installationId: installation.id,
        account: installation.account.login,
      });
      break;

    case 'deleted':
      // Installation removed — delete from our DB
      await query('DELETE FROM github_installations WHERE installation_id = $1', [installation.id]);
      logger.info('GitHub App installation deleted', { installationId: installation.id });
      break;

    case 'suspend':
      await query(
        'UPDATE github_installations SET suspended_at = now(), updated_at = now() WHERE installation_id = $1',
        [installation.id],
      );
      logger.info('GitHub App installation suspended', { installationId: installation.id });
      break;

    case 'unsuspend':
      await query(
        'UPDATE github_installations SET suspended_at = NULL, updated_at = now() WHERE installation_id = $1',
        [installation.id],
      );
      logger.info('GitHub App installation unsuspended', { installationId: installation.id });
      break;

    case 'new_permissions_accepted':
      logger.info('GitHub App permissions updated', { installationId: installation.id });
      break;

    default:
      logger.debug('Unhandled installation action', { action });
  }
}

async function handlePush(payload: Record<string, unknown>) {
  const repository = payload.repository as { full_name: string; default_branch: string };
  const ref = payload.ref as string; // "refs/heads/main"
  const branch = ref.replace('refs/heads/', '');

  logger.info('Push event received', {
    repo: repository.full_name,
    branch,
    isDefault: branch === repository.default_branch,
  });

  // Store a "stale" marker in Redis that the frontend can check
  const staleKey = `github:stale:${repository.full_name}:${branch}`;
  await redis.set(staleKey, Date.now().toString(), 'EX', 3600); // 1 hour TTL
}

async function handlePullRequest(payload: Record<string, unknown>) {
  const action = payload.action as string;
  const pr = payload.pull_request as {
    number: number;
    merged: boolean;
    head: { ref: string };
    base: { ref: string };
    title: string;
    body: string | null;
  };
  const repository = payload.repository as { full_name: string };

  // Only process closed PRs that were created by Notebook.md
  if (action !== 'closed') return;
  if (!pr.body?.includes('Notebook.md')) return;

  if (pr.merged) {
    logger.info('Notebook.md PR merged', {
      repo: repository.full_name,
      pr: pr.number,
      head: pr.head.ref,
      base: pr.base.ref,
    });

    // Mark the base branch as stale so clients refresh their file tree
    const staleKey = `github:stale:${repository.full_name}:${pr.base.ref}`;
    await redis.set(staleKey, Date.now().toString(), 'EX', 3600);

    // Store a "merged" marker for the working branch so clients know to clear it
    const mergedKey = `github:pr-merged:${repository.full_name}:${pr.head.ref}`;
    await redis.set(mergedKey, JSON.stringify({ pr: pr.number, base: pr.base.ref }), 'EX', 86400); // 24h TTL
  } else {
    logger.info('Notebook.md PR closed without merge', {
      repo: repository.full_name,
      pr: pr.number,
      head: pr.head.ref,
      base: pr.base.ref,
    });

    // Store a "closed" marker so clients know to clear pending PR state
    const closedKey = `github:pr-closed:${repository.full_name}:${pr.head.ref}`;
    await redis.set(closedKey, JSON.stringify({ pr: pr.number, base: pr.base.ref }), 'EX', 86400);
  }
}

export default router;

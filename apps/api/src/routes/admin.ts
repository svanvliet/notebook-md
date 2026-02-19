import { Router } from 'express';
import { query } from '../db/pool.js';
import { healthCheck } from '../db/pool.js';
import { redisHealthCheck } from '../lib/redis.js';
import { auditLog } from '../lib/audit.js';
import { requireAdmin } from '../middleware/admin.js';
import type { Request, Response } from 'express';

const router = Router();

// All admin routes require admin auth
router.use(requireAdmin);

function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '127.0.0.1';
}

// ── System Health ────────────────────────────────────────────────────────────

router.get('/health', async (_req: Request, res: Response) => {
  const dbStart = Date.now();
  const dbOk = await healthCheck();
  const dbLatency = Date.now() - dbStart;

  const redisStart = Date.now();
  const redisOk = await redisHealthCheck();
  const redisLatency = Date.now() - redisStart;

  res.json({
    status: dbOk && redisOk ? 'ok' : 'degraded',
    services: {
      db: { status: dbOk ? 'ok' : 'down', latencyMs: dbLatency },
      redis: { status: redisOk ? 'ok' : 'down', latencyMs: redisLatency },
    },
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ── Metrics Overview ─────────────────────────────────────────────────────────

router.get('/metrics', async (_req: Request, res: Response) => {
  const [
    totalUsers,
    activeUsers24h,
    activeUsers7d,
    signupsToday,
    notebookCounts,
    twoFactorStats,
  ] = await Promise.all([
    query<{ count: string }>('SELECT count(*) FROM users'),
    query<{ count: string }>(
      "SELECT count(DISTINCT user_id) FROM sessions WHERE created_at > now() - interval '24 hours' AND revoked_at IS NULL",
    ),
    query<{ count: string }>(
      "SELECT count(DISTINCT user_id) FROM sessions WHERE created_at > now() - interval '7 days' AND revoked_at IS NULL",
    ),
    query<{ count: string }>(
      "SELECT count(*) FROM users WHERE created_at > now() - interval '24 hours'",
    ),
    query<{ source_type: string; count: string }>(
      'SELECT source_type, count(*) FROM notebooks GROUP BY source_type',
    ),
    query<{ enabled: string; total: string }>(
      "SELECT count(*) FILTER (WHERE totp_enabled = true) as enabled, count(*) as total FROM users",
    ),
  ]);

  res.json({
    users: {
      total: Number(totalUsers.rows[0].count),
      active24h: Number(activeUsers24h.rows[0].count),
      active7d: Number(activeUsers7d.rows[0].count),
      signupsToday: Number(signupsToday.rows[0].count),
    },
    notebooks: Object.fromEntries(
      notebookCounts.rows.map((r) => [r.source_type, Number(r.count)]),
    ),
    twoFactor: {
      enabled: Number(twoFactorStats.rows[0].enabled),
      total: Number(twoFactorStats.rows[0].total),
    },
  });
});

// ── User Management ──────────────────────────────────────────────────────────

router.get('/users', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page) || 20));
  const search = (req.query.search as string) || '';
  const offset = (page - 1) * perPage;

  let whereClause = '';
  const params: unknown[] = [];

  if (search) {
    params.push(`%${search}%`);
    whereClause = `WHERE email ILIKE $1 OR display_name ILIKE $1`;
  }

  const [users, total] = await Promise.all([
    query<{
      id: string;
      display_name: string;
      email: string;
      email_verified: boolean;
      is_admin: boolean;
      is_suspended: boolean;
      totp_enabled: boolean;
      created_at: Date;
    }>(
      `SELECT id, display_name, email, email_verified, is_admin, is_suspended, totp_enabled, created_at
       FROM users ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, perPage, offset],
    ),
    query<{ count: string }>(`SELECT count(*) FROM users ${whereClause}`, params),
  ]);

  res.json({
    users: users.rows.map((u) => ({
      id: u.id,
      displayName: u.display_name,
      email: u.email,
      emailVerified: u.email_verified,
      isAdmin: u.is_admin,
      isSuspended: u.is_suspended,
      twoFactorEnabled: u.totp_enabled,
      createdAt: u.created_at,
    })),
    pagination: {
      page,
      perPage,
      total: Number(total.rows[0].count),
      totalPages: Math.ceil(Number(total.rows[0].count) / perPage),
    },
  });
});

router.get('/users/:id', async (req: Request, res: Response) => {
  const result = await query<{
    id: string;
    display_name: string;
    email: string;
    email_verified: boolean;
    is_admin: boolean;
    is_suspended: boolean;
    totp_enabled: boolean;
    avatar_url: string | null;
    created_at: Date;
    password_hash: string | null;
  }>(
    'SELECT id, display_name, email, email_verified, is_admin, is_suspended, totp_enabled, avatar_url, created_at, password_hash FROM users WHERE id = $1',
    [req.params.id],
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const u = result.rows[0];

  // Get linked providers
  const links = await query<{ provider: string; provider_email: string }>(
    'SELECT provider, provider_email FROM identity_links WHERE user_id = $1',
    [u.id],
  );

  // Get notebook count
  const notebooks = await query<{ count: string }>(
    'SELECT count(*) FROM notebooks WHERE user_id = $1',
    [u.id],
  );

  // Get session count
  const sessions = await query<{ count: string }>(
    'SELECT count(*) FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()',
    [u.id],
  );

  res.json({
    user: {
      id: u.id,
      displayName: u.display_name,
      email: u.email,
      emailVerified: u.email_verified,
      isAdmin: u.is_admin,
      isSuspended: u.is_suspended,
      twoFactorEnabled: u.totp_enabled,
      avatarUrl: u.avatar_url,
      hasPassword: !!u.password_hash,
      createdAt: u.created_at,
    },
    linkedProviders: links.rows.map((l) => ({ provider: l.provider, email: l.provider_email })),
    notebookCount: Number(notebooks.rows[0].count),
    activeSessions: Number(sessions.rows[0].count),
  });
});

router.patch('/users/:id', async (req: Request, res: Response) => {
  const { isSuspended } = req.body;
  const targetId = req.params.id;

  // Cannot modify own admin status
  if (targetId === req.userId) {
    res.status(400).json({ error: 'Cannot modify your own account' });
    return;
  }

  // Only allow toggling is_suspended (NOT is_admin — that's CLI only)
  if (isSuspended === undefined) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }

  await query('UPDATE users SET is_suspended = $1 WHERE id = $2', [!!isSuspended, targetId]);

  // Revoke all active sessions when suspending so the user is logged out immediately
  if (isSuspended) {
    await query(
      "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
      [targetId],
    );
  }

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: isSuspended ? 'user_suspended' : 'user_unsuspended', targetUserId: targetId },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: isSuspended ? 'User suspended' : 'User unsuspended' });
});

router.delete('/users/:id', async (req: Request, res: Response) => {
  const targetId = req.params.id;

  if (targetId === req.userId) {
    res.status(400).json({ error: 'Cannot delete your own account' });
    return;
  }

  // Check user exists
  const user = await query<{ email: string }>('SELECT email FROM users WHERE id = $1', [targetId]);
  if (user.rows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'user_deleted', targetUserId: targetId, targetEmail: user.rows[0].email },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  await query('DELETE FROM users WHERE id = $1', [targetId]);
  res.json({ message: 'User deleted' });
});

// ── Audit Log ────────────────────────────────────────────────────────────────

router.get('/audit-log', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page) || 50));
  const offset = (page - 1) * perPage;
  const action = req.query.action as string | undefined;
  const userId = req.query.user_id as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (action) {
    params.push(action);
    conditions.push(`a.action = $${params.length}`);
  }
  if (userId) {
    params.push(userId);
    conditions.push(`a.user_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [entries, total] = await Promise.all([
    query<{
      id: string;
      user_id: string | null;
      action: string;
      details: Record<string, unknown>;
      ip_address: string | null;
      user_agent: string | null;
      created_at: Date;
      email: string | null;
    }>(
      `SELECT a.id, a.user_id, a.action, a.details, a.ip_address, a.user_agent, a.created_at, u.email
       FROM audit_log a LEFT JOIN users u ON a.user_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, perPage, offset],
    ),
    query<{ count: string }>(`SELECT count(*) FROM audit_log a ${whereClause}`, params),
  ]);

  res.json({
    entries: entries.rows.map((e) => ({
      id: e.id,
      userId: e.user_id,
      userEmail: e.email,
      action: e.action,
      details: e.details,
      ipAddress: e.ip_address,
      createdAt: e.created_at,
    })),
    pagination: {
      page,
      perPage,
      total: Number(total.rows[0].count),
      totalPages: Math.ceil(Number(total.rows[0].count) / perPage),
    },
  });
});

// ── Feature Flags ────────────────────────────────────────────────────────────

router.get('/feature-flags', async (_req: Request, res: Response) => {
  const result = await query<{
    key: string;
    enabled: boolean;
    description: string | null;
    updated_at: Date;
  }>('SELECT key, enabled, description, updated_at FROM feature_flags ORDER BY key');

  res.json({ flags: result.rows });
});

router.post('/feature-flags', async (req: Request, res: Response) => {
  const { key, enabled, description } = req.body;

  if (!key || typeof key !== 'string') {
    res.status(400).json({ error: 'Key is required' });
    return;
  }

  await query(
    `INSERT INTO feature_flags (key, enabled, description)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET enabled = $2, description = $3, updated_at = now()`,
    [key, enabled ?? false, description ?? null],
  );

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'feature_flag_updated', key, enabled: enabled ?? false },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Feature flag saved' });
});

// ── Announcements ────────────────────────────────────────────────────────────

router.get('/announcements', async (_req: Request, res: Response) => {
  const result = await query<{
    id: string;
    title: string;
    body: string;
    type: string;
    active: boolean;
    starts_at: Date | null;
    ends_at: Date | null;
    created_at: Date;
  }>('SELECT id, title, body, type, active, starts_at, ends_at, created_at FROM announcements ORDER BY created_at DESC');

  res.json({ announcements: result.rows });
});

router.post('/announcements', async (req: Request, res: Response) => {
  const { title, body, type, active, startsAt, endsAt } = req.body;

  if (!title || !body) {
    res.status(400).json({ error: 'Title and body are required' });
    return;
  }

  const result = await query<{ id: string }>(
    `INSERT INTO announcements (title, body, type, active, starts_at, ends_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [title, body, type ?? 'info', active ?? true, startsAt ?? null, endsAt ?? null],
  );

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'announcement_created', announcementId: result.rows[0].id },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ id: result.rows[0].id, message: 'Announcement created' });
});

router.put('/announcements/:id', async (req: Request, res: Response) => {
  const { title, body, type, active, startsAt, endsAt } = req.body;

  const existing = await query('SELECT id FROM announcements WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) {
    res.status(404).json({ error: 'Announcement not found' });
    return;
  }

  await query(
    `UPDATE announcements SET title = COALESCE($1, title), body = COALESCE($2, body),
     type = COALESCE($3, type), active = COALESCE($4, active),
     starts_at = $5, ends_at = $6
     WHERE id = $7`,
    [title, body, type, active, startsAt ?? null, endsAt ?? null, req.params.id],
  );

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'announcement_updated', announcementId: req.params.id },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Announcement updated' });
});

router.delete('/announcements/:id', async (req: Request, res: Response) => {
  const existing = await query('SELECT id FROM announcements WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) {
    res.status(404).json({ error: 'Announcement not found' });
    return;
  }

  await query('DELETE FROM announcements WHERE id = $1', [req.params.id]);

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'announcement_deleted', announcementId: req.params.id },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Announcement deleted' });
});

export default router;

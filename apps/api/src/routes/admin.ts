import { Router } from 'express';
import { query } from '../db/pool.js';
import { healthCheck } from '../db/pool.js';
import { redisHealthCheck } from '../lib/redis.js';
import { auditLog } from '../lib/audit.js';
import { requireAdmin } from '../middleware/admin.js';
import { clearFlagCache, resolveAllFlags } from '../services/featureFlags.js';
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
    variants: string[] | null;
    stale_at: Date | null;
    updated_at: Date;
  }>('SELECT key, enabled, description, variants, stale_at, updated_at FROM feature_flags ORDER BY key');

  res.json({
    flags: result.rows.map(f => ({
      key: f.key,
      enabled: f.enabled,
      description: f.description,
      variants: f.variants,
      staleAt: f.stale_at,
      updatedAt: f.updated_at,
    })),
  });
});

router.post('/feature-flags', async (req: Request, res: Response) => {
  const { key, enabled, description, variants, staleAt } = req.body;

  if (!key || typeof key !== 'string') {
    res.status(400).json({ error: 'Key is required' });
    return;
  }

  await query(
    `INSERT INTO feature_flags (key, enabled, description, variants, stale_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (key) DO UPDATE SET enabled = $2, description = $3, variants = $4, stale_at = $5, updated_at = now()`,
    [key, enabled ?? false, description ?? null, variants ?? null, staleAt ?? null],
  );

  clearFlagCache();

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'feature_flag_updated', key, enabled: enabled ?? false },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Feature flag saved' });
});

// ── Feature Flag Overrides ────────────────────────────────────────────────────

router.get('/feature-flags/:key/overrides', async (req: Request, res: Response) => {
  const result = await query<{
    user_id: string;
    enabled: boolean;
    variant: string | null;
    reason: string | null;
    expires_at: Date | null;
    created_at: Date;
    email: string | null;
    display_name: string | null;
  }>(
    `SELECT fo.user_id, fo.enabled, fo.variant, fo.reason, fo.expires_at, fo.created_at, u.email, u.display_name
     FROM flag_overrides fo
     LEFT JOIN users u ON fo.user_id = u.id
     WHERE fo.flag_key = $1
     ORDER BY fo.created_at DESC`,
    [req.params.key],
  );

  res.json({
    overrides: result.rows.map(o => ({
      userId: o.user_id,
      email: o.email,
      displayName: o.display_name,
      enabled: o.enabled,
      variant: o.variant,
      reason: o.reason,
      expiresAt: o.expires_at,
      createdAt: o.created_at,
    })),
  });
});

router.post('/feature-flags/:key/overrides', async (req: Request, res: Response) => {
  const { userId, enabled, variant, reason, expiresAt } = req.body;
  const flagKey = req.params.key;

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  // Verify flag exists
  const flag = await query('SELECT key FROM feature_flags WHERE key = $1', [flagKey]);
  if (flag.rows.length === 0) {
    res.status(404).json({ error: 'Flag not found' });
    return;
  }

  await query(
    `INSERT INTO flag_overrides (flag_key, user_id, enabled, variant, reason, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (flag_key, user_id) DO UPDATE SET enabled = $3, variant = $4, reason = $5, expires_at = $6`,
    [flagKey, userId, enabled ?? true, variant ?? null, reason ?? null, expiresAt ?? null],
  );

  clearFlagCache(userId);

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'flag_override_created', flagKey, targetUserId: userId, enabled: enabled ?? true },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Override saved' });
});

router.delete('/feature-flags/:key/overrides/:userId', async (req: Request, res: Response) => {
  const key = req.params.key as string;
  const userId = req.params.userId as string;

  const result = await query('DELETE FROM flag_overrides WHERE flag_key = $1 AND user_id = $2', [key, userId]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Override not found' });
    return;
  }

  clearFlagCache(userId);

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'flag_override_deleted', flagKey: key, targetUserId: userId },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Override deleted' });
});

// ── User Flag Resolution ─────────────────────────────────────────────────────

router.get('/users/:id/flags', async (req: Request, res: Response) => {
  const targetId = req.params.id as string;

  const user = await query<{ email: string }>('SELECT email FROM users WHERE id = $1', [targetId]);
  if (user.rows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Temporarily clear cache for fresh resolution
  clearFlagCache(targetId);
  const flags = await resolveAllFlags(targetId, user.rows[0].email);

  res.json({ flags });
});

// ── Groups ───────────────────────────────────────────────────────────────────

router.get('/groups', async (_req: Request, res: Response) => {
  const result = await query<{
    id: string;
    name: string;
    description: string | null;
    allow_self_enroll: boolean;
    email_domain: string | null;
    created_at: Date;
    member_count: string;
  }>(
    `SELECT g.id, g.name, g.description, g.allow_self_enroll, g.email_domain, g.created_at,
            (SELECT count(*) FROM user_group_members ugm WHERE ugm.group_id = g.id) as member_count
     FROM user_groups g
     ORDER BY g.name`,
  );

  res.json({
    groups: result.rows.map(g => ({
      id: g.id,
      name: g.name,
      description: g.description,
      allowSelfEnroll: g.allow_self_enroll,
      emailDomain: g.email_domain,
      createdAt: g.created_at,
      memberCount: Number(g.member_count),
    })),
  });
});

router.post('/groups', async (req: Request, res: Response) => {
  const { name, description, allowSelfEnroll, emailDomain } = req.body;

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'Name is required' });
    return;
  }

  const result = await query<{ id: string }>(
    `INSERT INTO user_groups (name, description, allow_self_enroll, email_domain, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [name, description ?? null, allowSelfEnroll ?? false, emailDomain ?? null, req.userId],
  );

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'group_created', groupId: result.rows[0].id, name },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({ id: result.rows[0].id, message: 'Group created' });
});

router.get('/groups/:id', async (req: Request, res: Response) => {
  const group = await query<{
    id: string;
    name: string;
    description: string | null;
    allow_self_enroll: boolean;
    email_domain: string | null;
    created_at: Date;
  }>('SELECT id, name, description, allow_self_enroll, email_domain, created_at FROM user_groups WHERE id = $1', [req.params.id]);

  if (group.rows.length === 0) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  const members = await query<{
    user_id: string;
    email: string;
    display_name: string | null;
    added_at: Date;
  }>(
    `SELECT ugm.user_id, u.email, u.display_name, ugm.added_at
     FROM user_group_members ugm
     JOIN users u ON ugm.user_id = u.id
     WHERE ugm.group_id = $1
     ORDER BY ugm.added_at DESC`,
    [req.params.id],
  );

  const g = group.rows[0];
  res.json({
    group: {
      id: g.id,
      name: g.name,
      description: g.description,
      allowSelfEnroll: g.allow_self_enroll,
      emailDomain: g.email_domain,
      createdAt: g.created_at,
    },
    members: members.rows.map(m => ({
      userId: m.user_id,
      email: m.email,
      displayName: m.display_name,
      addedAt: m.added_at,
    })),
  });
});

router.patch('/groups/:id', async (req: Request, res: Response) => {
  const { name, description, allowSelfEnroll, emailDomain } = req.body;

  const existing = await query('SELECT id FROM user_groups WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  await query(
    `UPDATE user_groups SET
       name = COALESCE($1, name),
       description = COALESCE($2, description),
       allow_self_enroll = COALESCE($3, allow_self_enroll),
       email_domain = $4,
       updated_at = now()
     WHERE id = $5`,
    [name ?? null, description ?? null, allowSelfEnroll ?? null, emailDomain !== undefined ? emailDomain : null, req.params.id],
  );

  clearFlagCache();

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'group_updated', groupId: req.params.id },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Group updated' });
});

router.delete('/groups/:id', async (req: Request, res: Response) => {
  const existing = await query('SELECT id, name FROM user_groups WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  await query('DELETE FROM user_groups WHERE id = $1', [req.params.id]);

  clearFlagCache();

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'group_deleted', groupId: req.params.id },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Group deleted' });
});

router.post('/groups/:id/members', async (req: Request, res: Response) => {
  const { userIds } = req.body;
  const groupId = req.params.id;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    res.status(400).json({ error: 'userIds array is required' });
    return;
  }

  const existing = await query('SELECT id FROM user_groups WHERE id = $1', [groupId]);
  if (existing.rows.length === 0) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  // Resolve emails to user IDs
  const resolvedIds: string[] = [];
  const notFound: string[] = [];
  for (const entry of userIds) {
    if (entry.includes('@')) {
      const user = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [entry.toLowerCase()]);
      if (user.rows.length === 0) { notFound.push(entry); continue; }
      resolvedIds.push(user.rows[0].id);
    } else {
      resolvedIds.push(entry);
    }
  }
  if (notFound.length > 0) {
    res.status(400).json({ error: `User(s) not found: ${notFound.join(', ')}` });
    return;
  }

  let added = 0;
  try {
    for (const uid of resolvedIds) {
      const result = await query(
        `INSERT INTO user_group_members (group_id, user_id, added_by)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [groupId, uid, req.userId],
      );
      added += result.rowCount ?? 0;
    }
  } catch (err: any) {
    if (err.code === '23503') {
      res.status(400).json({ error: 'One or more user IDs are invalid' });
      return;
    }
    throw err;
  }

  for (const uid of resolvedIds) clearFlagCache(uid);

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'group_members_added', groupId, count: added },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: `${added} member(s) added` });
});

router.delete('/groups/:id/members/:userId', async (req: Request, res: Response) => {
  const groupId = req.params.id as string;
  const userId = req.params.userId as string;

  const result = await query('DELETE FROM user_group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  clearFlagCache(userId);

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'group_member_removed', groupId, targetUserId: userId },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Member removed' });
});

// ── Flights ──────────────────────────────────────────────────────────────────

router.get('/flights', async (_req: Request, res: Response) => {
  const result = await query<{
    id: string;
    name: string;
    description: string | null;
    enabled: boolean;
    rollout_percentage: number;
    show_badge: boolean;
    badge_label: string;
    is_permanent: boolean;
    created_at: Date;
    flag_count: string;
    assignment_count: string;
  }>(
    `SELECT f.id, f.name, f.description, f.enabled, f.rollout_percentage, f.show_badge, f.badge_label, f.is_permanent, f.created_at,
            (SELECT count(*) FROM flight_flags ff WHERE ff.flight_id = f.id) as flag_count,
            (SELECT count(*) FROM flight_assignments fa WHERE fa.flight_id = f.id) as assignment_count
     FROM flights f
     ORDER BY f.name`,
  );

  res.json({
    flights: result.rows.map(f => ({
      id: f.id,
      name: f.name,
      description: f.description,
      enabled: f.enabled,
      rolloutPercentage: f.rollout_percentage,
      showBadge: f.show_badge,
      badgeLabel: f.badge_label,
      isPermanent: f.is_permanent,
      createdAt: f.created_at,
      flagCount: Number(f.flag_count),
      assignmentCount: Number(f.assignment_count),
    })),
  });
});

router.post('/flights', async (req: Request, res: Response) => {
  const { name, description, flagKeys, showBadge, badgeLabel, rolloutPercentage } = req.body;

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'Name is required' });
    return;
  }

  const pct = rolloutPercentage !== undefined ? Math.min(100, Math.max(0, Number(rolloutPercentage))) : 0;

  const result = await query<{ id: string }>(
    `INSERT INTO flights (name, description, rollout_percentage, show_badge, badge_label, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [name, description ?? null, pct, showBadge ?? false, badgeLabel ?? 'Beta', req.userId],
  );

  const flightId = result.rows[0].id;

  // Add flags if provided
  if (Array.isArray(flagKeys) && flagKeys.length > 0) {
    for (const fk of flagKeys) {
      await query(
        'INSERT INTO flight_flags (flight_id, flag_key) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [flightId, fk],
      );
    }
  }

  clearFlagCache();

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'flight_created', flightId, name, flagKeys: flagKeys ?? [] },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({ id: flightId, message: 'Flight created' });
});

router.get('/flights/:id', async (req: Request, res: Response) => {
  const flight = await query<{
    id: string;
    name: string;
    description: string | null;
    enabled: boolean;
    rollout_percentage: number;
    show_badge: boolean;
    badge_label: string;
    is_permanent: boolean;
    created_at: Date;
  }>('SELECT id, name, description, enabled, rollout_percentage, show_badge, badge_label, is_permanent, created_at FROM flights WHERE id = $1', [req.params.id]);

  if (flight.rows.length === 0) {
    res.status(404).json({ error: 'Flight not found' });
    return;
  }

  const flags = await query<{ flag_key: string }>(
    'SELECT flag_key FROM flight_flags WHERE flight_id = $1 ORDER BY flag_key',
    [req.params.id],
  );

  const assignments = await query<{
    id: string;
    group_id: string | null;
    user_id: string | null;
    assigned_at: Date;
    group_name: string | null;
    email: string | null;
  }>(
    `SELECT fa.id, fa.group_id, fa.user_id, fa.assigned_at,
            g.name as group_name, u.email
     FROM flight_assignments fa
     LEFT JOIN user_groups g ON fa.group_id = g.id
     LEFT JOIN users u ON fa.user_id = u.id
     WHERE fa.flight_id = $1
     ORDER BY fa.assigned_at DESC`,
    [req.params.id],
  );

  const f = flight.rows[0];
  res.json({
    flight: {
      id: f.id,
      name: f.name,
      description: f.description,
      enabled: f.enabled,
      rolloutPercentage: f.rollout_percentage,
      showBadge: f.show_badge,
      badgeLabel: f.badge_label,
      isPermanent: f.is_permanent,
      createdAt: f.created_at,
    },
    flags: flags.rows.map(r => r.flag_key),
    assignments: assignments.rows.map(a => ({
      id: a.id,
      groupId: a.group_id,
      groupName: a.group_name,
      userId: a.user_id,
      email: a.email,
      assignedAt: a.assigned_at,
    })),
  });
});

router.patch('/flights/:id', async (req: Request, res: Response) => {
  const { name, description, enabled, showBadge, badgeLabel, rolloutPercentage } = req.body;

  const existing = await query('SELECT id FROM flights WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) {
    res.status(404).json({ error: 'Flight not found' });
    return;
  }

  const pct = rolloutPercentage !== undefined ? Math.min(100, Math.max(0, Number(rolloutPercentage))) : null;

  await query(
    `UPDATE flights SET
       name = COALESCE($1, name),
       description = COALESCE($2, description),
       enabled = COALESCE($3, enabled),
       rollout_percentage = COALESCE($4, rollout_percentage),
       show_badge = COALESCE($5, show_badge),
       badge_label = COALESCE($6, badge_label),
       updated_at = now()
     WHERE id = $7`,
    [name ?? null, description ?? null, enabled ?? null, pct, showBadge ?? null, badgeLabel ?? null, req.params.id],
  );

  clearFlagCache();

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'flight_updated', flightId: req.params.id },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Flight updated' });
});

router.delete('/flights/:id', async (req: Request, res: Response) => {
  const existing = await query<{ id: string; name: string; is_permanent: boolean }>('SELECT id, name, is_permanent FROM flights WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) {
    res.status(404).json({ error: 'Flight not found' });
    return;
  }
  if (existing.rows[0].is_permanent) {
    res.status(403).json({ error: 'Cannot delete a permanent flight' });
    return;
  }

  await query('DELETE FROM flights WHERE id = $1', [req.params.id]);

  clearFlagCache();

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'flight_deleted', flightId: req.params.id },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Flight deleted' });
});

router.post('/flights/:id/flags', async (req: Request, res: Response) => {
  const { flagKeys } = req.body;
  const flightId = req.params.id;

  if (!Array.isArray(flagKeys) || flagKeys.length === 0) {
    res.status(400).json({ error: 'flagKeys array is required' });
    return;
  }

  const existing = await query('SELECT id FROM flights WHERE id = $1', [flightId]);
  if (existing.rows.length === 0) {
    res.status(404).json({ error: 'Flight not found' });
    return;
  }

  let added = 0;
  for (const fk of flagKeys) {
    const result = await query(
      'INSERT INTO flight_flags (flight_id, flag_key) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [flightId, fk],
    );
    added += result.rowCount ?? 0;
  }

  clearFlagCache();

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'flight_flags_added', flightId, flagKeys, added },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: `${added} flag(s) added` });
});

router.delete('/flights/:id/flags/:key', async (req: Request, res: Response) => {
  const { id: flightId, key } = req.params;

  const result = await query('DELETE FROM flight_flags WHERE flight_id = $1 AND flag_key = $2', [flightId, key]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Flag not assigned to this flight' });
    return;
  }

  clearFlagCache();

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'flight_flag_removed', flightId, flagKey: key },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Flag removed from flight' });
});

router.post('/flights/:id/assign', async (req: Request, res: Response) => {
  const { groupId, userId } = req.body;
  const flightId = req.params.id;

  if (!groupId && !userId) {
    res.status(400).json({ error: 'groupId or userId is required' });
    return;
  }

  const existing = await query('SELECT id FROM flights WHERE id = $1', [flightId]);
  if (existing.rows.length === 0) {
    res.status(404).json({ error: 'Flight not found' });
    return;
  }

  const result = await query<{ id: string }>(
    `INSERT INTO flight_assignments (flight_id, group_id, user_id, assigned_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [flightId, groupId ?? null, userId ?? null, req.userId],
  );

  clearFlagCache();

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'flight_assignment_created', flightId, groupId, targetUserId: userId },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({ id: result.rows[0].id, message: 'Assignment created' });
});

router.delete('/flights/:id/assignments/:assignmentId', async (req: Request, res: Response) => {
  const { assignmentId } = req.params;

  const result = await query('DELETE FROM flight_assignments WHERE id = $1', [assignmentId]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Assignment not found' });
    return;
  }

  clearFlagCache();

  await auditLog({
    userId: req.userId!,
    action: 'admin_action',
    details: { type: 'flight_assignment_deleted', assignmentId },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Assignment removed' });
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

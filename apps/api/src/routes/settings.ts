import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import type { Request, Response } from 'express';

const router = Router();

// GET /api/auth/settings — Get user settings
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const result = await query<{ settings: Record<string, unknown>; idle_timeout_minutes: number | null }>(
    'SELECT settings, idle_timeout_minutes FROM user_settings WHERE user_id = $1',
    [req.userId!],
  );
  const row = result.rows[0];
  const settings: Record<string, unknown> = { ...(row?.settings ?? {}) };
  if (row?.idle_timeout_minutes != null) {
    settings.idleTimeoutMinutes = row.idle_timeout_minutes;
  }
  res.json({ settings });
});

// PUT /api/auth/settings — Update user settings
router.put('/', requireAuth, async (req: Request, res: Response) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    res.status(400).json({ error: 'Settings object required' });
    return;
  }

  // Extract idle timeout separately (stored as its own column for middleware perf)
  const { idleTimeoutMinutes, ...jsonSettings } = settings;
  const idleTimeout = typeof idleTimeoutMinutes === 'number' && idleTimeoutMinutes > 0
    ? idleTimeoutMinutes : null;

  await query(
    `INSERT INTO user_settings (user_id, settings, idle_timeout_minutes, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE SET settings = $2, idle_timeout_minutes = $3, updated_at = now()`,
    [req.userId!, JSON.stringify(jsonSettings), idleTimeout],
  );

  res.json({ message: 'Settings saved' });
});

export default router;

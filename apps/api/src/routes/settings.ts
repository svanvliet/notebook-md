import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import type { Request, Response } from 'express';

const router = Router();

// GET /api/auth/settings — Get user settings
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const result = await query<{ settings: Record<string, unknown> }>(
    'SELECT settings FROM user_settings WHERE user_id = $1',
    [req.userId!],
  );
  res.json({ settings: result.rows[0]?.settings ?? {} });
});

// PUT /api/auth/settings — Update user settings
router.put('/', requireAuth, async (req: Request, res: Response) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    res.status(400).json({ error: 'Settings object required' });
    return;
  }

  await query(
    `INSERT INTO user_settings (user_id, settings, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET settings = $2, updated_at = now()`,
    [req.userId!, JSON.stringify(settings)],
  );

  res.json({ message: 'Settings saved' });
});

export default router;

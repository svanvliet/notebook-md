import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from './auth.js';
import { query } from '../db/pool.js';

/**
 * Require admin access. Checks:
 * 1. Valid session (via requireAuth)
 * 2. is_admin = true
 * 3. 2FA enabled OR has OAuth provider linked (§8.9.2 V1)
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // First, ensure authenticated
  await requireAuth(req, res, async () => {
    if (!req.userId) return; // requireAuth already sent 401

    const result = await query<{
      is_admin: boolean;
      totp_enabled: boolean;
    }>(
      'SELECT is_admin, totp_enabled FROM users WHERE id = $1',
      [req.userId],
    );

    if (result.rows.length === 0 || !result.rows[0].is_admin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const user = result.rows[0];

    // V1 MFA enforcement: 2FA enabled OR has at least one OAuth provider
    if (!user.totp_enabled) {
      const links = await query(
        'SELECT id FROM identity_links WHERE user_id = $1 LIMIT 1',
        [req.userId],
      );
      if (links.rows.length === 0) {
        res.status(403).json({ error: 'Admin access requires two-factor authentication. Please enable 2FA in your account settings.' });
        return;
      }
    }

    next();
  });
}

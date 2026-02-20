import type { Request, Response, NextFunction } from 'express';
import { getSessionByRefreshToken } from '../services/session.js';
import { clearRefreshCookie } from '../lib/cookies.js';
import { query } from '../db/pool.js';

// Extend Request with authenticated user
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      sessionId?: string;
    }
  }
}

/** Require a valid session cookie. Attaches userId and sessionId to request. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const session = await getSessionByRefreshToken(refreshToken);
  if (!session) {
    clearRefreshCookie(res);
    res.status(401).json({ error: 'Session expired or invalid' });
    return;
  }

  // Check if user is suspended + fetch idle timeout setting
  const userResult = await query<{ is_suspended: boolean; idle_timeout_minutes: number | null }>(
    `SELECT u.is_suspended, us.idle_timeout_minutes
     FROM users u LEFT JOIN user_settings us ON u.id = us.user_id
     WHERE u.id = $1`,
    [session.userId],
  );
  if (userResult.rows.length === 0 || userResult.rows[0].is_suspended) {
    clearRefreshCookie(res);
    res.status(403).json({ error: 'Account suspended' });
    return;
  }

  // Check idle timeout if configured
  const idleTimeout = userResult.rows[0].idle_timeout_minutes;
  if (idleTimeout && session.lastActiveAt) {
    const idleMs = Date.now() - new Date(session.lastActiveAt).getTime();
    if (idleMs > idleTimeout * 60 * 1000) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'Session timed out due to inactivity' });
      return;
    }
  }

  req.userId = session.userId;
  req.sessionId = session.id;

  // Update last_active_at (fire-and-forget, don't block the request)
  query('UPDATE sessions SET last_active_at = now() WHERE id = $1', [session.id]).catch(() => {});

  next();
}

/** Optional auth — attaches userId if session exists, but doesn't block */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const refreshToken = req.cookies?.refresh_token;
  if (refreshToken) {
    const session = await getSessionByRefreshToken(refreshToken);
    if (session) {
      req.userId = session.userId;
      req.sessionId = session.id;
    }
  }
  next();
}

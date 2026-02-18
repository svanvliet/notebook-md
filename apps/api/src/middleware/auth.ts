import type { Request, Response, NextFunction } from 'express';
import { getSessionByRefreshToken } from '../services/session.js';
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
    res.clearCookie('refresh_token');
    res.status(401).json({ error: 'Session expired or invalid' });
    return;
  }

  // Check if user is suspended
  const userResult = await query<{ is_suspended: boolean }>(
    'SELECT is_suspended FROM users WHERE id = $1',
    [session.userId],
  );
  if (userResult.rows.length === 0 || userResult.rows[0].is_suspended) {
    res.clearCookie('refresh_token');
    res.status(403).json({ error: 'Account suspended' });
    return;
  }

  req.userId = session.userId;
  req.sessionId = session.id;
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

import { query } from '../db/pool.js';
import type { Request, Response, NextFunction } from 'express';

/**
 * Check if a feature flag is enabled.
 * In development mode (NODE_ENV !== 'production'), flags default to true
 * unless explicitly set to false in the database.
 */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  const result = await query<{ enabled: boolean }>(
    'SELECT enabled FROM feature_flags WHERE key = $1',
    [key],
  );

  if (result.rows.length === 0) {
    // Flag doesn't exist — default to true in dev only, false in prod and test
    return process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';
  }

  const flag = result.rows[0].enabled;

  // In development, auto-enable cloud flags unless explicitly disabled
  if (!flag && process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    return true;
  }

  return flag;
}

/**
 * Express middleware that returns 404 if the feature flag is disabled.
 * Use this to gate entire route groups behind a feature flag.
 */
export function requireFeature(key: string) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    const enabled = await isFeatureEnabled(key);
    if (!enabled) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    next();
  };
}

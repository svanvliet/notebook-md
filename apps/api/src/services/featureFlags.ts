import { query } from '../db/pool.js';
import type { Request, Response, NextFunction } from 'express';

// ── Types ────────────────────────────────────────────────────────────────

export interface ResolvedFlag {
  enabled: boolean;
  variant: string | null;
  badge: string | null;
  source: 'kill_switch' | 'override' | 'flight' | 'rollout' | 'rollout_excluded' | 'global' | 'dev_default';
}

// ── In-memory cache ──────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000; // 30 seconds
const resolvedCache = new Map<string, { result: Record<string, ResolvedFlag>; fetchedAt: number }>();

/** Clear cache entries. Called after admin mutations. */
export function clearFlagCache(userId?: string) {
  if (userId) {
    resolvedCache.delete(userId);
  } else {
    resolvedCache.clear();
  }
}

// ── Deterministic hash for rollout bucketing ─────────────────────────────

/** FNV-1a 32-bit hash → bucket 0–99 */
function getUserBucket(flagKey: string, userId: string): number {
  const str = `${flagKey}:${userId}`;
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // FNV prime, unsigned
  }
  return hash % 100;
}

/** Exposed for testing */
export { getUserBucket as _getUserBucket };

// ── Dev mode check ───────────────────────────────────────────────────────

function isDevAutoEnable(): boolean {
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') return false;
  if (process.env.DEV_FLIGHTING === 'true') return false;
  return true;
}

// ── Core resolution ──────────────────────────────────────────────────────

/**
 * Resolve all feature flags for a given user.
 * When userId is null/undefined, only global resolution is performed.
 */
export async function resolveAllFlags(userId?: string | null, userEmail?: string | null): Promise<Record<string, ResolvedFlag>> {
  // Check cache
  const cacheKey = userId ?? '__anon__';
  const cached = resolvedCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  // Fetch all flags
  const flagsResult = await query<{
    key: string;
    enabled: boolean;
    rollout_percentage: number;
    variants: string[] | null;
  }>('SELECT key, enabled, rollout_percentage, variants FROM feature_flags ORDER BY key');

  const result: Record<string, ResolvedFlag> = {};

  if (!userId) {
    // Anonymous: only globally-enabled flags at 100% rollout
    for (const f of flagsResult.rows) {
      if (isDevAutoEnable()) {
        result[f.key] = { enabled: true, variant: null, badge: null, source: 'dev_default' };
      } else if (f.enabled && f.rollout_percentage === 100) {
        result[f.key] = { enabled: true, variant: null, badge: null, source: 'global' };
      }
    }
    resolvedCache.set(cacheKey, { result, fetchedAt: Date.now() });
    return result;
  }

  // Dev auto-enable: skip full resolution
  if (isDevAutoEnable()) {
    for (const f of flagsResult.rows) {
      result[f.key] = { enabled: true, variant: null, badge: null, source: 'dev_default' };
    }
    resolvedCache.set(cacheKey, { result, fetchedAt: Date.now() });
    return result;
  }

  // Fetch overrides for this user
  const overridesResult = await query<{
    flag_key: string;
    enabled: boolean;
    variant: string | null;
  }>(
    `SELECT flag_key, enabled, variant FROM flag_overrides
     WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now())`,
    [userId],
  );
  const overrides = new Map(overridesResult.rows.map(r => [r.flag_key, r]));

  // Resolve user email if not provided
  const resolvedEmail = userEmail ?? (await query<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId])).rows[0]?.email;

  // Fetch flight-enabled flags for this user (via direct assignment, group membership, or domain match)
  const flightResult = await query<{
    flag_key: string;
    show_badge: boolean;
    badge_label: string;
  }>(
    `SELECT DISTINCT ON (ff.flag_key) ff.flag_key, f.show_badge, f.badge_label
     FROM flight_flags ff
     JOIN flights f ON ff.flight_id = f.id
     JOIN flight_assignments fa ON fa.flight_id = f.id
     WHERE f.enabled = true
       AND (
         fa.user_id = $1
         OR fa.group_id IN (
           SELECT group_id FROM user_group_members WHERE user_id = $1
           UNION
           SELECT id FROM user_groups WHERE email_domain IS NOT NULL AND $2 LIKE '%@' || email_domain
         )
       )`,
    [userId, resolvedEmail ?? ''],
  );
  const flightFlags = new Map(flightResult.rows.map(r => [r.flag_key, r]));

  // Resolve each flag
  for (const f of flagsResult.rows) {
    // Step 1: Kill switch
    if (!f.enabled) {
      result[f.key] = { enabled: false, variant: null, badge: null, source: 'kill_switch' };
      continue;
    }

    // Step 2: Per-user override
    const override = overrides.get(f.key);
    if (override) {
      result[f.key] = { enabled: override.enabled, variant: override.variant, badge: null, source: 'override' };
      continue;
    }

    // Step 3: Flight assignment (bypasses rollout per D1)
    const flight = flightFlags.get(f.key);
    if (flight) {
      result[f.key] = {
        enabled: true,
        variant: null,
        badge: flight.show_badge ? flight.badge_label : null,
        source: 'flight',
      };
      continue;
    }

    // Step 4: Percentage rollout
    if (f.rollout_percentage < 100) {
      const bucket = getUserBucket(f.key, userId);
      if (bucket < f.rollout_percentage) {
        result[f.key] = { enabled: true, variant: null, badge: null, source: 'rollout' };
      } else {
        result[f.key] = { enabled: false, variant: null, badge: null, source: 'rollout_excluded' };
      }
      continue;
    }

    // Step 5: Global default (enabled + 100% rollout)
    result[f.key] = { enabled: true, variant: null, badge: null, source: 'global' };
  }

  resolvedCache.set(cacheKey, { result, fetchedAt: Date.now() });
  return result;
}

/**
 * Check if a feature flag is enabled for a specific user.
 * Backward compatible: when userId is omitted, falls back to global-only logic.
 */
export async function isFeatureEnabled(key: string, userId?: string | null): Promise<boolean> {
  const flags = await resolveAllFlags(userId);
  if (key in flags) {
    return flags[key].enabled;
  }
  // Flag doesn't exist in DB
  if (isDevAutoEnable()) return true;
  return false;
}

/**
 * Express middleware that returns 404 if the feature flag is disabled.
 * Uses req.userId for per-user resolution when available.
 */
export function requireFeature(key: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const enabled = await isFeatureEnabled(key, (req as any).userId ?? null);
    if (!enabled) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    next();
  };
}

import { query } from '../db/pool.js';
import type { Request, Response, NextFunction } from 'express';

// ── Types ────────────────────────────────────────────────────────────────

export interface ResolvedFlag {
  enabled: boolean;
  variant: string | null;
  badge: string | null;
  source: 'kill_switch' | 'override' | 'flight' | 'rollout' | 'not_delivered' | 'dev_default';
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
function getUserBucket(key: string, userId: string): number {
  const str = `${key}:${userId}`;
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
 * Flags are OFF by default unless delivered through a flight.
 * When userId is null/undefined, only dev-default or not_delivered is returned.
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
  }>('SELECT key, enabled FROM feature_flags ORDER BY key');

  const result: Record<string, ResolvedFlag> = {};

  // Dev auto-enable: all flags ON
  if (isDevAutoEnable()) {
    for (const f of flagsResult.rows) {
      result[f.key] = { enabled: true, variant: null, badge: null, source: 'dev_default' };
    }
    resolvedCache.set(cacheKey, { result, fetchedAt: Date.now() });
    return result;
  }

  if (!userId) {
    // Anonymous: no flags delivered (no user to resolve against)
    for (const f of flagsResult.rows) {
      if (!f.enabled) {
        result[f.key] = { enabled: false, variant: null, badge: null, source: 'kill_switch' };
      }
      // Don't include not_delivered flags for anon — they just won't appear
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

  // Fetch all flights that deliver flags to this user
  // A flight delivers to a user if:
  //   (a) user is directly assigned, OR
  //   (b) user is in an assigned group (explicit membership or domain match), OR
  //   (c) flight has rollout_percentage > 0 and user hashes into the bucket
  const flightResult = await query<{
    flag_key: string;
    flight_name: string;
    show_badge: boolean;
    badge_label: string;
    rollout_percentage: number;
    is_assigned: boolean;
    has_assignments: boolean;
  }>(
    `SELECT
       ff.flag_key,
       f.name as flight_name,
       f.show_badge,
       f.badge_label,
       f.rollout_percentage,
       EXISTS(
         SELECT 1 FROM flight_assignments fa
         WHERE fa.flight_id = f.id
           AND (
             fa.user_id = $1
             OR fa.group_id IN (
               SELECT group_id FROM user_group_members WHERE user_id = $1
               UNION
               SELECT id FROM user_groups WHERE email_domain IS NOT NULL AND $2 LIKE '%@' || email_domain
             )
           )
       ) as is_assigned,
       EXISTS(
         SELECT 1 FROM flight_assignments fa WHERE fa.flight_id = f.id
       ) as has_assignments
     FROM flight_flags ff
     JOIN flights f ON ff.flight_id = f.id
     WHERE f.enabled = true
     ORDER BY ff.flag_key, f.name`,
    [userId, resolvedEmail ?? ''],
  );

  // Group flight entries by flag_key
  const flightsByFlag = new Map<string, typeof flightResult.rows>();
  for (const row of flightResult.rows) {
    const arr = flightsByFlag.get(row.flag_key) ?? [];
    arr.push(row);
    flightsByFlag.set(row.flag_key, arr);
  }

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

    // Step 3: Flight delivery
    const flights = flightsByFlag.get(f.key);
    if (flights) {
      let delivered = false;
      for (const flight of flights) {
        // 3a: Targeted assignment (group/user/domain)
        if (flight.is_assigned) {
          result[f.key] = {
            enabled: true,
            variant: null,
            badge: flight.show_badge ? flight.badge_label : null,
            source: 'flight',
          };
          delivered = true;
          break;
        }

        // 3b: Flight rollout percentage
        // When a flight has assignments, rollout % applies only to assigned users.
        // When a flight has no assignments, rollout % applies to everyone.
        if (flight.rollout_percentage > 0 && (!flight.has_assignments || flight.is_assigned)) {
          const bucket = getUserBucket(flight.flight_name, userId);
          if (bucket < flight.rollout_percentage) {
            result[f.key] = {
              enabled: true,
              variant: null,
              badge: flight.show_badge ? flight.badge_label : null,
              source: 'rollout',
            };
            delivered = true;
            break;
          }
        }
      }
      if (delivered) continue;
    }

    // Step 4: Not delivered
    result[f.key] = { enabled: false, variant: null, badge: null, source: 'not_delivered' };
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
 * Check if a flag is kill-switched (enabled=false in DB).
 * Use for anonymous/unauthenticated endpoints where per-user resolution doesn't apply.
 */
export async function isKillSwitched(key: string): Promise<boolean> {
  if (isDevAutoEnable()) return false;
  const result = await query<{ enabled: boolean }>('SELECT enabled FROM feature_flags WHERE key = $1', [key]);
  if (result.rows.length === 0) return false;
  return !result.rows[0].enabled;
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

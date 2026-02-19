import { query } from '../db/pool.js';
import { generateToken, hashToken } from '../lib/crypto.js';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_SESSION_HOURS = 24;
const REMEMBER_ME_DAYS = 30;

export interface SessionTokens {
  sessionId: string;
  refreshToken: string;
  expiresAt: Date;
}

/** Create a new session with a refresh token */
export async function createSession(
  userId: string,
  opts: { rememberMe?: boolean; ip?: string; userAgent?: string },
): Promise<SessionTokens> {
  const refreshToken = generateToken(48);
  const refreshTokenHash = hashToken(refreshToken);
  const family = uuidv4();
  const expiresAt = new Date();

  if (opts.rememberMe) {
    expiresAt.setDate(expiresAt.getDate() + REMEMBER_ME_DAYS);
  } else {
    expiresAt.setHours(expiresAt.getHours() + DEFAULT_SESSION_HOURS);
  }

  const result = await query<{ id: string }>(
    `INSERT INTO sessions (user_id, refresh_token_hash, refresh_token_family, remember_me, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5::inet, $6, $7) RETURNING id`,
    [userId, refreshTokenHash, family, opts.rememberMe ?? false, opts.ip ?? null, opts.userAgent ?? null, expiresAt],
  );

  return { sessionId: result.rows[0].id, refreshToken, expiresAt };
}

/** Validate a refresh token and rotate it (returns new tokens or null) */
export async function rotateRefreshToken(
  oldRefreshToken: string,
): Promise<(SessionTokens & { userId: string }) | null> {
  const oldHash = hashToken(oldRefreshToken);

  // Find the session
  const result = await query<{
    id: string;
    user_id: string;
    refresh_token_family: string;
    remember_me: boolean;
    expires_at: Date;
    revoked_at: Date | null;
    ip_address: string | null;
    user_agent: string | null;
  }>(
    'SELECT id, user_id, refresh_token_family, remember_me, expires_at, revoked_at, ip_address, user_agent FROM sessions WHERE refresh_token_hash = $1',
    [oldHash],
  );

  if (result.rows.length === 0) return null;
  const session = result.rows[0];

  // If token was already used (revoked), this is a reuse attack — revoke ALL family tokens
  if (session.revoked_at) {
    await query(
      'UPDATE sessions SET revoked_at = now() WHERE refresh_token_family = $1 AND revoked_at IS NULL',
      [session.refresh_token_family],
    );
    return null;
  }

  // If session expired, reject
  if (new Date(session.expires_at) < new Date()) return null;

  // Revoke the old token
  await query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [session.id]);

  // Issue new token in the same family
  const newRefreshToken = generateToken(48);
  const newHash = hashToken(newRefreshToken);
  const newExpiresAt = new Date();

  if (session.remember_me) {
    newExpiresAt.setDate(newExpiresAt.getDate() + REMEMBER_ME_DAYS);
  } else {
    newExpiresAt.setHours(newExpiresAt.getHours() + DEFAULT_SESSION_HOURS);
  }

  const newSession = await query<{ id: string }>(
    `INSERT INTO sessions (user_id, refresh_token_hash, refresh_token_family, remember_me, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5::inet, $6, $7) RETURNING id`,
    [
      session.user_id,
      newHash,
      session.refresh_token_family,
      session.remember_me,
      session.ip_address,
      session.user_agent,
      newExpiresAt,
    ],
  );

  return {
    sessionId: newSession.rows[0].id,
    refreshToken: newRefreshToken,
    expiresAt: newExpiresAt,
    userId: session.user_id,
  };
}

/** Revoke a single session */
export async function revokeSession(sessionId: string): Promise<void> {
  await query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [sessionId]);
}

/** Revoke all sessions for a user */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await query(
    'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId],
  );
}

/** Get active session by refresh token hash */
export async function getSessionByRefreshToken(
  refreshToken: string,
): Promise<{ id: string; userId: string; expiresAt: Date; lastActiveAt: Date } | null> {
  const hash = hashToken(refreshToken);
  const result = await query<{ id: string; user_id: string; expires_at: Date; last_active_at: Date }>(
    'SELECT id, user_id, expires_at, last_active_at FROM sessions WHERE refresh_token_hash = $1 AND revoked_at IS NULL AND expires_at > now()',
    [hash],
  );
  if (result.rows.length === 0) return null;
  return { id: result.rows[0].id, userId: result.rows[0].user_id, expiresAt: result.rows[0].expires_at, lastActiveAt: result.rows[0].last_active_at };
}

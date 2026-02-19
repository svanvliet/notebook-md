import { Router } from 'express';
import bcryptjs from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query } from '../db/pool.js';
import { generateToken, hashToken } from '../lib/crypto.js';
import { sendMagicLink, sendVerificationEmail, sendPasswordResetEmail } from '../lib/email.js';
import { auditLog } from '../lib/audit.js';
import { createSession, rotateRefreshToken, revokeSession, revokeAllUserSessions } from '../services/session.js';
import { get2faStatus, createChallengeToken } from '../services/two-factor.js';
import { requireAuth } from '../middleware/auth.js';
import type { Request, Response } from 'express';

const router = Router();

// ---------------------------------------------------------------------------
// Rate limiting (memory-backed; swap to Redis store in production)
// ---------------------------------------------------------------------------

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

// Strict limit for mutation endpoints (sign-up, sign-in, password reset)
const authMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 10000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Generous limit for read/session endpoints (me, refresh, settings)
const authReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Apply rate limiters per route below (not blanket)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BCRYPT_COST = 12;
const MAGIC_LINK_EXPIRY_MIN = 15;
const VERIFICATION_EXPIRY_HOURS = 24;
const RESET_EXPIRY_HOURS = 1;
const MIN_PASSWORD_LENGTH = 8;

function setRefreshCookie(res: Response, token: string, rememberMe: boolean) {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
  });
}

function getClientIp(req: Request): string | undefined {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? undefined;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}

function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > 128) return 'Password must be at most 128 characters';
  return null;
}

// ---------------------------------------------------------------------------
// POST /auth/signup — Email + password sign-up
// ---------------------------------------------------------------------------
router.post('/signup', authMutationLimiter, async (req: Request, res: Response) => {
  const { email, password, displayName } = req.body;

  if (!email || !validateEmail(email)) {
    res.status(400).json({ error: 'Valid email is required' });
    return;
  }
  if (!password) {
    res.status(400).json({ error: 'Password is required' });
    return;
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  // Check if email already exists
  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    // Don't reveal if email exists — generic error with a hint
    res.status(409).json({ error: 'An account with this email already exists' });
    return;
  }

  const passwordHash = await bcryptjs.hash(password, BCRYPT_COST);
  const name = displayName || email.split('@')[0];

  const result = await query<{ id: string }>(
    `INSERT INTO users (display_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id`,
    [name, email.toLowerCase(), passwordHash],
  );
  const userId = result.rows[0].id;

  // Send email verification
  const verifyToken = generateToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + VERIFICATION_EXPIRY_HOURS);

  await query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, hashToken(verifyToken), expiresAt],
  );
  await sendVerificationEmail(email.toLowerCase(), verifyToken);

  // Create session
  const session = await createSession(userId, {
    rememberMe: req.body.rememberMe ?? false,
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  setRefreshCookie(res, session.refreshToken, req.body.rememberMe ?? false);

  await auditLog({
    userId,
    action: 'sign_up',
    details: { method: 'email_password' },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({
    user: { id: userId, displayName: name, email: email.toLowerCase(), emailVerified: false, hasPassword: true, twoFactorEnabled: false, twoFactorMethod: null },
    sessionId: session.sessionId,
  });
});

// ---------------------------------------------------------------------------
// POST /auth/signin — Email + password sign-in
// ---------------------------------------------------------------------------
router.post('/signin', authMutationLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const result = await query<{
    id: string;
    display_name: string;
    email: string;
    email_verified: boolean;
    password_hash: string | null;
    avatar_url: string | null;
    is_suspended: boolean;
    totp_enabled: boolean;
    totp_secret_enc: string | null;
  }>(
    'SELECT id, display_name, email, email_verified, password_hash, avatar_url, is_suspended, totp_enabled, totp_secret_enc FROM users WHERE email = $1',
    [email.toLowerCase()],
  );

  if (result.rows.length === 0 || !result.rows[0].password_hash) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const user = result.rows[0];

  if (user.is_suspended) {
    res.status(403).json({ error: 'Account suspended' });
    return;
  }

  const valid = await bcryptjs.compare(password, user.password_hash!);
  if (!valid) {
    await auditLog({
      userId: user.id,
      action: 'sign_in_failed',
      details: { method: 'email_password', reason: 'invalid_password' },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  // Check if 2FA is enabled
  const twoFactorStatus = await get2faStatus(user.id);
  if (twoFactorStatus.enabled) {
    // Don't create session yet — issue a challenge token
    const challengeToken = createChallengeToken(user.id, req.body.rememberMe ?? false);
    await auditLog({
      userId: user.id,
      action: '2fa_challenge_issued',
      details: { method: twoFactorStatus.method },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });
    res.json({ requires2fa: true, challengeToken, method: twoFactorStatus.method });
    return;
  }

  const session = await createSession(user.id, {
    rememberMe: req.body.rememberMe ?? false,
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  setRefreshCookie(res, session.refreshToken, req.body.rememberMe ?? false);

  await auditLog({
    userId: user.id,
    action: 'sign_in',
    details: { method: 'email_password' },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({
    user: {
      id: user.id,
      displayName: user.display_name,
      email: user.email,
      emailVerified: user.email_verified,
      avatarUrl: user.avatar_url,
      hasPassword: !!user.password_hash,
      twoFactorEnabled: user.totp_enabled,
      twoFactorMethod: user.totp_enabled ? (user.totp_secret_enc ? 'totp' : 'email') : null,
    },
    sessionId: session.sessionId,
  });
});

// ---------------------------------------------------------------------------
// POST /auth/magic-link/request — Request a magic link
// ---------------------------------------------------------------------------
router.post('/magic-link/request', authMutationLimiter, async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email || !validateEmail(email)) {
    res.status(400).json({ error: 'Valid email is required' });
    return;
  }

  // Always return success (don't reveal if email exists)
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + MAGIC_LINK_EXPIRY_MIN);

  await query(
    `INSERT INTO magic_link_tokens (email, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [email.toLowerCase(), hashToken(token), expiresAt],
  );

  // Only send email if user exists (but always return 200)
  const userExists = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (userExists.rows.length > 0) {
    await sendMagicLink(email.toLowerCase(), token);
  }

  res.json({ message: 'If an account with that email exists, a sign-in link has been sent' });
});

// ---------------------------------------------------------------------------
// POST /auth/magic-link/verify — Verify a magic link token
// ---------------------------------------------------------------------------
router.post('/magic-link/verify', authMutationLimiter, async (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    res.status(400).json({ error: 'Token is required' });
    return;
  }

  const tokenHash = hashToken(token);
  const result = await query<{ id: string; email: string; used_at: Date | null; expires_at: Date }>(
    'SELECT id, email, used_at, expires_at FROM magic_link_tokens WHERE token_hash = $1',
    [tokenHash],
  );

  if (result.rows.length === 0) {
    res.status(400).json({ error: 'Invalid or expired link' });
    return;
  }

  const magicLink = result.rows[0];
  if (magicLink.used_at || new Date(magicLink.expires_at) < new Date()) {
    res.status(400).json({ error: 'Invalid or expired link' });
    return;
  }

  // Mark as used
  await query('UPDATE magic_link_tokens SET used_at = now() WHERE id = $1', [magicLink.id]);

  // Find or create user
  let userResult = await query<{
    id: string;
    display_name: string;
    email: string;
    email_verified: boolean;
    avatar_url: string | null;
    password_hash: string | null;
    totp_enabled: boolean;
    totp_secret_enc: string | null;
  }>(
    'SELECT id, display_name, email, email_verified, avatar_url, password_hash, totp_enabled, totp_secret_enc FROM users WHERE email = $1',
    [magicLink.email],
  );

  let userId: string;
  let isNewUser = false;

  if (userResult.rows.length === 0) {
    // Create new user
    const name = magicLink.email.split('@')[0];
    const newUser = await query<{ id: string }>(
      `INSERT INTO users (display_name, email, email_verified) VALUES ($1, $2, true) RETURNING id`,
      [name, magicLink.email],
    );
    userId = newUser.rows[0].id;
    isNewUser = true;
    userResult = await query(
      'SELECT id, display_name, email, email_verified, avatar_url, password_hash, totp_enabled, totp_secret_enc FROM users WHERE id = $1',
      [userId],
    );
  } else {
    userId = userResult.rows[0].id;
    // Magic link confirms email ownership
    if (!userResult.rows[0].email_verified) {
      await query('UPDATE users SET email_verified = true WHERE id = $1', [userId]);
      userResult.rows[0].email_verified = true;
    }
  }

  const session = await createSession(userId, {
    rememberMe: req.body.rememberMe ?? false,
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  setRefreshCookie(res, session.refreshToken, req.body.rememberMe ?? false);

  await auditLog({
    userId,
    action: isNewUser ? 'sign_up' : 'sign_in',
    details: { method: 'magic_link' },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  const user = userResult.rows[0];
  res.json({
    user: {
      id: user.id,
      displayName: user.display_name,
      email: user.email,
      emailVerified: user.email_verified,
      avatarUrl: user.avatar_url,
      hasPassword: !!user.password_hash,
      twoFactorEnabled: user.totp_enabled,
      twoFactorMethod: user.totp_enabled ? (user.totp_secret_enc ? 'totp' : 'email') : null,
    },
    sessionId: session.sessionId,
    isNewUser,
  });
});

// ---------------------------------------------------------------------------
// POST /auth/verify-email — Verify email address
// ---------------------------------------------------------------------------
router.post('/verify-email', authMutationLimiter, async (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    res.status(400).json({ error: 'Token is required' });
    return;
  }

  const tokenHash = hashToken(token);
  const result = await query<{ id: string; user_id: string; used_at: Date | null; expires_at: Date }>(
    'SELECT id, user_id, used_at, expires_at FROM email_verification_tokens WHERE token_hash = $1',
    [tokenHash],
  );

  if (result.rows.length === 0) {
    res.status(400).json({ error: 'Invalid or expired token' });
    return;
  }

  const record = result.rows[0];
  if (record.used_at || new Date(record.expires_at) < new Date()) {
    res.status(400).json({ error: 'Invalid or expired token' });
    return;
  }

  await query('UPDATE email_verification_tokens SET used_at = now() WHERE id = $1', [record.id]);
  await query('UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1', [record.user_id]);

  await auditLog({
    userId: record.user_id,
    action: 'email_verified',
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Email verified successfully' });
});

// ---------------------------------------------------------------------------
// POST /auth/password-reset/request — Request password reset
// ---------------------------------------------------------------------------
router.post('/password-reset/request', authMutationLimiter, async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email || !validateEmail(email)) {
    res.status(400).json({ error: 'Valid email is required' });
    return;
  }

  // Always return success
  const userResult = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (userResult.rows.length > 0) {
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + RESET_EXPIRY_HOURS);

    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userResult.rows[0].id, hashToken(token), expiresAt],
    );
    await sendPasswordResetEmail(email.toLowerCase(), token);
  }

  res.json({ message: 'If an account with that email exists, a password reset link has been sent' });
});

// ---------------------------------------------------------------------------
// POST /auth/password-reset/confirm — Reset password with token
// ---------------------------------------------------------------------------
router.post('/password-reset/confirm', authMutationLimiter, async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    res.status(400).json({ error: 'Token and new password are required' });
    return;
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  const tokenHash = hashToken(token);
  const result = await query<{ id: string; user_id: string; used_at: Date | null; expires_at: Date }>(
    'SELECT id, user_id, used_at, expires_at FROM password_reset_tokens WHERE token_hash = $1',
    [tokenHash],
  );

  if (result.rows.length === 0) {
    res.status(400).json({ error: 'Invalid or expired token' });
    return;
  }

  const record = result.rows[0];
  if (record.used_at || new Date(record.expires_at) < new Date()) {
    res.status(400).json({ error: 'Invalid or expired token' });
    return;
  }

  const passwordHash = await bcryptjs.hash(newPassword, BCRYPT_COST);

  await query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [record.id]);
  await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, record.user_id]);

  // Revoke all sessions (force re-login)
  await revokeAllUserSessions(record.user_id);

  await auditLog({
    userId: record.user_id,
    action: 'password_reset',
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Password reset successfully. Please sign in with your new password.' });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh — Rotate refresh token
// ---------------------------------------------------------------------------
router.post('/refresh', authReadLimiter, async (req: Request, res: Response) => {
  const oldToken = req.cookies?.refresh_token;
  if (!oldToken) {
    res.status(401).json({ error: 'No refresh token' });
    return;
  }

  const result = await rotateRefreshToken(oldToken);
  if (!result) {
    res.clearCookie('refresh_token');
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  setRefreshCookie(res, result.refreshToken, true);

  // Return fresh user data
  const userResult = await query<{
    id: string;
    display_name: string;
    email: string;
    email_verified: boolean;
    avatar_url: string | null;
  }>(
    'SELECT id, display_name, email, email_verified, avatar_url FROM users WHERE id = $1',
    [result.userId],
  );

  res.json({
    user: userResult.rows[0]
      ? {
          id: userResult.rows[0].id,
          displayName: userResult.rows[0].display_name,
          email: userResult.rows[0].email,
          emailVerified: userResult.rows[0].email_verified,
          avatarUrl: userResult.rows[0].avatar_url,
        }
      : null,
    sessionId: result.sessionId,
  });
});

// ---------------------------------------------------------------------------
// POST /auth/signout — Sign out (revoke session)
// ---------------------------------------------------------------------------
router.post('/signout', authReadLimiter, requireAuth, async (req: Request, res: Response) => {
  await revokeSession(req.sessionId!);
  res.clearCookie('refresh_token');

  await auditLog({
    userId: req.userId,
    action: 'sign_out',
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Signed out' });
});

// ---------------------------------------------------------------------------
// GET /auth/me — Get current user
// ---------------------------------------------------------------------------
router.get('/me', authReadLimiter, requireAuth, async (req: Request, res: Response) => {
  const result = await query<{
    id: string;
    display_name: string;
    email: string;
    email_verified: boolean;
    avatar_url: string | null;
    created_at: Date;
    password_hash: string | null;
    totp_enabled: boolean;
    totp_secret_enc: string | null;
    is_admin: boolean;
    is_suspended: boolean;
  }>(
    'SELECT id, display_name, email, email_verified, avatar_url, created_at, password_hash, totp_enabled, totp_secret_enc, is_admin, is_suspended FROM users WHERE id = $1',
    [req.userId!],
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const user = result.rows[0];
  res.json({
    user: {
      id: user.id,
      displayName: user.display_name,
      email: user.email,
      emailVerified: user.email_verified,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
      hasPassword: !!user.password_hash,
      twoFactorEnabled: user.totp_enabled,
      twoFactorMethod: user.totp_enabled ? (user.totp_secret_enc ? 'totp' : 'email') : null,
      isAdmin: user.is_admin,
      isSuspended: user.is_suspended,
    },
  });
});

// ---------------------------------------------------------------------------
// PUT /auth/me — Update current user profile
// ---------------------------------------------------------------------------
router.put('/me', authReadLimiter, requireAuth, async (req: Request, res: Response) => {
  const { displayName, avatarUrl } = req.body;

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (displayName !== undefined) {
    updates.push(`display_name = $${paramIdx++}`);
    values.push(displayName);
  }
  if (avatarUrl !== undefined) {
    updates.push(`avatar_url = $${paramIdx++}`);
    values.push(avatarUrl);
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  updates.push(`updated_at = now()`);
  values.push(req.userId!);

  await query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
    values,
  );

  await auditLog({
    userId: req.userId,
    action: 'profile_updated',
    details: { fields: Object.keys(req.body) },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Profile updated' });
});

// ---------------------------------------------------------------------------
// PUT /auth/password — Change password (while signed in)
// ---------------------------------------------------------------------------
router.put('/password', authMutationLimiter, requireAuth, async (req: Request, res: Response) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!newPassword) {
    res.status(400).json({ error: 'New password is required' });
    return;
  }

  if (newPassword !== confirmPassword) {
    res.status(400).json({ error: 'Passwords do not match' });
    return;
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  const userResult = await query<{ password_hash: string | null }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [req.userId!],
  );

  if (userResult.rows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const hasExistingPassword = !!userResult.rows[0].password_hash;

  if (hasExistingPassword) {
    // Changing existing password: require current password
    if (!currentPassword) {
      res.status(400).json({ error: 'Current password is required' });
      return;
    }
    const valid = await bcryptjs.compare(currentPassword, userResult.rows[0].password_hash!);
    if (!valid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }
  }
  // If no existing password, allow setting one without current password (OAuth-only accounts)

  const newHash = await bcryptjs.hash(newPassword, BCRYPT_COST);
  await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [newHash, req.userId!]);

  await auditLog({
    userId: req.userId,
    action: hasExistingPassword ? 'password_changed' : 'password_added',
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: hasExistingPassword ? 'Password changed successfully' : 'Password added successfully' });
});

// ---------------------------------------------------------------------------
// DELETE /auth/account — Delete account
// ---------------------------------------------------------------------------
router.delete('/account', authMutationLimiter, requireAuth, async (req: Request, res: Response) => {
  const { password, confirmation } = req.body;

  const userResult = await query<{ password_hash: string | null }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [req.userId!],
  );

  if (userResult.rows[0]?.password_hash) {
    // Has password: require password confirmation
    if (!password) {
      res.status(400).json({ error: 'Password required to delete account' });
      return;
    }
    const valid = await bcryptjs.compare(password, userResult.rows[0].password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Incorrect password' });
      return;
    }
  } else {
    // OAuth-only account: require typed confirmation
    if (confirmation !== 'DELETE') {
      res.status(400).json({ error: 'Type DELETE to confirm account deletion' });
      return;
    }
  }

  await auditLog({
    userId: req.userId,
    action: 'account_deleted',
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  // Delete user (cascades to sessions, identity_links, etc.)
  await query('DELETE FROM users WHERE id = $1', [req.userId!]);

  res.clearCookie('refresh_token');
  res.json({ message: 'Account deleted' });
});

export default router;

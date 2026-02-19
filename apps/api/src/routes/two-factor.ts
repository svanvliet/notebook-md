import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { auditLog } from '../lib/audit.js';
import { createSession } from '../services/session.js';
import {
  setupTotp,
  enableTotp,
  enableEmail2fa,
  disable2fa,
  get2faStatus,
  verifyTotpCode,
  sendEmail2faCode,
  verifyEmail2faCode,
  verifyRecoveryCode,
  verifyChallengeToken,
} from '../services/two-factor.js';
import type { Request, Response } from 'express';

const router = Router();

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? '127.0.0.1';
}

function setRefreshCookie(res: Response, token: string, rememberMe: boolean) {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
    path: '/',
  });
}

// ── GET /auth/2fa/status — Get 2FA status (authenticated) ────────────────────

router.get('/status', requireAuth, async (req: Request, res: Response) => {
  const status = await get2faStatus(req.userId!);
  res.json(status);
});

// ── POST /auth/2fa/setup — Start TOTP setup (authenticated) ─────────────────

router.post('/setup', requireAuth, twoFactorLimiter, async (req: Request, res: Response) => {
  try {
    const result = await setupTotp(req.userId!);
    res.json({ secret: result.secret, uri: result.uri });
  } catch (err) {
    console.error('[2fa] Setup error:', err);
    res.status(500).json({ error: 'Failed to set up 2FA' });
  }
});

// ── POST /auth/2fa/enable — Verify first code and enable (authenticated) ─────

router.post('/enable', requireAuth, twoFactorLimiter, async (req: Request, res: Response) => {
  const { code, method } = req.body;

  if (method === 'email') {
    // Enable email-based 2FA (no code verification needed for setup)
    const result = await enableEmail2fa(req.userId!);
    await auditLog({
      userId: req.userId!,
      action: '2fa_enabled',
      details: { method: 'email' },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });
    res.json({ recoveryCodes: result.recoveryCodes });
    return;
  }

  // TOTP method — verify the first code
  if (!code) {
    res.status(400).json({ error: 'Verification code is required' });
    return;
  }

  const result = await enableTotp(req.userId!, code);
  if (!result) {
    res.status(400).json({ error: 'Invalid verification code' });
    return;
  }

  await auditLog({
    userId: req.userId!,
    action: '2fa_enabled',
    details: { method: 'totp' },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ recoveryCodes: result.recoveryCodes });
});

// ── POST /auth/2fa/disable — Disable 2FA (authenticated, requires verification)

router.post('/disable', requireAuth, twoFactorLimiter, async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code) {
    res.status(400).json({ error: 'Verification code is required' });
    return;
  }

  const status = await get2faStatus(req.userId!);
  if (!status.enabled) {
    res.status(400).json({ error: '2FA is not enabled' });
    return;
  }

  // Verify the code based on method
  let valid = false;
  if (status.method === 'totp') {
    valid = await verifyTotpCode(req.userId!, code);
  } else {
    valid = await verifyEmail2faCode(req.userId!, code);
  }

  if (!valid) {
    // Also try recovery codes
    valid = await verifyRecoveryCode(req.userId!, code);
  }

  if (!valid) {
    res.status(400).json({ error: 'Invalid verification code' });
    return;
  }

  await disable2fa(req.userId!);

  await auditLog({
    userId: req.userId!,
    action: '2fa_disabled',
    details: { method: status.method },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: '2FA disabled' });
});

// ── POST /auth/2fa/verify — Verify 2FA during sign-in (with challenge token) ─

router.post('/verify', twoFactorLimiter, async (req: Request, res: Response) => {
  const { challengeToken, code, method } = req.body;

  if (!challengeToken || !code) {
    res.status(400).json({ error: 'Challenge token and code are required' });
    return;
  }

  const payload = verifyChallengeToken(challengeToken);
  if (!payload) {
    res.status(401).json({ error: 'Challenge expired or invalid. Please sign in again.' });
    return;
  }

  let valid = false;
  if (method === 'recovery') {
    valid = await verifyRecoveryCode(payload.sub, code);
  } else if (method === 'email') {
    valid = await verifyEmail2faCode(payload.sub, code);
  } else {
    // Default: TOTP
    valid = await verifyTotpCode(payload.sub, code);
  }

  if (!valid) {
    await auditLog({
      userId: payload.sub,
      action: '2fa_verify_failed',
      details: { method: method ?? 'totp' },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });
    res.status(400).json({ error: 'Invalid verification code' });
    return;
  }

  // 2FA verified — create full session
  const session = await createSession(payload.sub, {
    rememberMe: payload.rememberMe,
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  setRefreshCookie(res, session.refreshToken, payload.rememberMe);

  await auditLog({
    userId: payload.sub,
    action: 'sign_in',
    details: { method: 'email_password', twoFactor: method ?? 'totp' },
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });

  // Return user data
  const { query: dbQuery } = await import('../db/pool.js');
  const userResult = await dbQuery<{
    id: string;
    display_name: string;
    email: string;
    email_verified: boolean;
    avatar_url: string | null;
  }>('SELECT id, display_name, email, email_verified, avatar_url FROM users WHERE id = $1', [payload.sub]);

  if (userResult.rows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const user = userResult.rows[0];
  res.json({
    user: {
      id: user.id,
      displayName: user.display_name,
      email: user.email,
      emailVerified: user.email_verified,
      avatarUrl: user.avatar_url,
    },
    sessionId: session.sessionId,
  });
});

// ── POST /auth/2fa/send-code — Send email code during sign-in ────────────────

router.post('/send-code', twoFactorLimiter, async (req: Request, res: Response) => {
  const { challengeToken } = req.body;

  if (!challengeToken) {
    res.status(400).json({ error: 'Challenge token is required' });
    return;
  }

  const payload = verifyChallengeToken(challengeToken);
  if (!payload) {
    res.status(401).json({ error: 'Challenge expired or invalid. Please sign in again.' });
    return;
  }

  const sent = await sendEmail2faCode(payload.sub);
  if (!sent) {
    res.status(500).json({ error: 'Failed to send code' });
    return;
  }

  res.json({ message: 'Code sent' });
});

// ── POST /auth/2fa/send-disable-code — Send email code for disabling 2FA ─────

router.post('/send-disable-code', requireAuth, twoFactorLimiter, async (req: Request, res: Response) => {
  const sent = await sendEmail2faCode(req.userId!);
  if (!sent) {
    res.status(500).json({ error: 'Failed to send code' });
    return;
  }
  res.json({ message: 'Code sent' });
});

export default router;

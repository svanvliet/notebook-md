import { Router } from 'express';
import { getProvider, listProviders } from '../services/oauth/index.js';
import { getMockLoginPage } from '../services/oauth/mock-provider.js';
import { handleOAuthLogin, linkProviderToUser, unlinkProvider, getUserProviders } from '../services/account-link.js';
import { createSession } from '../services/session.js';
import { generateToken, hashToken } from '../lib/crypto.js';
import { redis } from '../lib/redis.js';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';
import type { Request, Response } from 'express';

const router = Router();

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';
const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const STATE_TTL = 600; // 10 minutes

function getRedirectUri(provider: string): string {
  return `${API_URL}/auth/oauth/${provider}/callback`;
}

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

// ---------------------------------------------------------------------------
// GET /auth/oauth/providers — List available OAuth providers
// ---------------------------------------------------------------------------
router.get('/providers', (_req: Request, res: Response) => {
  res.json({ providers: listProviders().filter(p => p !== 'mock' || process.env.NODE_ENV !== 'production') });
});

// ---------------------------------------------------------------------------
// GET /auth/oauth/linked — Get user's linked providers (requires auth)
// Must be before /:provider to avoid matching "linked" as a provider name
// ---------------------------------------------------------------------------
router.get('/linked', requireAuth, async (req: Request, res: Response) => {
  const providers = await getUserProviders(req.userId!);
  res.json({ providers });
});

// ---------------------------------------------------------------------------
// GET /auth/oauth/mock/login — Mock provider login page (dev only)
// ---------------------------------------------------------------------------
router.get('/mock/login', (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const state = req.query.state as string;
  const redirectUri = req.query.redirect_uri as string;
  res.type('html').send(getMockLoginPage(state, redirectUri));
});

// ---------------------------------------------------------------------------
// GET /auth/oauth/:provider — Start OAuth flow (redirect to provider)
// ---------------------------------------------------------------------------
router.get('/:provider', async (req: Request, res: Response) => {
  const providerName = req.params.provider as string;
  const provider = getProvider(providerName);
  if (!provider) {
    res.status(404).json({ error: `Unknown OAuth provider: ${providerName}` });
    return;
  }

  // Generate state token and store in Redis
  const state = generateToken(32);
  const stateData = JSON.stringify({
    returnTo: req.query.returnTo ?? '/',
    linkToUser: req.query.linkToUser ?? null, // If set, link to existing user instead of sign-in
  });
  await redis.set(`oauth:state:${hashToken(state)}`, stateData, 'EX', STATE_TTL);

  const redirectUri = getRedirectUri(providerName);
  const authUrl = provider.getAuthUrl(state, redirectUri);
  res.redirect(authUrl);
});

// ---------------------------------------------------------------------------
// GET /auth/oauth/:provider/callback — OAuth callback
// ---------------------------------------------------------------------------
router.get('/:provider/callback', async (req: Request, res: Response) => {
  const providerName = req.params.provider as string;
  const { code, state, error } = req.query;

  if (error) {
    res.redirect(`${APP_URL}/app/auth-error?error=${encodeURIComponent(error as string)}`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${APP_URL}/app/auth-error?error=missing_params`);
    return;
  }

  // Validate state
  const stateKey = `oauth:state:${hashToken(state as string)}`;
  const stateDataRaw = await redis.get(stateKey);
  if (!stateDataRaw) {
    res.redirect(`${APP_URL}/app/auth-error?error=invalid_state`);
    return;
  }
  await redis.del(stateKey);
  const stateData = JSON.parse(stateDataRaw) as { returnTo: string; linkToUser: string | null };
  logger.info('OAuth callback state', { provider: providerName, returnTo: stateData.returnTo, linkToUser: !!stateData.linkToUser });

  const provider = getProvider(providerName);
  if (!provider) {
    res.redirect(`${APP_URL}/app/auth-error?error=unknown_provider`);
    return;
  }

  try {
    const redirectUri = getRedirectUri(providerName);
    const tokens = await provider.exchangeCode(code as string, redirectUri);
    const profile = await provider.getUserProfile(tokens.accessToken);

    // If linking to existing user (from account settings or provider setup)
    if (stateData.linkToUser) {
      await linkProviderToUser(stateData.linkToUser, providerName, profile, tokens, {
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });
      const returnTo = stateData.returnTo || `/settings?linked=${providerName}`;
      const redirectUrl = `${APP_URL}${returnTo}${returnTo.includes('?') ? '&' : '?'}linked=${providerName}`;
      logger.info('OAuth link redirect', { returnTo, redirectUrl, provider: providerName });
      res.redirect(redirectUrl);
      return;
    }

    // Normal sign-in / sign-up flow
    const result = await handleOAuthLogin(providerName, profile, tokens, {
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    const session = await createSession(result.userId, {
      rememberMe: true, // OAuth users typically want persistent sessions
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    setRefreshCookie(res, session.refreshToken, true);

    // Redirect to app with success indicator
    const returnTo = stateData.returnTo || '/';
    res.redirect(`${APP_URL}${returnTo}${returnTo.includes('?') ? '&' : '?'}auth=success&new=${result.isNewUser}`);
  } catch (err) {
    const code = (err as any)?.code;
    if (code === 'ACCOUNT_EXISTS_EMAIL_PASSWORD') {
      res.redirect(`${APP_URL}/app/auth-error?error=account_exists&provider=${providerName}`);
      return;
    }
    const message = err instanceof Error ? err.message : 'OAuth authentication failed';
    res.redirect(`${APP_URL}/app/auth-error?error=${encodeURIComponent(message)}`);
  }
});

// ---------------------------------------------------------------------------
// DELETE /auth/oauth/:provider — Unlink a provider (requires auth)
// ---------------------------------------------------------------------------
router.delete('/:provider', requireAuth, async (req: Request, res: Response) => {
  try {
    await unlinkProvider(req.userId!, req.params.provider as string, {
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });
    res.json({ message: `${req.params.provider} unlinked` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to unlink provider';
    res.status(400).json({ error: message });
  }
});

export default router;

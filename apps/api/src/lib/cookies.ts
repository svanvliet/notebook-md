import type { Response } from 'express';

const isProd = process.env.NODE_ENV === 'production';

// Derive cookie domain from APP_URL (e.g., https://www.notebookmd.io → .notebookmd.io)
function getCookieDomain(): string | undefined {
  if (!isProd) return undefined;
  const appUrl = process.env.APP_URL;
  if (!appUrl) return undefined;
  try {
    const hostname = new URL(appUrl).hostname;
    // Strip leading subdomain (www.) to get root domain
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return '.' + parts.slice(-2).join('.');
    }
    return undefined;
  } catch {
    return undefined;
  }
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  domain: getCookieDomain(),
  path: '/',
};

export function setRefreshCookie(res: Response, token: string, rememberMe: boolean) {
  res.cookie('refresh_token', token, {
    ...COOKIE_OPTIONS,
    maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie('refresh_token', COOKIE_OPTIONS);
}

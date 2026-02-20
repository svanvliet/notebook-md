import type { Response } from 'express';

const isProd = process.env.NODE_ENV === 'production';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  domain: isProd ? '.notebookmd.io' : undefined,
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

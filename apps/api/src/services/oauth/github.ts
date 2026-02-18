import type { OAuthProvider, OAuthTokens, OAuthUserProfile } from './types.js';

export function createGitHubProvider(clientId: string, clientSecret: string): OAuthProvider {
  return {
    name: 'github',

    getAuthUrl(state: string, redirectUri: string): string {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'read:user user:email',
        state,
      });
      return `https://github.com/login/oauth/authorize?${params.toString()}`;
    },

    async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
      });
      const data = await res.json() as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
        scopes: data.scope,
      };
    },

    async getUserProfile(accessToken: string): Promise<OAuthUserProfile> {
      const [userRes, emailsRes] = await Promise.all([
        fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Notebook.md' } }),
        fetch('https://api.github.com/user/emails', { headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Notebook.md' } }),
      ]);
      const user = await userRes.json() as { id: number; login: string; name: string | null; avatar_url: string };
      const emails = await emailsRes.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
      const primary = emails.find(e => e.primary && e.verified) ?? emails.find(e => e.verified);

      return {
        providerId: String(user.id),
        email: primary?.email ?? null,
        emailVerified: primary?.verified ?? false,
        displayName: user.name ?? user.login,
        avatarUrl: user.avatar_url,
      };
    },
  };
}

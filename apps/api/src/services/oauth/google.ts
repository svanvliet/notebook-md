import type { OAuthProvider, OAuthTokens, OAuthUserProfile } from './types.js';

export function createGoogleProvider(clientId: string, clientSecret: string): OAuthProvider {
  return {
    name: 'google',

    getAuthUrl(state: string, redirectUri: string): string {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        access_type: 'offline',
        prompt: 'consent',
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    },

    async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      });
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
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
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const user = await res.json() as { id: string; email: string; verified_email: boolean; name: string; picture: string };
      return {
        providerId: user.id,
        email: user.email ?? null,
        emailVerified: user.verified_email ?? false,
        displayName: user.name,
        avatarUrl: user.picture ?? null,
      };
    },
  };
}

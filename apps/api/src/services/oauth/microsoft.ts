import type { OAuthProvider, OAuthTokens, OAuthUserProfile } from './types.js';

export function createMicrosoftProvider(clientId: string, clientSecret: string, tenantId = 'common'): OAuthProvider {
  return {
    name: 'microsoft',

    getAuthUrl(state: string, redirectUri: string): string {
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: 'openid profile email User.Read Files.ReadWrite offline_access',
        state,
        response_mode: 'query',
      });
      return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
    },

    async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      });
      const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
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
      const res = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const user = await res.json() as { id: string; displayName: string; mail: string | null; userPrincipalName: string };
      const email = user.mail ?? (user.userPrincipalName?.includes('@') ? user.userPrincipalName : null);

      // Fetch photo
      let avatarUrl: string | null = null;
      try {
        const photoRes = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (photoRes.ok) {
          const blob = await photoRes.arrayBuffer();
          avatarUrl = `data:image/jpeg;base64,${Buffer.from(blob).toString('base64')}`;
        }
      } catch { /* no photo */ }

      return {
        providerId: user.id,
        email,
        emailVerified: true, // Microsoft emails are always verified
        displayName: user.displayName,
        avatarUrl,
      };
    },
  };
}

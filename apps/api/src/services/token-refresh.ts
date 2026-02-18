import { query } from '../db/pool.js';
import { encrypt, decryptOptional } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';

interface StoredTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string | null;
}

/**
 * Provider-specific token refresh implementations.
 * Returns new tokens if refreshed, or null if no refresh is needed/possible.
 */
const refreshers: Record<string, (refreshToken: string, clientId: string, clientSecret: string) => Promise<{ accessToken: string; refreshToken?: string; expiresAt?: Date } | null>> = {
  async microsoft(refreshToken, clientId, clientSecret) {
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  },

  async google(refreshToken, clientId, clientSecret) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token: string; expires_in: number };
    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  },

  // GitHub OAuth tokens don't expire (no refresh needed)
  // GitHub App installation tokens are handled separately
  async github() {
    return null;
  },
};

/**
 * Get a valid access token for a user's linked provider.
 * If the token is expired and a refresh token exists, refreshes it automatically.
 */
export async function getValidAccessToken(userId: string, provider: string): Promise<string | null> {
  const result = await query<{
    access_token_enc: string | null;
    refresh_token_enc: string | null;
    token_expires_at: Date | null;
    scopes: string | null;
    provider_user_id: string;
  }>(
    'SELECT access_token_enc, refresh_token_enc, token_expires_at, scopes, provider_user_id FROM identity_links WHERE user_id = $1 AND provider = $2',
    [userId, provider],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const accessToken = decryptOptional(row.access_token_enc);
  const refreshToken = decryptOptional(row.refresh_token_enc);

  if (!accessToken) return null;

  // Check if token is still valid (5-min buffer)
  if (row.token_expires_at) {
    const expiresAt = new Date(row.token_expires_at);
    const bufferMs = 5 * 60 * 1000;
    if (expiresAt.getTime() - bufferMs > Date.now()) {
      return accessToken; // still valid
    }

    // Token expired — try to refresh
    if (refreshToken) {
      const clientId = getClientId(provider);
      const clientSecret = getClientSecret(provider);
      const refreshFn = refreshers[provider];

      if (refreshFn && clientId && clientSecret) {
        try {
          const newTokens = await refreshFn(refreshToken, clientId, clientSecret);
          if (newTokens) {
            // Store refreshed tokens
            await query(
              `UPDATE identity_links SET access_token_enc = $1, refresh_token_enc = $2, token_expires_at = $3, updated_at = now()
               WHERE user_id = $4 AND provider = $5`,
              [
                encrypt(newTokens.accessToken),
                newTokens.refreshToken ? encrypt(newTokens.refreshToken) : row.refresh_token_enc,
                newTokens.expiresAt ?? null,
                userId,
                provider,
              ],
            );
            logger.info('Token refreshed', { userId, provider });
            return newTokens.accessToken;
          }
        } catch (err) {
          logger.error('Token refresh failed', { userId, provider, error: (err as Error).message });
        }
      }
    }

    // Expired and can't refresh
    return null;
  }

  // No expiry set (e.g., GitHub OAuth) — return as-is
  return accessToken;
}

function getClientId(provider: string): string | undefined {
  switch (provider) {
    case 'microsoft': return process.env.MICROSOFT_CLIENT_ID;
    case 'google': return process.env.GOOGLE_CLIENT_ID;
    case 'github': return process.env.GITHUB_CLIENT_ID;
    default: return undefined;
  }
}

function getClientSecret(provider: string): string | undefined {
  switch (provider) {
    case 'microsoft': return process.env.MICROSOFT_CLIENT_SECRET;
    case 'google': return process.env.GOOGLE_CLIENT_SECRET;
    case 'github': return process.env.GITHUB_CLIENT_SECRET;
    default: return undefined;
  }
}

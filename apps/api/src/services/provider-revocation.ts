/**
 * Provider token revocation.
 *
 * Best-effort revocation of OAuth tokens and app installations
 * when a user unlinks a provider. Failures are logged but never
 * block the unlink operation.
 */

import { logger } from '../lib/logger.js';
import { createAppJWT } from '../lib/github-app.js';

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

/**
 * Revoke a GitHub OAuth authorization grant.
 * This removes the app's authorization entirely — the user will need to
 * re-authorize the app on their next OAuth flow (consent screen appears).
 * Uses DELETE /applications/{client_id}/grant (not /token, which only
 * invalidates a single token without revoking the grant).
 * https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-authorization
 */
export async function revokeGitHubToken(accessToken: string): Promise<boolean> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    logger.warn('GitHub OAuth credentials not configured, skipping token revocation');
    return false;
  }

  try {
    const res = await fetch(`https://api.github.com/applications/${clientId}/grant`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Notebook.md',
      },
      body: JSON.stringify({ access_token: accessToken }),
    });

    if (res.ok || res.status === 204) {
      logger.info('GitHub OAuth token revoked');
      return true;
    }
    logger.warn('GitHub token revocation failed', { status: res.status });
    return false;
  } catch (err) {
    logger.warn('GitHub token revocation error', { error: (err as Error).message });
    return false;
  }
}

/**
 * Delete a GitHub App installation.
 * Authenticated as the GitHub App via JWT.
 * https://docs.github.com/en/rest/apps/installations#delete-an-installation
 */
export async function deleteGitHubInstallation(installationId: number): Promise<boolean> {
  try {
    const appJwt = createAppJWT();
    const res = await fetch(`https://api.github.com/app/installations/${installationId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Notebook.md',
      },
    });

    if (res.ok || res.status === 204) {
      logger.info('GitHub App installation deleted', { installationId });
      return true;
    }
    logger.warn('GitHub installation deletion failed', { installationId, status: res.status });
    return false;
  } catch (err) {
    logger.warn('GitHub installation deletion error', { installationId, error: (err as Error).message });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

/**
 * Revoke a Google OAuth token (access or refresh).
 * https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke
 */
export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(token)}`,
    });

    if (res.ok) {
      logger.info('Google OAuth token revoked');
      return true;
    }
    logger.warn('Google token revocation failed', { status: res.status });
    return false;
  } catch (err) {
    logger.warn('Google token revocation error', { error: (err as Error).message });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Microsoft
// ---------------------------------------------------------------------------

/**
 * Revoke a Microsoft OAuth refresh token.
 * Uses the RFC 7009 revocation endpoint.
 * https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc#send-a-sign-out-request
 */
export async function revokeMicrosoftToken(refreshToken: string): Promise<boolean> {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    logger.warn('Microsoft OAuth credentials not configured, skipping token revocation');
    return false;
  }

  try {
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: refreshToken,
        token_type_hint: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (res.ok) {
      logger.info('Microsoft OAuth token revoked');
      return true;
    }
    logger.warn('Microsoft token revocation failed', { status: res.status });
    return false;
  } catch (err) {
    logger.warn('Microsoft token revocation error', { error: (err as Error).message });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export interface ProviderTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

/**
 * Revoke all tokens for a provider. Best-effort: logs failures, never throws.
 */
export async function revokeProviderTokens(
  provider: string,
  tokens: ProviderTokens,
  installationIds?: number[],
): Promise<void> {
  try {
    switch (provider) {
      case 'github': {
        if (tokens.accessToken) await revokeGitHubToken(tokens.accessToken);
        if (installationIds) {
          await Promise.allSettled(installationIds.map((id) => deleteGitHubInstallation(id)));
        }
        break;
      }
      case 'google': {
        // Prefer refresh token — revoking it also invalidates access tokens
        const token = tokens.refreshToken ?? tokens.accessToken;
        if (token) await revokeGoogleToken(token);
        break;
      }
      case 'microsoft': {
        // Revoking the refresh token is the most effective for Microsoft
        const token = tokens.refreshToken ?? tokens.accessToken;
        if (token) await revokeMicrosoftToken(token);
        break;
      }
      default:
        logger.warn('No revocation handler for provider', { provider });
    }
  } catch (err) {
    logger.warn('Provider token revocation failed', { provider, error: (err as Error).message });
  }
}

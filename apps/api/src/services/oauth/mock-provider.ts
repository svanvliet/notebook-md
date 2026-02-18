/**
 * Mock OAuth Provider for local development.
 *
 * Instead of redirecting to a real OAuth provider, this serves a simple
 * HTML form at /auth/oauth/mock that lets the developer fill in a
 * fake profile (email, name, etc.) and submit. The callback handler
 * then processes it like a real OAuth flow.
 *
 * The "code" is a base64-encoded JSON of the fake profile.
 */

import type { OAuthProvider, OAuthTokens, OAuthUserProfile } from './types.js';

export const mockProvider: OAuthProvider = {
  name: 'mock',

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({ state, redirect_uri: redirectUri });
    return `/auth/oauth/mock/login?${params.toString()}`;
  },

  async exchangeCode(code: string): Promise<OAuthTokens> {
    // The "code" is the base64-encoded fake profile
    return {
      accessToken: `mock-access-${code}`,
      refreshToken: `mock-refresh-${code}`,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      scopes: 'profile email',
    };
  },

  async getUserProfile(accessToken: string): Promise<OAuthUserProfile> {
    // Extract the code from the access token
    const code = accessToken.replace('mock-access-', '');
    try {
      const profile = JSON.parse(Buffer.from(code, 'base64url').toString());
      return {
        providerId: profile.id || `mock-${Date.now()}`,
        email: profile.email || null,
        emailVerified: profile.emailVerified ?? true,
        displayName: profile.displayName || 'Mock User',
        avatarUrl: profile.avatarUrl || null,
      };
    } catch {
      return {
        providerId: `mock-${Date.now()}`,
        email: 'mock@example.com',
        emailVerified: true,
        displayName: 'Mock User',
        avatarUrl: null,
      };
    }
  },
};

/** Serve the mock login HTML form */
export function getMockLoginPage(state: string, redirectUri: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Mock OAuth Provider — Notebook.md Dev</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 420px; margin: 60px auto; padding: 24px; }
    h2 { color: #1a1a1a; }
    label { display: block; margin-top: 12px; font-weight: 500; font-size: 14px; }
    input { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; margin-top: 4px; font-size: 14px; box-sizing: border-box; }
    .checkbox-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
    .checkbox-row input { width: auto; }
    button { margin-top: 20px; width: 100%; padding: 10px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-size: 15px; font-weight: 500; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .note { font-size: 12px; color: #6b7280; margin-top: 16px; }
  </style>
</head>
<body>
  <h2>🔑 Mock OAuth Sign-In</h2>
  <p style="color:#6b7280;font-size:14px;">This is the development-only mock OAuth provider. Fill in the profile you want to simulate.</p>
  <form id="form">
    <input type="hidden" name="state" value="${state}" />
    <input type="hidden" name="redirect_uri" value="${redirectUri}" />
    <label>Provider User ID <input name="id" value="mock-user-1" required /></label>
    <label>Email <input name="email" type="email" value="mock@example.com" required /></label>
    <label>Display Name <input name="displayName" value="Mock User" required /></label>
    <label>Avatar URL <input name="avatarUrl" placeholder="https://..." /></label>
    <div class="checkbox-row">
      <input type="checkbox" name="emailVerified" id="emailVerified" checked />
      <label for="emailVerified" style="margin:0;display:inline;">Email Verified</label>
    </div>
    <button type="submit">Authorize & Continue</button>
    <p class="note">This form only appears in development mode.</p>
  </form>
  <script>
    document.getElementById('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const profile = {
        id: fd.get('id'),
        email: fd.get('email'),
        displayName: fd.get('displayName'),
        avatarUrl: fd.get('avatarUrl') || null,
        emailVerified: fd.has('emailVerified'),
      };
      const code = btoa(JSON.stringify(profile)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
      const redirectUri = fd.get('redirect_uri');
      const state = fd.get('state');
      window.location.href = redirectUri + '?code=' + encodeURIComponent(code) + '&state=' + encodeURIComponent(state);
    });
  </script>
</body>
</html>`;
}

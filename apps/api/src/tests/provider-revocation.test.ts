import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  revokeGitHubToken,
  deleteGitHubInstallation,
  revokeGoogleToken,
  revokeMicrosoftToken,
  revokeProviderTokens,
} from '../services/provider-revocation.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock createAppJWT (avoid needing real private key)
vi.mock('../lib/github-app.js', () => ({
  createAppJWT: () => 'mock-jwt-token',
}));

beforeEach(() => {
  mockFetch.mockReset();
  // Set env vars for tests
  process.env.GITHUB_CLIENT_ID = 'test-gh-client';
  process.env.GITHUB_CLIENT_SECRET = 'test-gh-secret';
  process.env.MICROSOFT_CLIENT_ID = 'test-ms-client';
  process.env.MICROSOFT_CLIENT_SECRET = 'test-ms-secret';
});

describe('revokeGitHubToken', () => {
  it('calls GitHub DELETE /applications/{client_id}/token with Basic Auth', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

    const result = await revokeGitHubToken('ghp_test123');

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/applications/test-gh-client/token',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ access_token: 'ghp_test123' }),
      }),
    );

    // Verify Basic Auth header
    const headers = mockFetch.mock.calls[0][1].headers;
    const expected = Buffer.from('test-gh-client:test-gh-secret').toString('base64');
    expect(headers.Authorization).toBe(`Basic ${expected}`);
  });

  it('returns false on failure without throwing', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const result = await revokeGitHubToken('ghp_invalid');
    expect(result).toBe(false);
  });

  it('returns false on network error without throwing', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));
    const result = await revokeGitHubToken('ghp_test');
    expect(result).toBe(false);
  });

  it('returns false when client credentials are missing', async () => {
    delete process.env.GITHUB_CLIENT_ID;
    const result = await revokeGitHubToken('ghp_test');
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('deleteGitHubInstallation', () => {
  it('calls DELETE /app/installations/{id} with App JWT', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

    const result = await deleteGitHubInstallation(12345);

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/app/installations/12345',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-jwt-token',
        }),
      }),
    );
  });

  it('returns false on failure without throwing', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    const result = await deleteGitHubInstallation(99999);
    expect(result).toBe(false);
  });
});

describe('revokeGoogleToken', () => {
  it('calls Google revoke endpoint with token as form data', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await revokeGoogleToken('ya29.test-token');

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/revoke',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `token=${encodeURIComponent('ya29.test-token')}`,
      }),
    );
  });

  it('returns false on failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });
    const result = await revokeGoogleToken('invalid');
    expect(result).toBe(false);
  });
});

describe('revokeMicrosoftToken', () => {
  it('calls Microsoft revoke endpoint with refresh token', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await revokeMicrosoftToken('rt-test-token');

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://login.microsoftonline.com/common/oauth2/v2.0/revoke',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );

    // Verify body contains required params
    const body = mockFetch.mock.calls[0][1].body;
    expect(body).toContain('token=rt-test-token');
    expect(body).toContain('token_type_hint=refresh_token');
    expect(body).toContain('client_id=test-ms-client');
    expect(body).toContain('client_secret=test-ms-secret');
  });

  it('returns false when client credentials are missing', async () => {
    delete process.env.MICROSOFT_CLIENT_ID;
    const result = await revokeMicrosoftToken('rt-test');
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('revokeProviderTokens', () => {
  it('dispatches to GitHub revocation with token + installations', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204 });

    await revokeProviderTokens(
      'github',
      { accessToken: 'ghp_abc', refreshToken: null },
      [111, 222],
    );

    // 1 token revocation + 2 installation deletions
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('dispatches to Google revocation preferring refresh token', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await revokeProviderTokens('google', {
      accessToken: 'ya29.access',
      refreshToken: '1//refresh',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = mockFetch.mock.calls[0][1].body;
    expect(body).toContain(encodeURIComponent('1//refresh'));
  });

  it('dispatches to Microsoft revocation', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await revokeProviderTokens('microsoft', {
      accessToken: null,
      refreshToken: 'rt-ms-token',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = mockFetch.mock.calls[0][1].body;
    expect(body).toContain('rt-ms-token');
  });

  it('handles unknown provider without throwing', async () => {
    await expect(
      revokeProviderTokens('apple', { accessToken: 'x', refreshToken: null }),
    ).resolves.not.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not throw when tokens are null', async () => {
    await expect(
      revokeProviderTokens('google', { accessToken: null, refreshToken: null }),
    ).resolves.not.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

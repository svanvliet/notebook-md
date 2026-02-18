import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { request, cleanDb, closeDb, signUp, extractRefreshToken } from './helpers.js';
import { query } from '../db/pool.js';

afterAll(async () => { await closeDb(); });

describe('OneDrive Routes', () => {
  let token: string;
  let userId: string;

  beforeEach(async () => {
    await cleanDb();
    const { res } = await signUp('oduser@test.com', 'password123');
    token = extractRefreshToken(res)!;
    const userRes = await request.get('/auth/me').set('Cookie', `refresh_token=${token}`);
    userId = userRes.body.user.id;
  });

  describe('GET /api/onedrive/status', () => {
    it('should return linked:false when no Microsoft account linked', async () => {
      const res = await request
        .get('/api/onedrive/status')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(200);
      expect(res.body.linked).toBe(false);
    });

    it('should reject unauthenticated access', async () => {
      const res = await request.get('/api/onedrive/status');
      expect(res.status).toBe(401);
    });

    it('should return linked:false when token is invalid/expired', async () => {
      // Insert a fake identity link with an expired/invalid token
      // Use raw string since ENCRYPTION_KEY may not be set in test env
      await query(
        `INSERT INTO identity_links (user_id, provider, provider_user_id, access_token_enc, token_expires_at)
         VALUES ($1, 'microsoft', 'fake-ms-id', 'fake-encrypted-token', $2)`,
        [userId, new Date(Date.now() - 86400000)], // expired yesterday
      );
      const res = await request
        .get('/api/onedrive/status')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(200);
      // Token is expired and no refresh token → linked:false
      expect(res.body.linked).toBe(false);
    });
  });

  describe('GET /api/onedrive/folders', () => {
    it('should return 401 when no Microsoft credentials', async () => {
      const res = await request
        .get('/api/onedrive/folders')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Microsoft');
    });

    it('should reject unauthenticated access', async () => {
      const res = await request.get('/api/onedrive/folders');
      expect(res.status).toBe(401);
    });
  });

  describe('Source proxy: /api/sources/onedrive', () => {
    it('should return 401 for file listing without credentials', async () => {
      const res = await request
        .get('/api/sources/onedrive/files?root=TestFolder')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('microsoft');
    });

    it('should return 401 for file read without credentials', async () => {
      const res = await request
        .get('/api/sources/onedrive/files/test.md?root=TestFolder')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(401);
    });

    it('should return 401 for file write without credentials', async () => {
      const res = await request
        .put('/api/sources/onedrive/files/test.md?root=TestFolder')
        .set('Cookie', `refresh_token=${token}`)
        .send({ content: '# Hello' });
      expect(res.status).toBe(401);
    });

    it('should return 401 for file create without credentials', async () => {
      const res = await request
        .post('/api/sources/onedrive/files/new.md?root=TestFolder')
        .set('Cookie', `refresh_token=${token}`)
        .send({ content: '' });
      expect(res.status).toBe(401);
    });

    it('should return 401 for file delete without credentials', async () => {
      const res = await request
        .delete('/api/sources/onedrive/files/test.md?root=TestFolder')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(401);
    });
  });

  describe('Adapter registration', () => {
    it('should have onedrive registered as a source adapter', async () => {
      // The sources route returns 404 for unknown providers and 401 for known ones without tokens
      // If onedrive is registered, we get 401 (no token), not 404 (unknown provider)
      const res = await request
        .get('/api/sources/onedrive/files?root=test')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(401); // 401 = adapter found but no token (good)
      // Verify unknown provider returns 404
      const unknownRes = await request
        .get('/api/sources/dropbox/files?root=test')
        .set('Cookie', `refresh_token=${token}`);
      expect(unknownRes.status).toBe(404);
    });
  });

  describe('Source proxy OAuth provider mapping', () => {
    it('should map onedrive source to microsoft OAuth provider in error message', async () => {
      const res = await request
        .get('/api/sources/onedrive/files?root=TestFolder')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(401);
      // Error should reference "microsoft" (OAuth provider), not "onedrive" (source adapter)
      expect(res.body.error).toContain('microsoft');
    });

    it('should return 404 for unknown source providers', async () => {
      const res = await request
        .get('/api/sources/dropbox/files?root=test')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Unknown source provider');
    });
  });

  describe('Microsoft OAuth scope', () => {
    it('should request Files.ReadWrite scope in auth URL', async () => {
      // Import the provider factory directly to verify scopes
      const { createMicrosoftProvider } = await import('../services/oauth/microsoft.js');
      const provider = createMicrosoftProvider('test-client-id', 'test-secret');
      const url = provider.getAuthUrl('test-state', 'http://localhost:3001/callback');
      expect(url).toContain('login.microsoftonline.com');
      expect(url).toContain('Files.ReadWrite');
      expect(url).toContain('offline_access');
      expect(url).toContain('User.Read');
    });
  });
});

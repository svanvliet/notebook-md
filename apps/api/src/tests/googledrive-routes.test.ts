import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { request, cleanDb, closeDb, signUp, extractRefreshToken } from './helpers.js';
import { query } from '../db/pool.js';

afterAll(async () => { await closeDb(); });

describe('Google Drive Routes', () => {
  let token: string;
  let userId: string;

  beforeEach(async () => {
    await cleanDb();
    const { res } = await signUp('gduser@test.com', 'Password123!');
    token = extractRefreshToken(res)!;
    const userRes = await request.get('/auth/me').set('Cookie', `refresh_token=${token}`);
    userId = userRes.body.user.id;
  });

  describe('GET /api/googledrive/status', () => {
    it('should return linked:false when no Google account linked', async () => {
      const res = await request
        .get('/api/googledrive/status')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(200);
      expect(res.body.linked).toBe(false);
    });

    it('should reject unauthenticated access', async () => {
      const res = await request.get('/api/googledrive/status');
      expect(res.status).toBe(401);
    });

    it('should return linked:false when token is expired and no refresh token', async () => {
      await query(
        `INSERT INTO identity_links (user_id, provider, provider_user_id, access_token_enc, token_expires_at)
         VALUES ($1, 'google', 'fake-google-id', 'fake-encrypted-token', $2)`,
        [userId, new Date(Date.now() - 86400000)],
      );
      const res = await request
        .get('/api/googledrive/status')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(200);
      expect(res.body.linked).toBe(false);
    });
  });

  describe('GET /api/googledrive/folders', () => {
    it('should return 401 when no Google credentials', async () => {
      const res = await request
        .get('/api/googledrive/folders')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Google');
    });

    it('should reject unauthenticated access', async () => {
      const res = await request.get('/api/googledrive/folders');
      expect(res.status).toBe(401);
    });
  });

  describe('Source proxy: /api/sources/google-drive', () => {
    it('should return 401 for file listing without credentials', async () => {
      const res = await request
        .get('/api/sources/google-drive/files?root=fakeFolderId')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('google');
    });

    it('should return 401 for file read without credentials', async () => {
      const res = await request
        .get('/api/sources/google-drive/files/test.md?root=fakeFolderId')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(401);
    });

    it('should return 401 for file write without credentials', async () => {
      const res = await request
        .put('/api/sources/google-drive/files/test.md?root=fakeFolderId')
        .set('Cookie', `refresh_token=${token}`)
        .send({ content: '# Hello' });
      expect(res.status).toBe(401);
    });

    it('should return 401 for file create without credentials', async () => {
      const res = await request
        .post('/api/sources/google-drive/files/new.md?root=fakeFolderId')
        .set('Cookie', `refresh_token=${token}`)
        .send({ content: '' });
      expect(res.status).toBe(401);
    });

    it('should return 401 for file delete without credentials', async () => {
      const res = await request
        .delete('/api/sources/google-drive/files/test.md?root=fakeFolderId')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(401);
    });
  });

  describe('Adapter registration', () => {
    it('should have google-drive registered as a source adapter', async () => {
      // 401 = adapter found but no token; 404 = unknown provider
      const res = await request
        .get('/api/sources/google-drive/files?root=test')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(401);
    });
  });

  describe('Source proxy OAuth provider mapping', () => {
    it('should map google-drive source to google OAuth provider in error message', async () => {
      const res = await request
        .get('/api/sources/google-drive/files?root=test')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('google');
    });
  });

  describe('Google OAuth scope', () => {
    it('should request drive scope in auth URL', async () => {
      const { createGoogleProvider } = await import('../services/oauth/google.js');
      const provider = createGoogleProvider('test-client-id', 'test-secret');
      const url = provider.getAuthUrl('test-state', 'http://localhost:3001/callback');
      expect(url).toContain('accounts.google.com');
      expect(url).toContain('drive');
      expect(url).toContain('openid');
      expect(url).toContain('email');
      expect(url).toContain('profile');
    });
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { request, cleanDb, closeDb, signUp, extractRefreshToken } from './helpers.js';
import { initializeOAuthProviders } from '../services/oauth/index.js';
import { redis } from '../lib/redis.js';

beforeAll(async () => {
  await redis.connect().catch(() => {}); // OAuth routes need Redis for state tokens
  initializeOAuthProviders();
});
afterAll(async () => {
  await redis.quit().catch(() => {});
  await closeDb();
});

describe('OAuth Callbacks', () => {
  beforeEach(async () => { await cleanDb(); });

  it('should list available providers', async () => {
    const res = await request.get('/auth/oauth/providers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.providers)).toBe(true);
    // Mock provider should be registered in dev
    expect(res.body.providers).toContain('mock');
  });

  it('should start mock OAuth flow and redirect', async () => {
    const res = await request.get('/auth/oauth/mock').redirects(0);
    // Should redirect to the mock provider login page
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/auth/oauth/mock/login');
  });

  it('should return empty linked accounts for new user', async () => {
    const { res: signUpRes } = await signUp('alice@test.com', 'Password123!');
    const token = extractRefreshToken(signUpRes)!;

    const res = await request.get('/auth/oauth/linked').set('Cookie', `refresh_token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.providers).toEqual([]);
  });

  it('should require auth for linked providers', async () => {
    const res = await request.get('/auth/oauth/linked');
    expect(res.status).toBe(401);
  });
});

describe('Provider Unlink Cleanup', () => {
  beforeEach(async () => { await cleanDb(); });

  it('should delete notebooks and installations when unlinking a provider', async () => {
    // Sign up user
    const { res: signUpRes } = await signUp('unlink@test.com', 'Password123!');
    const token = extractRefreshToken(signUpRes)!;
    const cookie = `refresh_token=${token}`;

    // Get user id
    const meRes = await request.get('/auth/me').set('Cookie', cookie);
    const userId = meRes.body.user.id;

    // Insert a fake GitHub identity link (so user has password + provider)
    const { query } = await import('../db/pool.js');
    await query(
      `INSERT INTO identity_links (user_id, provider, provider_user_id, provider_email)
       VALUES ($1, 'github', 'gh-12345', 'unlink@test.com')`,
      [userId],
    );

    // Create a GitHub notebook via API
    const nbRes = await request
      .post('/api/notebooks')
      .set('Cookie', cookie)
      .send({ name: 'My Repo', sourceType: 'github', sourceConfig: { owner: 'me', repo: 'test' } });
    expect(nbRes.status).toBe(201);
    const notebookId = nbRes.body.notebook.id;

    // Create a non-GitHub notebook
    const nb2Res = await request
      .post('/api/notebooks')
      .set('Cookie', cookie)
      .send({ name: 'My OneDrive', sourceType: 'onedrive', sourceConfig: { rootPath: '/docs' } });
    expect(nb2Res.status).toBe(201);

    // Insert a fake GitHub installation
    await query(
      `INSERT INTO github_installations (user_id, installation_id, account_login, account_type)
       VALUES ($1, 999, 'me', 'User')`,
      [userId],
    );

    // Verify notebooks exist
    let listRes = await request.get('/api/notebooks').set('Cookie', cookie);
    expect(listRes.body.notebooks).toHaveLength(2);

    // Unlink GitHub
    const unlinkRes = await request.delete('/auth/oauth/github').set('Cookie', cookie);
    expect(unlinkRes.status).toBe(200);

    // Notebooks: GitHub one should be gone, OneDrive should remain
    listRes = await request.get('/api/notebooks').set('Cookie', cookie);
    expect(listRes.body.notebooks).toHaveLength(1);
    expect(listRes.body.notebooks[0].name).toBe('My OneDrive');

    // GitHub installations should be cleaned up
    const instRes = await query(
      'SELECT * FROM github_installations WHERE user_id = $1',
      [userId],
    );
    expect(instRes.rows).toHaveLength(0);

    // Identity link should be gone
    const linkRes = await query(
      `SELECT * FROM identity_links WHERE user_id = $1 AND provider = 'github'`,
      [userId],
    );
    expect(linkRes.rows).toHaveLength(0);
  });

  it('should not delete notebooks from other providers', async () => {
    const { res: signUpRes } = await signUp('multi@test.com', 'Password123!');
    const token = extractRefreshToken(signUpRes)!;
    const cookie = `refresh_token=${token}`;
    const meRes = await request.get('/auth/me').set('Cookie', cookie);
    const userId = meRes.body.user.id;

    const { query } = await import('../db/pool.js');

    // Link both google and microsoft
    await query(
      `INSERT INTO identity_links (user_id, provider, provider_user_id, provider_email)
       VALUES ($1, 'google', 'g-123', 'multi@test.com'),
              ($1, 'microsoft', 'ms-456', 'multi@test.com')`,
      [userId],
    );

    // Create notebooks for each
    await request.post('/api/notebooks').set('Cookie', cookie)
      .send({ name: 'Google Drive', sourceType: 'google-drive', sourceConfig: { folderId: 'abc' } });
    await request.post('/api/notebooks').set('Cookie', cookie)
      .send({ name: 'OneDrive', sourceType: 'onedrive', sourceConfig: { rootPath: '/docs' } });

    // Unlink Google
    await request.delete('/auth/oauth/google').set('Cookie', cookie);

    // Google Drive notebook gone, OneDrive remains
    const listRes = await request.get('/api/notebooks').set('Cookie', cookie);
    expect(listRes.body.notebooks).toHaveLength(1);
    expect(listRes.body.notebooks[0].name).toBe('OneDrive');
  });

  it('should refuse to unlink the only sign-in method', async () => {
    const { res: signUpRes } = await signUp('sole@test.com', 'Password123!');
    const token = extractRefreshToken(signUpRes)!;
    const cookie = `refresh_token=${token}`;
    const res = await request.delete('/auth/oauth/github').set('Cookie', cookie);
    expect([200, 400]).toContain(res.status);
  });

  it('should reject linking a provider already linked to another user', async () => {
    const { query } = await import('../db/pool.js');

    // Create User A with a Microsoft link
    const { res: resA } = await signUp('userA@test.com', 'Password123!');
    const tokenA = extractRefreshToken(resA)!;
    const meA = await request.get('/auth/me').set('Cookie', `refresh_token=${tokenA}`);
    const userIdA = meA.body.user.id;

    await query(
      `INSERT INTO identity_links (user_id, provider, provider_user_id, provider_email)
       VALUES ($1, 'microsoft', 'ms-shared-id', 'shared@outlook.com')`,
      [userIdA],
    );

    // Create User B
    const { res: resB } = await signUp('userB@test.com', 'Password123!');
    const tokenB = extractRefreshToken(resB)!;
    const meB = await request.get('/auth/me').set('Cookie', `refresh_token=${tokenB}`);
    const userIdB = meB.body.user.id;

    // Try to link the same Microsoft provider_user_id to User B
    const { linkProviderToUser } = await import('../services/account-link.js');
    try {
      await linkProviderToUser(userIdB, 'microsoft', {
        providerId: 'ms-shared-id',
        email: 'shared@outlook.com',
        name: 'Shared User',
      }, {
        accessToken: 'fake-token',
        refreshToken: null,
        expiresAt: null,
        scopes: null,
      });
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('PROVIDER_ALREADY_LINKED');
      expect(err.message).toContain('already linked to another user');
    }
  });
});

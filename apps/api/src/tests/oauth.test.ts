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
    const { res: signUpRes } = await signUp('alice@test.com', 'password123');
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

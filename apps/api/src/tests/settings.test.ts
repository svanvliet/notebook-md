import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { request, cleanDb, closeDb, signUp, extractRefreshToken } from './helpers.js';

afterAll(async () => { await closeDb(); });

describe('Settings CRUD', () => {
  let token: string;

  beforeEach(async () => {
    await cleanDb();
    const { res } = await signUp('alice@test.com', 'Password123!');
    token = extractRefreshToken(res)!;
  });

  it('should return empty settings by default', async () => {
    const res = await request.get('/auth/settings').set('Cookie', `refresh_token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual({});
  });

  it('should save and retrieve settings', async () => {
    const settings = { displayMode: 'dark', fontSize: 16, fontFamily: 'Inter' };

    const putRes = await request
      .put('/auth/settings')
      .set('Cookie', `refresh_token=${token}`)
      .send({ settings });
    expect(putRes.status).toBe(200);

    const getRes = await request.get('/auth/settings').set('Cookie', `refresh_token=${token}`);
    expect(getRes.body.settings).toEqual(settings);
  });

  it('should overwrite settings on second PUT', async () => {
    await request.put('/auth/settings').set('Cookie', `refresh_token=${token}`).send({ settings: { a: 1 } });
    await request.put('/auth/settings').set('Cookie', `refresh_token=${token}`).send({ settings: { b: 2 } });

    const res = await request.get('/auth/settings').set('Cookie', `refresh_token=${token}`);
    expect(res.body.settings).toEqual({ b: 2 });
  });

  it('should persist settings across sessions', async () => {
    await request.put('/auth/settings').set('Cookie', `refresh_token=${token}`).send({ settings: { theme: 'dark' } });

    // Sign in again (new session)
    const { res: signInRes } = await (await import('./helpers.js')).signIn('alice@test.com', 'Password123!');
    const newToken = extractRefreshToken(signInRes)!;

    const res = await request.get('/auth/settings').set('Cookie', `refresh_token=${newToken}`);
    expect(res.body.settings).toEqual({ theme: 'dark' });
  });

  it('should reject unauthenticated access', async () => {
    const res = await request.get('/auth/settings');
    expect(res.status).toBe(401);
  });

  it('should reject invalid settings payload', async () => {
    const res = await request
      .put('/auth/settings')
      .set('Cookie', `refresh_token=${token}`)
      .send({ settings: 'not-an-object' });
    expect(res.status).toBe(400);
  });
});

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { cleanDb, signUp, request } from './helpers.js';
import { query } from '../db/pool.js';

// Ensure ENCRYPTION_KEY is set
beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32bytes!!!!';
  }
});

/** Create an admin user with 2FA enabled (required for admin access) */
async function createAdmin(email = 'admin@test.com', password = 'Password123!') {
  const { cookies } = await signUp(email, password, 'Admin User');
  // Enable email 2FA so admin middleware passes
  await request.post('/auth/2fa/enable').set('Cookie', cookies).send({ method: 'email' });
  // Set is_admin via DB (CLI-only in prod)
  await query('UPDATE users SET is_admin = true WHERE email = $1', [email]);
  return cookies;
}

/** Create a regular user */
async function createRegularUser(email = 'user@test.com', password = 'Password123!') {
  const { cookies } = await signUp(email, password, 'Regular User');
  return cookies;
}

describe('Admin Console API', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  // ── Auth ─────────────────────────────────────────────────────────────────

  describe('Admin auth', () => {
    it('should reject unauthenticated requests', async () => {
      await request.get('/admin/health').expect(401);
    });

    it('should reject non-admin users', async () => {
      const cookies = await createRegularUser();
      await request.get('/admin/health').set('Cookie', cookies).expect(403);
    });

    it('should reject admin without 2FA or OAuth', async () => {
      const { cookies } = await signUp('admin@test.com', 'Password123!', 'Admin');
      await query('UPDATE users SET is_admin = true WHERE email = $1', ['admin@test.com']);
      const res = await request.get('/admin/health').set('Cookie', cookies).expect(403);
      expect(res.body.error).toContain('two-factor');
    });

    it('should allow admin with 2FA enabled', async () => {
      const cookies = await createAdmin();
      await request.get('/admin/health').set('Cookie', cookies).expect(200);
    });
  });

  // ── Health ───────────────────────────────────────────────────────────────

  describe('GET /admin/health', () => {
    it('should return system health status', async () => {
      const cookies = await createAdmin();
      const res = await request.get('/admin/health').set('Cookie', cookies).expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.services.db.status).toBe('ok');
      expect(res.body.services.db.latencyMs).toBeGreaterThanOrEqual(0);
      expect(res.body.services.redis.status).toBe('ok');
      expect(res.body.services.redis.latencyMs).toBeGreaterThanOrEqual(0);
      expect(res.body.uptimeSeconds).toBeGreaterThan(0);
    });
  });

  // ── Metrics ──────────────────────────────────────────────────────────────

  describe('GET /admin/metrics', () => {
    it('should return usage metrics', async () => {
      const cookies = await createAdmin();
      const res = await request.get('/admin/metrics').set('Cookie', cookies).expect(200);
      expect(res.body.users.total).toBeGreaterThanOrEqual(1);
      expect(res.body.twoFactor).toBeDefined();
    });
  });

  // ── Users ────────────────────────────────────────────────────────────────

  describe('User management', () => {
    it('should list users with pagination', async () => {
      const cookies = await createAdmin();
      await createRegularUser();
      const res = await request.get('/admin/users').set('Cookie', cookies).expect(200);
      expect(res.body.users.length).toBeGreaterThanOrEqual(2);
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(2);
    });

    it('should search users by email', async () => {
      const cookies = await createAdmin();
      await createRegularUser('search-target@test.com');
      const res = await request.get('/admin/users?search=search-target').set('Cookie', cookies).expect(200);
      expect(res.body.users.length).toBe(1);
      expect(res.body.users[0].email).toBe('search-target@test.com');
    });

    it('should get user details', async () => {
      const cookies = await createAdmin();
      await createRegularUser('detail@test.com');
      const listRes = await request.get('/admin/users?search=detail@test.com').set('Cookie', cookies);
      const userId = listRes.body.users[0].id;

      const res = await request.get(`/admin/users/${userId}`).set('Cookie', cookies).expect(200);
      expect(res.body.user.email).toBe('detail@test.com');
      expect(res.body.notebookCount).toBeDefined();
      expect(res.body.activeSessions).toBeDefined();
    });

    it('should suspend a user and revoke their sessions', async () => {
      const cookies = await createAdmin();
      const userCookies = await createRegularUser('suspend@test.com');
      const listRes = await request.get('/admin/users?search=suspend@test.com').set('Cookie', cookies);
      const userId = listRes.body.users[0].id;

      // User can access their account before suspension
      await request.get('/auth/me').set('Cookie', userCookies).expect(200);

      await request
        .patch(`/admin/users/${userId}`)
        .set('Cookie', cookies)
        .send({ isSuspended: true })
        .expect(200);

      const detailRes = await request.get(`/admin/users/${userId}`).set('Cookie', cookies);
      expect(detailRes.body.user.isSuspended).toBe(true);

      // User's session is revoked — they get 401 (session invalid)
      const meRes = await request.get('/auth/me').set('Cookie', userCookies);
      expect([401, 403]).toContain(meRes.status);
    });

    it('should prevent self-modification', async () => {
      const cookies = await createAdmin();
      // Get admin's own user ID
      const meRes = await request.get('/auth/me').set('Cookie', cookies);
      const adminId = meRes.body.user.id;

      await request
        .patch(`/admin/users/${adminId}`)
        .set('Cookie', cookies)
        .send({ isSuspended: true })
        .expect(400);
    });

    it('should delete a user', async () => {
      const cookies = await createAdmin();
      await createRegularUser('delete@test.com');
      const listRes = await request.get('/admin/users?search=delete@test.com').set('Cookie', cookies);
      const userId = listRes.body.users[0].id;

      await request.delete(`/admin/users/${userId}`).set('Cookie', cookies).expect(200);

      await request.get(`/admin/users/${userId}`).set('Cookie', cookies).expect(404);
    });
  });

  // ── Feature Flags ──────────────────────────────────────────────────────

  describe('Feature flags', () => {
    it('should create and list feature flags', async () => {
      const cookies = await createAdmin();

      await request
        .post('/admin/feature-flags')
        .set('Cookie', cookies)
        .send({ key: 'beta_editor', enabled: true, description: 'Beta editor features' })
        .expect(200);

      const res = await request.get('/admin/feature-flags').set('Cookie', cookies).expect(200);
      expect(res.body.flags.length).toBe(1);
      expect(res.body.flags[0].key).toBe('beta_editor');
      expect(res.body.flags[0].enabled).toBe(true);
    });

    it('should upsert feature flags', async () => {
      const cookies = await createAdmin();

      await request.post('/admin/feature-flags').set('Cookie', cookies)
        .send({ key: 'test_flag', enabled: false });

      await request.post('/admin/feature-flags').set('Cookie', cookies)
        .send({ key: 'test_flag', enabled: true, description: 'Updated' });

      const res = await request.get('/admin/feature-flags').set('Cookie', cookies);
      expect(res.body.flags.length).toBe(1);
      expect(res.body.flags[0].enabled).toBe(true);
    });
  });

  // ── Announcements ──────────────────────────────────────────────────────

  describe('Announcements', () => {
    it('should CRUD announcements', async () => {
      const cookies = await createAdmin();

      // Create
      const createRes = await request
        .post('/admin/announcements')
        .set('Cookie', cookies)
        .send({ title: 'Maintenance', body: 'Planned downtime tonight' })
        .expect(200);
      const announcementId = createRes.body.id;

      // List
      let listRes = await request.get('/admin/announcements').set('Cookie', cookies).expect(200);
      expect(listRes.body.announcements.length).toBe(1);
      expect(listRes.body.announcements[0].title).toBe('Maintenance');

      // Update
      await request
        .put(`/admin/announcements/${announcementId}`)
        .set('Cookie', cookies)
        .send({ title: 'Updated Title', active: false })
        .expect(200);

      // Delete
      await request.delete(`/admin/announcements/${announcementId}`).set('Cookie', cookies).expect(200);
      listRes = await request.get('/admin/announcements').set('Cookie', cookies);
      expect(listRes.body.announcements.length).toBe(0);
    });
  });

  // ── Audit Log ──────────────────────────────────────────────────────────

  describe('Audit log', () => {
    it('should return audit log entries', async () => {
      const cookies = await createAdmin();
      // The sign-up and 2FA enable already created audit entries
      const res = await request.get('/admin/audit-log').set('Cookie', cookies).expect(200);
      expect(res.body.entries.length).toBeGreaterThan(0);
      expect(res.body.pagination).toBeDefined();
    });

    it('should filter audit log by action', async () => {
      const cookies = await createAdmin();
      const res = await request
        .get('/admin/audit-log?action=sign_up')
        .set('Cookie', cookies)
        .expect(200);
      expect(res.body.entries.every((e: { action: string }) => e.action === 'sign_up')).toBe(true);
    });
  });
});

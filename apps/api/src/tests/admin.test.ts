import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { cleanDb, signUp, request, createTestAdmin, createTestUser } from './helpers.js';
import { query } from '../db/pool.js';

// Ensure ENCRYPTION_KEY is set
beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32bytes!!!!';
  }
});

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
      const cookies = await createTestUser('user@test.com').then(r => r.cookies);
      await request.get('/admin/health').set('Cookie', cookies).expect(403);
    });

    it('should reject admin without 2FA or OAuth', async () => {
      const { cookies } = await signUp('admin@test.com', 'Password123!', 'Admin');
      await query('UPDATE users SET is_admin = true WHERE email = $1', ['admin@test.com']);
      const res = await request.get('/admin/health').set('Cookie', cookies).expect(403);
      expect(res.body.error).toContain('two-factor');
    });

    it('should allow admin with 2FA enabled', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      await request.get('/admin/health').set('Cookie', cookies).expect(200);
    });
  });

  // ── Health ───────────────────────────────────────────────────────────────

  describe('GET /admin/health', () => {
    it('should return system health status', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      const res = await request.get('/admin/health').set('Cookie', cookies).expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.services.db.status).toBe('ok');
      expect(res.body.services.db.latencyMs).toBeGreaterThanOrEqual(0);
      expect(res.body.services.redis.status).toBe('ok');
      expect(res.body.services.redis.latencyMs).toBeGreaterThanOrEqual(0);
      expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Metrics ──────────────────────────────────────────────────────────────

  describe('GET /admin/metrics', () => {
    it('should return usage metrics', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      const res = await request.get('/admin/metrics').set('Cookie', cookies).expect(200);
      expect(res.body.users.total).toBeGreaterThanOrEqual(1);
      expect(res.body.twoFactor).toBeDefined();
    });
  });

  // ── Users ────────────────────────────────────────────────────────────────

  describe('User management', () => {
    it('should list users with pagination', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      await createTestUser('user@test.com').then(r => r.cookies);
      const res = await request.get('/admin/users').set('Cookie', cookies).expect(200);
      expect(res.body.users.length).toBeGreaterThanOrEqual(2);
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(2);
    });

    it('should search users by email', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      await createTestUser('search-target@test.com').then(r => r.cookies);
      const res = await request.get('/admin/users?search=search-target').set('Cookie', cookies).expect(200);
      expect(res.body.users.length).toBe(1);
      expect(res.body.users[0].email).toBe('search-target@test.com');
    });

    it('should get user details', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      await createTestUser('detail@test.com').then(r => r.cookies);
      const listRes = await request.get('/admin/users?search=detail@test.com').set('Cookie', cookies);
      const userId = listRes.body.users[0].id;

      const res = await request.get(`/admin/users/${userId}`).set('Cookie', cookies).expect(200);
      expect(res.body.user.email).toBe('detail@test.com');
      expect(res.body.notebookCount).toBeDefined();
      expect(res.body.activeSessions).toBeDefined();
    });

    it('should suspend a user and revoke their sessions', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      const userCookies = await createTestUser('suspend@test.com').then(r => r.cookies);
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
      const cookies = await createTestAdmin().then(r => r.cookies);
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
      const cookies = await createTestAdmin().then(r => r.cookies);
      await createTestUser('delete@test.com').then(r => r.cookies);
      const listRes = await request.get('/admin/users?search=delete@test.com').set('Cookie', cookies);
      const userId = listRes.body.users[0].id;

      await request.delete(`/admin/users/${userId}`).set('Cookie', cookies).expect(200);

      await request.get(`/admin/users/${userId}`).set('Cookie', cookies).expect(404);
    });
  });

  // ── Feature Flags ──────────────────────────────────────────────────────

  describe('Feature flags', () => {
    it('should create and list feature flags', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);

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
      const cookies = await createTestAdmin().then(r => r.cookies);

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
      const cookies = await createTestAdmin().then(r => r.cookies);

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
      const cookies = await createTestAdmin().then(r => r.cookies);
      // createTestUser bypasses API, so seed an audit entry manually
      await query(
        `INSERT INTO audit_log (user_id, action, details) VALUES ((SELECT id FROM users LIMIT 1), 'sign_up', '{}'::jsonb)`,
      );
      const res = await request.get('/admin/audit-log').set('Cookie', cookies).expect(200);
      expect(res.body.entries.length).toBeGreaterThan(0);
      expect(res.body.pagination).toBeDefined();
    });

    it('should filter audit log by action', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      const res = await request
        .get('/admin/audit-log?action=sign_up')
        .set('Cookie', cookies)
        .expect(200);
      expect(res.body.entries.every((e: { action: string }) => e.action === 'sign_up')).toBe(true);
    });
  });

  // ── Phase 2: Enhanced User Management ──────────────────────────────────

  describe('User sort/filter', () => {
    it('should sort users by email ascending', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      await createTestUser('alice@test.com');
      await createTestUser('bob@test.com');
      const res = await request
        .get('/admin/users?sort=email&order=asc')
        .set('Cookie', cookies)
        .expect(200);
      const emails = res.body.users.map((u: { email: string }) => u.email);
      expect(emails).toEqual([...emails].sort());
    });

    it('should sort users by name descending', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      await createTestUser('user1@test.com');
      const res = await request
        .get('/admin/users?sort=name&order=desc')
        .set('Cookie', cookies)
        .expect(200);
      expect(res.body.users.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by suspended status', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      const { userId } = await createTestUser('suspended@test.com');
      await query('UPDATE users SET is_suspended = true WHERE id = $1', [userId]);
      const res = await request
        .get('/admin/users?status=suspended')
        .set('Cookie', cookies)
        .expect(200);
      expect(res.body.users.every((u: { isSuspended: boolean }) => u.isSuspended)).toBe(true);
      expect(res.body.users.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter active users only', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      const { userId } = await createTestUser('tosuspend@test.com');
      await query('UPDATE users SET is_suspended = true WHERE id = $1', [userId]);
      await createTestUser('active@test.com');
      const res = await request
        .get('/admin/users?status=active')
        .set('Cookie', cookies)
        .expect(200);
      expect(res.body.users.every((u: { isSuspended: boolean }) => !u.isSuspended)).toBe(true);
    });

    it('should fallback to default sort for invalid column', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      const res = await request
        .get('/admin/users?sort=invalid_column')
        .set('Cookie', cookies)
        .expect(200);
      expect(res.body.users.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('User search autocomplete', () => {
    it('should search users by email prefix', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      await createTestUser('searchable@test.com');
      const res = await request
        .get('/admin/users/search?q=search')
        .set('Cookie', cookies)
        .expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('email');
      expect(res.body[0]).toHaveProperty('displayName');
    });

    it('should return max 10 results', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      for (let i = 0; i < 12; i++) {
        await createTestUser(`batch${i}@test.com`);
      }
      const res = await request
        .get('/admin/users/search?q=batch')
        .set('Cookie', cookies)
        .expect(200);
      expect(res.body.length).toBeLessThanOrEqual(10);
    });

    it('should require min 2 character query', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      await request
        .get('/admin/users/search?q=a')
        .set('Cookie', cookies)
        .expect(400);
    });
  });

  describe('Enriched user detail', () => {
    it('should include lastActiveAt in user detail', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      const { userId } = await createTestUser('detail@test.com');
      await query('UPDATE users SET last_active_at = now() WHERE id = $1', [userId]);
      const res = await request
        .get(`/admin/users/${userId}`)
        .set('Cookie', cookies)
        .expect(200);
      expect(res.body.user.lastActiveAt).toBeDefined();
    });

    it('should include groups in user detail', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      const { userId } = await createTestUser('grouped@test.com');
      // Create a group and add the user
      const gRes = await request
        .post('/admin/groups')
        .set('Cookie', cookies)
        .send({ name: 'Test Group', description: 'For testing' })
        .expect(201);
      const groupId = gRes.body.id;
      await request
        .post(`/admin/groups/${groupId}/members`)
        .set('Cookie', cookies)
        .send({ userIds: [userId] })
        .expect(200);
      const res = await request
        .get(`/admin/users/${userId}`)
        .set('Cookie', cookies)
        .expect(200);
      expect(res.body.groups).toBeDefined();
      expect(res.body.groups.length).toBe(1);
      expect(res.body.groups[0].name).toBe('Test Group');
    });

    it('should include resolvedFlags in user detail', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      const { userId } = await createTestUser('flagged@test.com');
      // Create a feature flag
      await request
        .post('/admin/feature-flags')
        .set('Cookie', cookies)
        .send({ key: 'test_detail_flag', enabled: true, description: 'Test flag' })
        .expect(200);
      const res = await request
        .get(`/admin/users/${userId}`)
        .set('Cookie', cookies)
        .expect(200);
      expect(res.body.resolvedFlags).toBeDefined();
      expect(typeof res.body.resolvedFlags).toBe('object');
    });
  });

  describe('Force logout', () => {
    it('should revoke all sessions for a user', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      const { userId, cookies: userCookies } = await createTestUser('logout@test.com');
      const res = await request
        .post(`/admin/users/${userId}/logout`)
        .set('Cookie', cookies)
        .expect(200);
      expect(res.body.message).toContain('revoked');
      expect(res.body.count).toBeGreaterThanOrEqual(1);
      // Verify user's session is invalid
      await request
        .get('/auth/me')
        .set('Cookie', userCookies)
        .expect(401);
    });

    it('should audit log force-logout action', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      const { userId } = await createTestUser('auditlogout@test.com');
      await request
        .post(`/admin/users/${userId}/logout`)
        .set('Cookie', cookies)
        .expect(200);
      const logRes = await request
        .get('/admin/audit-log?action=admin_action')
        .set('Cookie', cookies)
        .expect(200);
      const logoutEntries = logRes.body.entries.filter(
        (e: { details: { type?: string } }) => e.details?.type === 'user_force_logout'
      );
      expect(logoutEntries.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Flag Archival ───────────────────────────────────────────────────────

  describe('Flag archival', () => {
    it('should archive a flag', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      await request.post('/admin/feature-flags').set('Cookie', cookies)
        .send({ key: 'archive_test', enabled: true, description: 'Test' }).expect(200);
      await request.post('/admin/feature-flags/archive_test/archive').set('Cookie', cookies)
        .send({ archived: true }).expect(200);
      // Should not appear in default list
      const res = await request.get('/admin/feature-flags').set('Cookie', cookies).expect(200);
      expect(res.body.flags.find((f: any) => f.key === 'archive_test')).toBeUndefined();
      // Should appear in archived list
      const archived = await request.get('/admin/feature-flags?archived=true').set('Cookie', cookies).expect(200);
      expect(archived.body.flags.find((f: any) => f.key === 'archive_test')).toBeDefined();
    });

    it('should unarchive a flag', async () => {
      const cookies = await createTestAdmin().then(r => r.cookies);
      await request.post('/admin/feature-flags').set('Cookie', cookies)
        .send({ key: 'unarchive_test', enabled: false, description: 'Test' }).expect(200);
      await request.post('/admin/feature-flags/unarchive_test/archive').set('Cookie', cookies)
        .send({ archived: true }).expect(200);
      await request.post('/admin/feature-flags/unarchive_test/archive').set('Cookie', cookies)
        .send({ archived: false }).expect(200);
      const res = await request.get('/admin/feature-flags').set('Cookie', cookies).expect(200);
      expect(res.body.flags.find((f: any) => f.key === 'unarchive_test')).toBeDefined();
    });
  });
});

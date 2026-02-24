import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { cleanDb, closeDb, signUp, request } from './helpers.js';
import { query } from '../db/pool.js';
import { clearFlagCache } from '../services/featureFlags.js';

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32bytes!!!!';
  }
});

async function createAdmin(email = 'admin@test.com', password = 'Password123!') {
  const { cookies } = await signUp(email, password, 'Admin User');
  await request.post('/auth/2fa/enable').set('Cookie', cookies).send({ method: 'email' });
  await query('UPDATE users SET is_admin = true WHERE email = $1', [email]);
  return cookies;
}

async function createUser(email: string, name = 'Test User') {
  const { cookies, res } = await signUp(email, 'Password123!', name);
  const userId = (await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email])).rows[0].id;
  return { cookies, userId };
}

describe('Flighting Admin API', () => {
  let adminCookies: string;

  beforeEach(async () => {
    await cleanDb();
    clearFlagCache();
    adminCookies = await createAdmin();
  });

  afterAll(async () => {
    await closeDb();
  });

  // ── Groups ──────────────────────────────────────────────────────────────

  describe('Groups CRUD', () => {
    it('creates a group', async () => {
      const res = await request.post('/admin/groups').set('Cookie', adminCookies)
        .send({ name: 'Beta Testers', description: 'Early access group', allowSelfEnroll: true });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
    });

    it('lists groups with member count', async () => {
      await request.post('/admin/groups').set('Cookie', adminCookies)
        .send({ name: 'Group A' });
      await request.post('/admin/groups').set('Cookie', adminCookies)
        .send({ name: 'Group B' });

      const res = await request.get('/admin/groups').set('Cookie', adminCookies);
      expect(res.status).toBe(200);
      expect(res.body.groups).toHaveLength(2);
      expect(res.body.groups[0]).toHaveProperty('memberCount', 0);
    });

    it('gets group detail with members', async () => {
      const createRes = await request.post('/admin/groups').set('Cookie', adminCookies)
        .send({ name: 'Detail Group', emailDomain: 'example.com' });
      const groupId = createRes.body.id;

      const res = await request.get(`/admin/groups/${groupId}`).set('Cookie', adminCookies);
      expect(res.status).toBe(200);
      expect(res.body.group.name).toBe('Detail Group');
      expect(res.body.group.emailDomain).toBe('example.com');
      expect(res.body.members).toEqual([]);
    });

    it('updates a group', async () => {
      const createRes = await request.post('/admin/groups').set('Cookie', adminCookies)
        .send({ name: 'Old Name' });
      const groupId = createRes.body.id;

      await request.patch(`/admin/groups/${groupId}`).set('Cookie', adminCookies)
        .send({ name: 'New Name' }).expect(200);

      const detail = await request.get(`/admin/groups/${groupId}`).set('Cookie', adminCookies);
      expect(detail.body.group.name).toBe('New Name');
    });

    it('deletes a group', async () => {
      const createRes = await request.post('/admin/groups').set('Cookie', adminCookies)
        .send({ name: 'To Delete' });
      const groupId = createRes.body.id;

      await request.delete(`/admin/groups/${groupId}`).set('Cookie', adminCookies).expect(200);
      await request.get(`/admin/groups/${groupId}`).set('Cookie', adminCookies).expect(404);
    });

    it('adds and removes members', async () => {
      const createRes = await request.post('/admin/groups').set('Cookie', adminCookies)
        .send({ name: 'Members Group' });
      const groupId = createRes.body.id;

      const { userId } = await createUser('member@test.com');

      // Add member
      const addRes = await request.post(`/admin/groups/${groupId}/members`)
        .set('Cookie', adminCookies)
        .send({ userIds: [userId] });
      expect(addRes.status).toBe(200);
      expect(addRes.body.message).toContain('1');

      // Verify member appears in detail
      const detail = await request.get(`/admin/groups/${groupId}`).set('Cookie', adminCookies);
      expect(detail.body.members).toHaveLength(1);
      expect(detail.body.members[0].email).toBe('member@test.com');

      // Remove member
      await request.delete(`/admin/groups/${groupId}/members/${userId}`)
        .set('Cookie', adminCookies).expect(200);

      const detail2 = await request.get(`/admin/groups/${groupId}`).set('Cookie', adminCookies);
      expect(detail2.body.members).toHaveLength(0);
    });

    it('returns 404 for non-existent group', async () => {
      await request.get('/admin/groups/00000000-0000-0000-0000-000000000000')
        .set('Cookie', adminCookies).expect(404);
    });
  });

  // ── Flights ─────────────────────────────────────────────────────────────

  describe('Flights CRUD', () => {
    it('creates a flight with flags', async () => {
      await query("INSERT INTO feature_flags (key, enabled) VALUES ('test_flag', true)");

      const res = await request.post('/admin/flights').set('Cookie', adminCookies)
        .send({ name: 'Beta Flight', description: 'First beta', flagKeys: ['test_flag'], showBadge: true });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();

      const detail = await request.get(`/admin/flights/${res.body.id}`).set('Cookie', adminCookies);
      expect(detail.body.flight.name).toBe('Beta Flight');
      expect(detail.body.flight.showBadge).toBe(true);
      expect(detail.body.flags).toEqual(['test_flag']);
    });

    it('lists flights with counts', async () => {
      await request.post('/admin/flights').set('Cookie', adminCookies)
        .send({ name: 'Flight 1' });
      await request.post('/admin/flights').set('Cookie', adminCookies)
        .send({ name: 'Flight 2' });

      const res = await request.get('/admin/flights').set('Cookie', adminCookies);
      expect(res.status).toBe(200);
      expect(res.body.flights).toHaveLength(2);
      expect(res.body.flights[0]).toHaveProperty('flagCount');
      expect(res.body.flights[0]).toHaveProperty('assignmentCount');
    });

    it('updates a flight', async () => {
      const createRes = await request.post('/admin/flights').set('Cookie', adminCookies)
        .send({ name: 'Old Flight' });

      await request.patch(`/admin/flights/${createRes.body.id}`).set('Cookie', adminCookies)
        .send({ name: 'Updated Flight', enabled: false }).expect(200);

      const detail = await request.get(`/admin/flights/${createRes.body.id}`).set('Cookie', adminCookies);
      expect(detail.body.flight.name).toBe('Updated Flight');
      expect(detail.body.flight.enabled).toBe(false);
    });

    it('deletes a flight', async () => {
      const createRes = await request.post('/admin/flights').set('Cookie', adminCookies)
        .send({ name: 'To Delete' });

      await request.delete(`/admin/flights/${createRes.body.id}`).set('Cookie', adminCookies).expect(200);
      await request.get(`/admin/flights/${createRes.body.id}`).set('Cookie', adminCookies).expect(404);
    });

    it('adds and removes flags from a flight', async () => {
      await query("INSERT INTO feature_flags (key, enabled) VALUES ('flag_a', true), ('flag_b', true)");

      const createRes = await request.post('/admin/flights').set('Cookie', adminCookies)
        .send({ name: 'Flag Flight' });
      const flightId = createRes.body.id;

      // Add flags
      const addRes = await request.post(`/admin/flights/${flightId}/flags`)
        .set('Cookie', adminCookies).send({ flagKeys: ['flag_a', 'flag_b'] });
      expect(addRes.body.message).toContain('2');

      // Remove one flag
      await request.delete(`/admin/flights/${flightId}/flags/flag_a`)
        .set('Cookie', adminCookies).expect(200);

      const detail = await request.get(`/admin/flights/${flightId}`).set('Cookie', adminCookies);
      expect(detail.body.flags).toEqual(['flag_b']);
    });

    it('assigns a user to a flight', async () => {
      const createRes = await request.post('/admin/flights').set('Cookie', adminCookies)
        .send({ name: 'Assign Flight' });
      const flightId = createRes.body.id;
      const { userId } = await createUser('flyer@test.com');

      const assignRes = await request.post(`/admin/flights/${flightId}/assign`)
        .set('Cookie', adminCookies).send({ userId });
      expect(assignRes.status).toBe(201);
      expect(assignRes.body.id).toBeTruthy();

      const detail = await request.get(`/admin/flights/${flightId}`).set('Cookie', adminCookies);
      expect(detail.body.assignments).toHaveLength(1);
      expect(detail.body.assignments[0].email).toBe('flyer@test.com');
    });

    it('assigns a group to a flight', async () => {
      const groupRes = await request.post('/admin/groups').set('Cookie', adminCookies)
        .send({ name: 'Flight Group' });
      const groupId = groupRes.body.id;

      const flightRes = await request.post('/admin/flights').set('Cookie', adminCookies)
        .send({ name: 'Group Flight' });
      const flightId = flightRes.body.id;

      const assignRes = await request.post(`/admin/flights/${flightId}/assign`)
        .set('Cookie', adminCookies).send({ groupId });
      expect(assignRes.status).toBe(201);

      const detail = await request.get(`/admin/flights/${flightId}`).set('Cookie', adminCookies);
      expect(detail.body.assignments).toHaveLength(1);
      expect(detail.body.assignments[0].groupName).toBe('Flight Group');
    });

    it('removes an assignment', async () => {
      const flightRes = await request.post('/admin/flights').set('Cookie', adminCookies)
        .send({ name: 'Unassign Flight' });
      const flightId = flightRes.body.id;
      const { userId } = await createUser('unassign@test.com');

      const assignRes = await request.post(`/admin/flights/${flightId}/assign`)
        .set('Cookie', adminCookies).send({ userId });

      await request.delete(`/admin/flights/${flightId}/assignments/${assignRes.body.id}`)
        .set('Cookie', adminCookies).expect(200);

      const detail = await request.get(`/admin/flights/${flightId}`).set('Cookie', adminCookies);
      expect(detail.body.assignments).toHaveLength(0);
    });
  });

  // ── Overrides ───────────────────────────────────────────────────────────

  describe('Overrides CRUD', () => {
    it('creates and lists overrides for a flag', async () => {
      await query("INSERT INTO feature_flags (key, enabled) VALUES ('override_flag', true)");
      const { userId } = await createUser('override@test.com');

      // Create override
      const createRes = await request.post('/admin/feature-flags/override_flag/overrides')
        .set('Cookie', adminCookies)
        .send({ userId, enabled: false, reason: 'Testing disable' });
      expect(createRes.status).toBe(200);

      // List overrides
      const listRes = await request.get('/admin/feature-flags/override_flag/overrides')
        .set('Cookie', adminCookies);
      expect(listRes.body.overrides).toHaveLength(1);
      expect(listRes.body.overrides[0].enabled).toBe(false);
      expect(listRes.body.overrides[0].reason).toBe('Testing disable');
      expect(listRes.body.overrides[0].email).toBe('override@test.com');
    });

    it('deletes an override', async () => {
      await query("INSERT INTO feature_flags (key, enabled) VALUES ('del_flag', true)");
      const { userId } = await createUser('del-override@test.com');

      await request.post('/admin/feature-flags/del_flag/overrides')
        .set('Cookie', adminCookies).send({ userId, enabled: true });

      await request.delete(`/admin/feature-flags/del_flag/overrides/${userId}`)
        .set('Cookie', adminCookies).expect(200);

      const list = await request.get('/admin/feature-flags/del_flag/overrides')
        .set('Cookie', adminCookies);
      expect(list.body.overrides).toHaveLength(0);
    });

    it('returns 404 for override on non-existent flag', async () => {
      const { userId } = await createUser('no-flag@test.com');
      await request.post('/admin/feature-flags/no_such_flag/overrides')
        .set('Cookie', adminCookies).send({ userId, enabled: true }).expect(404);
    });
  });

  // ── Enhanced Feature Flags ──────────────────────────────────────────────

  describe('Enhanced Feature Flags', () => {
    it('lists flags with rolloutPercentage and variants', async () => {
      await query(
        `INSERT INTO feature_flags (key, enabled, rollout_percentage, variants) VALUES ('pct_flag', true, 50, '["a","b"]')`,
      );

      const res = await request.get('/admin/feature-flags').set('Cookie', adminCookies);
      const flag = res.body.flags.find((f: any) => f.key === 'pct_flag');
      expect(flag.rolloutPercentage).toBe(50);
      expect(flag.variants).toEqual(['a', 'b']);
    });

    it('creates a flag with rolloutPercentage', async () => {
      await request.post('/admin/feature-flags').set('Cookie', adminCookies)
        .send({ key: 'new_pct', enabled: true, rolloutPercentage: 25 }).expect(200);

      const res = await request.get('/admin/feature-flags').set('Cookie', adminCookies);
      const flag = res.body.flags.find((f: any) => f.key === 'new_pct');
      expect(flag.rolloutPercentage).toBe(25);
    });
  });

  // ── User Flag Resolution ───────────────────────────────────────────────

  describe('User Flag Resolution', () => {
    it('returns resolved flags for a user with sources', async () => {
      const { userId } = await createUser('resolve@test.com');
      await query("INSERT INTO feature_flags (key, enabled) VALUES ('on_flag', true)");
      await query("INSERT INTO feature_flags (key, enabled) VALUES ('off_flag', false)");

      const res = await request.get(`/admin/users/${userId}/flags`).set('Cookie', adminCookies);
      expect(res.status).toBe(200);
      expect(res.body.flags.on_flag.enabled).toBe(true);
      expect(res.body.flags.on_flag.source).toBe('global');
      expect(res.body.flags.off_flag.enabled).toBe(false);
      expect(res.body.flags.off_flag.source).toBe('kill_switch');
    });

    it('shows override source for user with override', async () => {
      const { userId } = await createUser('overridden@test.com');
      await query("INSERT INTO feature_flags (key, enabled) VALUES ('ov_flag', true)");
      await query('INSERT INTO flag_overrides (flag_key, user_id, enabled) VALUES ($1, $2, false)', ['ov_flag', userId]);

      const res = await request.get(`/admin/users/${userId}/flags`).set('Cookie', adminCookies);
      expect(res.body.flags.ov_flag.enabled).toBe(false);
      expect(res.body.flags.ov_flag.source).toBe('override');
    });

    it('returns 404 for non-existent user', async () => {
      await request.get('/admin/users/00000000-0000-0000-0000-000000000000/flags')
        .set('Cookie', adminCookies).expect(404);
    });
  });

  // ── Cache Invalidation ─────────────────────────────────────────────────

  describe('Cache Invalidation', () => {
    it('flag update immediately affects resolution', async () => {
      const { userId } = await createUser('cache@test.com');
      await query("INSERT INTO feature_flags (key, enabled) VALUES ('cache_flag', true)");

      // First resolve: should be enabled
      let res = await request.get(`/admin/users/${userId}/flags`).set('Cookie', adminCookies);
      expect(res.body.flags.cache_flag.enabled).toBe(true);

      // Update flag to disabled (admin POST clears cache)
      await request.post('/admin/feature-flags').set('Cookie', adminCookies)
        .send({ key: 'cache_flag', enabled: false });

      // Resolve again: should now be disabled
      res = await request.get(`/admin/users/${userId}/flags`).set('Cookie', adminCookies);
      expect(res.body.flags.cache_flag.enabled).toBe(false);
    });

    it('override creation immediately affects resolution', async () => {
      const { userId } = await createUser('cache-ov@test.com');
      await query("INSERT INTO feature_flags (key, enabled) VALUES ('cov_flag', true)");

      // First: enabled globally
      let res = await request.get(`/admin/users/${userId}/flags`).set('Cookie', adminCookies);
      expect(res.body.flags.cov_flag.enabled).toBe(true);

      // Create override to disable
      await request.post('/admin/feature-flags/cov_flag/overrides')
        .set('Cookie', adminCookies).send({ userId, enabled: false });

      // Now should be disabled via override
      res = await request.get(`/admin/users/${userId}/flags`).set('Cookie', adminCookies);
      expect(res.body.flags.cov_flag.enabled).toBe(false);
      expect(res.body.flags.cov_flag.source).toBe('override');
    });
  });

  // ── Audit Logging ──────────────────────────────────────────────────────

  describe('Audit Logging', () => {
    it('logs group creation', async () => {
      await request.post('/admin/groups').set('Cookie', adminCookies)
        .send({ name: 'Audit Group' });

      const res = await request.get('/admin/audit-log?action=admin_action').set('Cookie', adminCookies);
      const entry = res.body.entries.find((e: any) => e.details?.type === 'group_created');
      expect(entry).toBeTruthy();
      expect(entry.details.name).toBe('Audit Group');
    });

    it('logs flight creation', async () => {
      await request.post('/admin/flights').set('Cookie', adminCookies)
        .send({ name: 'Audit Flight' });

      const res = await request.get('/admin/audit-log?action=admin_action').set('Cookie', adminCookies);
      const entry = res.body.entries.find((e: any) => e.details?.type === 'flight_created');
      expect(entry).toBeTruthy();
    });

    it('logs override creation', async () => {
      await query("INSERT INTO feature_flags (key, enabled) VALUES ('audit_flag', true)");
      const { userId } = await createUser('audit-ov@test.com');
      await request.post('/admin/feature-flags/audit_flag/overrides')
        .set('Cookie', adminCookies).send({ userId, enabled: false });

      const res = await request.get('/admin/audit-log?action=admin_action').set('Cookie', adminCookies);
      const entry = res.body.entries.find((e: any) => e.details?.type === 'flag_override_created');
      expect(entry).toBeTruthy();
    });
  });
});

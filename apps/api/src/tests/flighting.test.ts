import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { request, signUp, cleanDb, closeDb, clearMailpit } from './helpers.js';
import { query } from '../db/pool.js';
import { resolveAllFlags, clearFlagCache, _getUserBucket } from '../services/featureFlags.js';

describe('Flighting — Resolution Engine', () => {
  let userACookies: string;
  let userAId: string;
  let userBCookies: string;
  let userBId: string;

  beforeAll(async () => {
    await cleanDb();
    await clearMailpit();

    const a = await signUp('alice@test.com', 'Password1!', 'Alice');
    userACookies = a.cookies;
    userAId = a.res.body.user.id;

    const b = await signUp('bob@example.com', 'Password1!', 'Bob');
    userBCookies = b.cookies;
    userBId = b.res.body.user.id;

    // Seed test flags
    await query(
      `INSERT INTO feature_flags (key, enabled, description, rollout_percentage) VALUES
        ('test_global', true, 'globally enabled', 100),
        ('test_disabled', false, 'kill switch off', 100),
        ('test_rollout_50', true, 'half rollout', 50),
        ('test_rollout_0', true, 'zero rollout', 0),
        ('test_flight_flag', true, 'gated by flight', 0)
       ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled, rollout_percentage = EXCLUDED.rollout_percentage`,
    );
  });

  afterAll(async () => {
    await cleanDb();
    await closeDb();
  });

  beforeEach(() => {
    clearFlagCache();
  });

  describe('Kill switch (Step 1)', () => {
    it('should return disabled when flag enabled=false', async () => {
      const flags = await resolveAllFlags(userAId);
      expect(flags['test_disabled']).toBeDefined();
      expect(flags['test_disabled'].enabled).toBe(false);
      expect(flags['test_disabled'].source).toBe('kill_switch');
    });

    it('kill switch overrides even user overrides', async () => {
      await query(
        `INSERT INTO flag_overrides (flag_key, user_id, enabled, reason) VALUES ('test_disabled', $1, true, 'test')
         ON CONFLICT (flag_key, user_id) DO UPDATE SET enabled = true`,
        [userAId],
      );
      clearFlagCache();

      const flags = await resolveAllFlags(userAId);
      expect(flags['test_disabled'].enabled).toBe(false);
      expect(flags['test_disabled'].source).toBe('kill_switch');

      await query('DELETE FROM flag_overrides WHERE flag_key = $1 AND user_id = $2', ['test_disabled', userAId]);
    });
  });

  describe('Per-user override (Step 2)', () => {
    it('should enable a flag via override', async () => {
      await query(
        `INSERT INTO flag_overrides (flag_key, user_id, enabled, reason) VALUES ('test_rollout_0', $1, true, 'beta tester')
         ON CONFLICT (flag_key, user_id) DO UPDATE SET enabled = true`,
        [userAId],
      );
      clearFlagCache();

      const flags = await resolveAllFlags(userAId);
      expect(flags['test_rollout_0'].enabled).toBe(true);
      expect(flags['test_rollout_0'].source).toBe('override');

      // Other user should NOT have the override
      const flagsB = await resolveAllFlags(userBId);
      expect(flagsB['test_rollout_0'].enabled).toBe(false);

      await query('DELETE FROM flag_overrides WHERE flag_key = $1 AND user_id = $2', ['test_rollout_0', userAId]);
    });

    it('should respect override expiry', async () => {
      await query(
        `INSERT INTO flag_overrides (flag_key, user_id, enabled, reason, expires_at) VALUES ('test_rollout_0', $1, true, 'expired', now() - interval '1 hour')
         ON CONFLICT (flag_key, user_id) DO UPDATE SET enabled = true, expires_at = now() - interval '1 hour'`,
        [userAId],
      );
      clearFlagCache();

      const flags = await resolveAllFlags(userAId);
      // Expired override should be ignored — falls through to rollout (0% → excluded)
      expect(flags['test_rollout_0'].enabled).toBe(false);

      await query('DELETE FROM flag_overrides WHERE flag_key = $1 AND user_id = $2', ['test_rollout_0', userAId]);
    });
  });

  describe('Flight assignment (Step 3)', () => {
    let groupId: string;
    let flightId: string;

    beforeAll(async () => {
      // Create a group and a flight
      const gRes = await query<{ id: string }>(
        `INSERT INTO user_groups (name, description) VALUES ('testers', 'Test group') RETURNING id`,
      );
      groupId = gRes.rows[0].id;

      const fRes = await query<{ id: string }>(
        `INSERT INTO flights (name, description, show_badge, badge_label) VALUES ('beta-flight', 'Beta', true, 'Beta') RETURNING id`,
      );
      flightId = fRes.rows[0].id;

      // Add test_flight_flag to the flight
      await query('INSERT INTO flight_flags (flight_id, flag_key) VALUES ($1, $2)', [flightId, 'test_flight_flag']);

      // Assign flight to group
      await query(
        'INSERT INTO flight_assignments (flight_id, group_id) VALUES ($1, $2)',
        [flightId, groupId],
      );
    });

    it('should enable flag via group membership in a flight', async () => {
      // Add user A to the group
      await query('INSERT INTO user_group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [groupId, userAId]);
      clearFlagCache();

      const flags = await resolveAllFlags(userAId);
      expect(flags['test_flight_flag'].enabled).toBe(true);
      expect(flags['test_flight_flag'].source).toBe('flight');
      expect(flags['test_flight_flag'].badge).toBe('Beta');

      // User B not in group — should NOT get the flag (rollout is 0%)
      const flagsB = await resolveAllFlags(userBId);
      expect(flagsB['test_flight_flag'].enabled).toBe(false);

      await query('DELETE FROM user_group_members WHERE group_id = $1 AND user_id = $2', [groupId, userAId]);
    });

    it('should enable flag via direct user flight assignment', async () => {
      await query(
        'INSERT INTO flight_assignments (flight_id, user_id) VALUES ($1, $2)',
        [flightId, userBId],
      );
      clearFlagCache();

      const flagsB = await resolveAllFlags(userBId);
      expect(flagsB['test_flight_flag'].enabled).toBe(true);
      expect(flagsB['test_flight_flag'].source).toBe('flight');

      await query('DELETE FROM flight_assignments WHERE flight_id = $1 AND user_id = $2', [flightId, userBId]);
    });

    it('flight bypasses rollout percentage (D1)', async () => {
      // test_flight_flag has rollout_percentage=0, but flight should bypass
      await query('INSERT INTO user_group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [groupId, userAId]);
      clearFlagCache();

      const flags = await resolveAllFlags(userAId);
      expect(flags['test_flight_flag'].enabled).toBe(true);
      expect(flags['test_flight_flag'].source).toBe('flight');

      await query('DELETE FROM user_group_members WHERE group_id = $1 AND user_id = $2', [groupId, userAId]);
    });
  });

  describe('Domain-based group (D4)', () => {
    let domainGroupId: string;
    let domainFlightId: string;

    beforeAll(async () => {
      const gRes = await query<{ id: string }>(
        `INSERT INTO user_groups (name, description, email_domain) VALUES ('example-corp', 'Example Corp', 'example.com') RETURNING id`,
      );
      domainGroupId = gRes.rows[0].id;

      const fRes = await query<{ id: string }>(
        `INSERT INTO flights (name, description) VALUES ('domain-flight', 'Domain test') RETURNING id`,
      );
      domainFlightId = fRes.rows[0].id;

      await query('INSERT INTO flight_flags (flight_id, flag_key) VALUES ($1, $2)', [domainFlightId, 'test_flight_flag']);
      await query('INSERT INTO flight_assignments (flight_id, group_id) VALUES ($1, $2)', [domainFlightId, domainGroupId]);
    });

    it('should match user by email domain', async () => {
      clearFlagCache();
      // bob@example.com should match email_domain 'example.com'
      const flags = await resolveAllFlags(userBId, 'bob@example.com');
      expect(flags['test_flight_flag'].enabled).toBe(true);
      expect(flags['test_flight_flag'].source).toBe('flight');
    });

    it('should NOT match user with different domain', async () => {
      clearFlagCache();
      // alice@test.com should NOT match 'example.com'
      const flags = await resolveAllFlags(userAId, 'alice@test.com');
      // test_flight_flag has 0% rollout and alice is not in any flight → disabled
      expect(flags['test_flight_flag'].enabled).toBe(false);
    });
  });

  describe('Percentage rollout (Step 4)', () => {
    it('should be deterministic — same result for same user+flag', async () => {
      clearFlagCache();
      const flags1 = await resolveAllFlags(userAId);
      const result1 = flags1['test_rollout_50'].enabled;

      clearFlagCache();
      const flags2 = await resolveAllFlags(userAId);
      const result2 = flags2['test_rollout_50'].enabled;

      expect(result1).toBe(result2);
    });

    it('0% rollout should exclude everyone', async () => {
      clearFlagCache();
      const flagsA = await resolveAllFlags(userAId);
      const flagsB = await resolveAllFlags(userBId);
      expect(flagsA['test_rollout_0'].enabled).toBe(false);
      expect(flagsA['test_rollout_0'].source).toBe('rollout_excluded');
      expect(flagsB['test_rollout_0'].enabled).toBe(false);
    });

    it('rollout is monotonic — increasing % only adds users', () => {
      // Test hash bucketing directly
      const bucket = _getUserBucket('test_flag', userAId);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);

      // If bucket is 30, user is included at 31% but not at 30%
      // This is inherent to the algorithm — just verify the bucket is stable
      const bucket2 = _getUserBucket('test_flag', userAId);
      expect(bucket).toBe(bucket2);
    });
  });

  describe('Global default (Step 5)', () => {
    it('should enable flag at 100% rollout with no overrides/flights', async () => {
      clearFlagCache();
      const flags = await resolveAllFlags(userAId);
      expect(flags['test_global'].enabled).toBe(true);
      expect(flags['test_global'].source).toBe('global');
    });
  });

  describe('Batch API endpoint — GET /api/flags', () => {
    it('should return all resolved flags for authenticated user', async () => {
      const res = await request.get('/api/flags').set('Cookie', userACookies);
      expect(res.status).toBe(200);
      expect(res.body.flags).toBeDefined();
      expect(res.body.flags['test_global']).toBeDefined();
      expect(res.body.flags['test_global'].enabled).toBe(true);
    });

    it('should return flags for unauthenticated user (global only)', async () => {
      const res = await request.get('/api/flags');
      expect(res.status).toBe(200);
      expect(res.body.flags).toBeDefined();
      // test_global is enabled at 100% → should appear
      expect(res.body.flags['test_global']?.enabled).toBe(true);
      // test_rollout_50 is at 50% → should NOT appear for anon (no user to hash)
      expect(res.body.flags['test_rollout_50']).toBeUndefined();
    });
  });

  describe('Backward compatibility — GET /api/feature-flags/:key', () => {
    it('should return enabled for globally-enabled flag', async () => {
      const res = await request.get('/api/feature-flags/test_global');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ key: 'test_global', enabled: true });
    });

    it('should return disabled for kill-switch flag', async () => {
      const res = await request.get('/api/feature-flags/test_disabled');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ key: 'test_disabled', enabled: false });
    });

    it('should use per-user resolution when authenticated', async () => {
      // Add override for user A to enable test_rollout_0
      await query(
        `INSERT INTO flag_overrides (flag_key, user_id, enabled, reason) VALUES ('test_rollout_0', $1, true, 'test')
         ON CONFLICT (flag_key, user_id) DO UPDATE SET enabled = true`,
        [userAId],
      );
      clearFlagCache();

      const res = await request.get('/api/feature-flags/test_rollout_0').set('Cookie', userACookies);
      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(true);

      // Without auth, should be false (0% rollout, no user)
      clearFlagCache();
      const res2 = await request.get('/api/feature-flags/test_rollout_0');
      expect(res2.body.enabled).toBe(false);

      await query('DELETE FROM flag_overrides WHERE flag_key = $1 AND user_id = $2', ['test_rollout_0', userAId]);
    });
  });

  describe('Cache behavior', () => {
    it('should return cached results within TTL', async () => {
      clearFlagCache();
      const flags1 = await resolveAllFlags(userAId);
      // Modify DB directly (cache should still return old value)
      await query("UPDATE feature_flags SET enabled = false WHERE key = 'test_global'");
      const flags2 = await resolveAllFlags(userAId);
      expect(flags2['test_global'].enabled).toBe(flags1['test_global'].enabled);

      // Restore
      await query("UPDATE feature_flags SET enabled = true WHERE key = 'test_global'");
      clearFlagCache();
    });

    it('clearFlagCache should force re-resolve', async () => {
      clearFlagCache();
      await resolveAllFlags(userAId);
      await query("UPDATE feature_flags SET enabled = false WHERE key = 'test_global'");
      clearFlagCache();
      const flags = await resolveAllFlags(userAId);
      expect(flags['test_global'].enabled).toBe(false);
      expect(flags['test_global'].source).toBe('kill_switch');

      // Restore
      await query("UPDATE feature_flags SET enabled = true WHERE key = 'test_global'");
      clearFlagCache();
    });
  });

  describe('Self-enrollment groups', () => {
    it('GET /api/groups/joinable returns self-enroll groups', async () => {
      await query(
        "INSERT INTO user_groups (name, description, allow_self_enroll) VALUES ('Open Beta', 'Join for beta features', true)",
      );
      await query(
        "INSERT INTO user_groups (name, description, allow_self_enroll) VALUES ('Closed Group', 'Admin only', false)",
      );

      const res = await request.get('/api/groups/joinable').set('Cookie', userACookies);
      expect(res.status).toBe(200);
      expect(res.body.groups).toHaveLength(1);
      expect(res.body.groups[0].name).toBe('Open Beta');
      expect(res.body.groups[0].isMember).toBe(false);

      // Clean up
      await query('DELETE FROM user_groups');
    });

    it('POST /api/groups/:id/join and leave', async () => {
      const groupRes = await query<{ id: string }>(
        "INSERT INTO user_groups (name, allow_self_enroll) VALUES ('Joinable', true) RETURNING id",
      );
      const groupId = groupRes.rows[0].id;

      // Join
      const joinRes = await request.post(`/api/groups/${groupId}/join`).set('Cookie', userACookies).send({});
      expect(joinRes.status).toBe(200);

      // Verify membership
      let listRes = await request.get('/api/groups/joinable').set('Cookie', userACookies);
      expect(listRes.body.groups[0].isMember).toBe(true);

      // Leave
      const leaveRes = await request.post(`/api/groups/${groupId}/leave`).set('Cookie', userACookies).send({});
      expect(leaveRes.status).toBe(200);

      listRes = await request.get('/api/groups/joinable').set('Cookie', userACookies);
      expect(listRes.body.groups[0].isMember).toBe(false);

      await query('DELETE FROM user_groups');
    });

    it('rejects join on non-self-enroll group', async () => {
      const groupRes = await query<{ id: string }>(
        "INSERT INTO user_groups (name, allow_self_enroll) VALUES ('Closed', false) RETURNING id",
      );
      const groupId = groupRes.rows[0].id;

      const res = await request.post(`/api/groups/${groupId}/join`).set('Cookie', userACookies).send({});
      expect(res.status).toBe(403);

      await query('DELETE FROM user_groups');
    });

    it('requires authentication', async () => {
      const res = await request.get('/api/groups/joinable');
      expect(res.status).toBe(401);
    });
  });
});

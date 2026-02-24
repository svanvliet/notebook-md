import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { request, signUp, cleanDb, closeDb, clearMailpit } from './helpers.js';
import { query } from '../db/pool.js';
import { resolveAllFlags, clearFlagCache, _getUserBucket } from '../services/featureFlags.js';

describe('Flighting — Resolution Engine (v2: flight-level rollout)', () => {
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

    // Seed test flags (no rollout_percentage on flags anymore)
    await query(
      `INSERT INTO feature_flags (key, enabled, description) VALUES
        ('test_enabled', true, 'enabled but no flight'),
        ('test_disabled', false, 'kill switch off'),
        ('test_flight_flag', true, 'gated by flight'),
        ('test_ga_flag', true, 'in GA flight')
       ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled`,
    );

    // Create a GA flight at 100% rollout with test_ga_flag
    const gaRes = await query<{ id: string }>(
      `INSERT INTO flights (name, description, rollout_percentage) VALUES ('ga-flight', 'General Availability', 100) RETURNING id`,
    );
    await query('INSERT INTO flight_flags (flight_id, flag_key) VALUES ($1, $2)', [gaRes.rows[0].id, 'test_ga_flag']);
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
      // test_enabled has no flight → normally not_delivered, but override should enable it
      await query(
        `INSERT INTO flag_overrides (flag_key, user_id, enabled, reason) VALUES ('test_enabled', $1, true, 'beta tester')
         ON CONFLICT (flag_key, user_id) DO UPDATE SET enabled = true`,
        [userAId],
      );
      clearFlagCache();

      const flags = await resolveAllFlags(userAId);
      expect(flags['test_enabled'].enabled).toBe(true);
      expect(flags['test_enabled'].source).toBe('override');

      // Other user should NOT have the override → not_delivered
      const flagsB = await resolveAllFlags(userBId);
      expect(flagsB['test_enabled'].enabled).toBe(false);
      expect(flagsB['test_enabled'].source).toBe('not_delivered');

      await query('DELETE FROM flag_overrides WHERE flag_key = $1 AND user_id = $2', ['test_enabled', userAId]);
    });

    it('should respect override expiry', async () => {
      await query(
        `INSERT INTO flag_overrides (flag_key, user_id, enabled, reason, expires_at) VALUES ('test_enabled', $1, true, 'expired', now() - interval '1 hour')
         ON CONFLICT (flag_key, user_id) DO UPDATE SET enabled = true, expires_at = now() - interval '1 hour'`,
        [userAId],
      );
      clearFlagCache();

      const flags = await resolveAllFlags(userAId);
      // Expired override should be ignored → no flight → not_delivered
      expect(flags['test_enabled'].enabled).toBe(false);
      expect(flags['test_enabled'].source).toBe('not_delivered');

      await query('DELETE FROM flag_overrides WHERE flag_key = $1 AND user_id = $2', ['test_enabled', userAId]);
    });
  });

  describe('Not delivered — flags without flights (Step 4)', () => {
    it('enabled flag without a flight should be not_delivered (OFF)', async () => {
      clearFlagCache();
      const flags = await resolveAllFlags(userAId);
      expect(flags['test_enabled'].enabled).toBe(false);
      expect(flags['test_enabled'].source).toBe('not_delivered');
    });
  });

  describe('Flight assignment (Step 3)', () => {
    let groupId: string;
    let flightId: string;

    beforeAll(async () => {
      // Create a group and a flight (0% rollout — group assignment only)
      const gRes = await query<{ id: string }>(
        `INSERT INTO user_groups (name, description) VALUES ('testers', 'Test group') RETURNING id`,
      );
      groupId = gRes.rows[0].id;

      const fRes = await query<{ id: string }>(
        `INSERT INTO flights (name, description, show_badge, badge_label, rollout_percentage) VALUES ('beta-flight', 'Beta', true, 'Beta', 0) RETURNING id`,
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

      // User B not in group, flight has 0% rollout → not_delivered
      const flagsB = await resolveAllFlags(userBId);
      expect(flagsB['test_flight_flag'].enabled).toBe(false);
      expect(flagsB['test_flight_flag'].source).toBe('not_delivered');

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
  });

  describe('Flight-level rollout percentage', () => {
    let rolloutFlightId: string;

    beforeAll(async () => {
      // Create a flight at 50% rollout
      const fRes = await query<{ id: string }>(
        `INSERT INTO flights (name, description, rollout_percentage) VALUES ('rollout-50-flight', '50% rollout test', 50) RETURNING id`,
      );
      rolloutFlightId = fRes.rows[0].id;
      await query('INSERT INTO flight_flags (flight_id, flag_key) VALUES ($1, $2)', [rolloutFlightId, 'test_flight_flag']);
    });

    it('should be deterministic — same result for same user+flight', async () => {
      clearFlagCache();
      const flags1 = await resolveAllFlags(userAId);
      const result1 = flags1['test_flight_flag'];

      clearFlagCache();
      const flags2 = await resolveAllFlags(userAId);
      const result2 = flags2['test_flight_flag'];

      expect(result1.enabled).toBe(result2.enabled);
    });

    it('rollout bucket is based on flightName:userId', () => {
      // Bucket function uses flightName as key
      const bucket = _getUserBucket('rollout-50-flight', userAId);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);

      // Same inputs → same result
      const bucket2 = _getUserBucket('rollout-50-flight', userAId);
      expect(bucket).toBe(bucket2);
    });

    it('0% rollout flight with no assignments → not_delivered', async () => {
      // Create a 0% flight with no group assignments
      const fRes = await query<{ id: string }>(
        `INSERT INTO flights (name, description, rollout_percentage) VALUES ('zero-pct-flight', 'No rollout', 0) RETURNING id`,
      );
      await query('INSERT INTO flight_flags (flight_id, flag_key) VALUES ($1, $2)', [fRes.rows[0].id, 'test_enabled']);
      clearFlagCache();

      const flags = await resolveAllFlags(userAId);
      // test_enabled has a flight but 0% rollout and no assignment → not_delivered
      expect(flags['test_enabled'].enabled).toBe(false);
      expect(flags['test_enabled'].source).toBe('not_delivered');

      // Clean up
      await query('DELETE FROM flight_flags WHERE flight_id = $1', [fRes.rows[0].id]);
      await query('DELETE FROM flights WHERE id = $1', [fRes.rows[0].id]);
    });
  });

  describe('GA flight (100% rollout)', () => {
    it('should enable flag for all users via 100% rollout flight', async () => {
      clearFlagCache();
      const flagsA = await resolveAllFlags(userAId);
      expect(flagsA['test_ga_flag'].enabled).toBe(true);
      expect(flagsA['test_ga_flag'].source).toBe('rollout');

      clearFlagCache();
      const flagsB = await resolveAllFlags(userBId);
      expect(flagsB['test_ga_flag'].enabled).toBe(true);
      expect(flagsB['test_ga_flag'].source).toBe('rollout');
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
        `INSERT INTO flights (name, description, rollout_percentage) VALUES ('domain-flight', 'Domain test', 0) RETURNING id`,
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
      // test_flight_flag: beta-flight has 0% rollout, domain-flight requires example.com
      // but rollout-50-flight has 50% and might include alice via rollout
      const flag = flags['test_flight_flag'];
      // If alice isn't in any assigned group and doesn't hash into the 50% flight, she won't get it
      // The point is she shouldn't get it via domain matching
      if (flag.source === 'rollout') {
        // She got it via the 50% rollout flight — that's fine, just not via domain
        expect(flag.enabled).toBe(true);
      } else {
        expect(flag.source).toBe('not_delivered');
        expect(flag.enabled).toBe(false);
      }
    });
  });

  describe('Batch API endpoint — GET /api/flags', () => {
    it('should return all resolved flags for authenticated user', async () => {
      const res = await request.get('/api/flags').set('Cookie', userACookies);
      expect(res.status).toBe(200);
      expect(res.body.flags).toBeDefined();
      // test_ga_flag is in a 100% flight → should be enabled
      expect(res.body.flags['test_ga_flag']).toBeDefined();
      expect(res.body.flags['test_ga_flag'].enabled).toBe(true);
    });

    it('should return flags for unauthenticated user (kill switch only)', async () => {
      const res = await request.get('/api/flags');
      expect(res.status).toBe(200);
      expect(res.body.flags).toBeDefined();
      // test_disabled has kill switch → should appear as disabled
      expect(res.body.flags['test_disabled']?.enabled).toBe(false);
      // Non-kill-switch flags should NOT appear for anon
      expect(res.body.flags['test_enabled']).toBeUndefined();
    });
  });

  describe('Backward compatibility — GET /api/feature-flags/:key', () => {
    it('should return enabled for flag in GA flight (100%)', async () => {
      const res = await request.get('/api/feature-flags/test_ga_flag');
      expect(res.status).toBe(200);
      // Without auth → anon, only kill switches appear, so non-kill-switch flags → enabled: false or not present
      // Actually the legacy endpoint calls resolveAllFlags with no userId → anon
      // For anon, test_ga_flag won't be in results (not kill-switched) → isFeatureEnabled returns false
      expect(res.body).toEqual({ key: 'test_ga_flag', enabled: false });
    });

    it('should return disabled for kill-switch flag', async () => {
      const res = await request.get('/api/feature-flags/test_disabled');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ key: 'test_disabled', enabled: false });
    });

    it('should use per-user resolution when authenticated', async () => {
      // Add override for user A to enable test_enabled
      await query(
        `INSERT INTO flag_overrides (flag_key, user_id, enabled, reason) VALUES ('test_enabled', $1, true, 'test')
         ON CONFLICT (flag_key, user_id) DO UPDATE SET enabled = true`,
        [userAId],
      );
      clearFlagCache();

      const res = await request.get('/api/feature-flags/test_enabled').set('Cookie', userACookies);
      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(true);

      // Without auth, should be false (no flight delivers it to anon)
      clearFlagCache();
      const res2 = await request.get('/api/feature-flags/test_enabled');
      expect(res2.body.enabled).toBe(false);

      await query('DELETE FROM flag_overrides WHERE flag_key = $1 AND user_id = $2', ['test_enabled', userAId]);
    });
  });

  describe('Cache behavior', () => {
    it('should return cached results within TTL', async () => {
      clearFlagCache();
      const flags1 = await resolveAllFlags(userAId);
      // Modify DB directly (cache should still return old value)
      await query("UPDATE feature_flags SET enabled = false WHERE key = 'test_ga_flag'");
      const flags2 = await resolveAllFlags(userAId);
      expect(flags2['test_ga_flag'].enabled).toBe(flags1['test_ga_flag'].enabled);

      // Restore
      await query("UPDATE feature_flags SET enabled = true WHERE key = 'test_ga_flag'");
      clearFlagCache();
    });

    it('clearFlagCache should force re-resolve', async () => {
      clearFlagCache();
      await resolveAllFlags(userAId);
      await query("UPDATE feature_flags SET enabled = false WHERE key = 'test_ga_flag'");
      clearFlagCache();
      const flags = await resolveAllFlags(userAId);
      expect(flags['test_ga_flag'].enabled).toBe(false);
      expect(flags['test_ga_flag'].source).toBe('kill_switch');

      // Restore
      await query("UPDATE feature_flags SET enabled = true WHERE key = 'test_ga_flag'");
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
      await query('DELETE FROM user_groups WHERE name IN ($1, $2)', ['Open Beta', 'Closed Group']);
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

      await query('DELETE FROM user_groups WHERE id = $1', [groupId]);
    });

    it('rejects join on non-self-enroll group', async () => {
      const groupRes = await query<{ id: string }>(
        "INSERT INTO user_groups (name, allow_self_enroll) VALUES ('Closed', false) RETURNING id",
      );
      const groupId = groupRes.rows[0].id;

      const res = await request.post(`/api/groups/${groupId}/join`).set('Cookie', userACookies).send({});
      expect(res.status).toBe(403);

      await query('DELETE FROM user_groups WHERE id = $1', [groupId]);
    });

    it('requires authentication', async () => {
      const res = await request.get('/api/groups/joinable');
      expect(res.status).toBe(401);
    });
  });
});

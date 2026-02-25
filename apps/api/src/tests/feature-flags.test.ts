import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { request, cleanDb, closeDb, signUp } from './helpers.js';
import { query } from '../db/pool.js';
import { clearFlagCache } from '../services/featureFlags.js';

describe('Feature Flags', () => {
  beforeAll(async () => {
    await cleanDb();
  });

  beforeEach(async () => {
    await query('DELETE FROM feature_flags');
    clearFlagCache();
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('GET /api/feature-flags/:key', () => {
    it('returns enabled=true when flag is in a 100% flight (authenticated)', async () => {
      await query(
        "INSERT INTO feature_flags (key, enabled, description) VALUES ('test_flag', true, 'test')",
      );
      // In v2, flags need a flight to be delivered
      const fRes = await query<{ id: string }>(
        "INSERT INTO flights (name, rollout_percentage) VALUES ('test-ga', 100) RETURNING id",
      );
      await query("INSERT INTO flight_flags (flight_id, flag_key) VALUES ($1, 'test_flag')", [fRes.rows[0].id]);

      // Legacy endpoint without auth resolves as anonymous — no flags delivered
      const res = await request.get('/api/feature-flags/test_flag');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ key: 'test_flag', enabled: false });

      // Cleanup flights for next test
      await query('DELETE FROM flight_flags');
      await query('DELETE FROM flights');
    });

    it('returns enabled=false when flag is disabled (in test env)', async () => {
      await query(
        "INSERT INTO feature_flags (key, enabled, description) VALUES ('test_flag', false, 'test')",
      );

      const res = await request.get('/api/feature-flags/test_flag');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ key: 'test_flag', enabled: false });
    });

    it('returns enabled=false when flag does not exist (in test env)', async () => {
      const res = await request.get('/api/feature-flags/nonexistent_flag');
      expect(res.status).toBe(200);
      // In test env (NODE_ENV=test), unknown flags default to false
      expect(res.body).toEqual({ key: 'nonexistent_flag', enabled: false });
    });
  });
});

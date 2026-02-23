import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { request, cleanDb, closeDb, signUp } from './helpers.js';
import { query } from '../db/pool.js';

describe('Feature Flags', () => {
  beforeAll(async () => {
    await cleanDb();
  });

  beforeEach(async () => {
    await query('DELETE FROM feature_flags');
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('GET /api/feature-flags/:key', () => {
    it('returns enabled=true when flag is enabled', async () => {
      await query(
        "INSERT INTO feature_flags (key, enabled, description) VALUES ('test_flag', true, 'test')",
      );

      const res = await request.get('/api/feature-flags/test_flag');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ key: 'test_flag', enabled: true });
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

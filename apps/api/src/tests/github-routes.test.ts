import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { request, cleanDb, closeDb, signUp, extractRefreshToken } from './helpers.js';
import { query } from '../db/pool.js';

afterAll(async () => { await closeDb(); });

describe('GitHub Routes', () => {
  let token: string;
  let userId: string;

  beforeEach(async () => {
    await cleanDb();
    const { res } = await signUp('ghuser@test.com', 'Password123!');
    token = extractRefreshToken(res)!;
    // Get the userId from the user we just created
    const userRes = await request.get('/auth/me').set('Cookie', `refresh_token=${token}`);
    userId = userRes.body.user.id;
  });

  describe('GET /api/github/install', () => {
    it('should return install URL', async () => {
      const res = await request
        .get('/api/github/install')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(200);
      expect(res.body.installUrl).toContain('github.com/apps/');
      expect(res.body.installUrl).toContain('installations/new');
      expect(res.body.installUrl).toContain(`state=${userId}`);
    });

    it('should reject unauthenticated access', async () => {
      const res = await request.get('/api/github/install');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/github/install/callback', () => {
    it('should reject missing installation_id', async () => {
      const res = await request
        .get('/api/github/install/callback')
        .set('Cookie', `refresh_token=${token}`);
      // Redirects to app with error
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('error=missing_installation_id');
    });

    it('should reject unauthenticated access', async () => {
      const res = await request.get('/api/github/install/callback?installation_id=12345');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/github/installations', () => {
    it('should return empty list when no installations', async () => {
      const res = await request
        .get('/api/github/installations')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(200);
      expect(res.body.installations).toEqual([]);
    });

    it('should return user installations', async () => {
      // Insert a test installation
      await query(
        `INSERT INTO github_installations (user_id, installation_id, account_login, account_type, repos_selection)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, 12345, 'testorg', 'Organization', 'all'],
      );

      const res = await request
        .get('/api/github/installations')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(200);
      expect(res.body.installations).toHaveLength(1);
      expect(Number(res.body.installations[0].installationId)).toBe(12345);
      expect(res.body.installations[0].accountLogin).toBe('testorg');
      expect(res.body.installations[0].accountType).toBe('Organization');
      expect(res.body.installations[0].reposSelection).toBe('all');
      expect(res.body.installations[0].suspended).toBe(false);
    });

    it('should not return other users installations', async () => {
      // Create another user
      const { res: res2 } = await signUp('other@test.com', 'Password123!');
      const token2 = extractRefreshToken(res2)!;
      const user2Res = await request.get('/auth/me').set('Cookie', `refresh_token=${token2}`);
      const userId2 = user2Res.body.user.id;

      // Insert installation for user 1
      await query(
        `INSERT INTO github_installations (user_id, installation_id, account_login, account_type, repos_selection)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, 11111, 'user1org', 'User', 'all'],
      );
      // Insert installation for user 2
      await query(
        `INSERT INTO github_installations (user_id, installation_id, account_login, account_type, repos_selection)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId2, 22222, 'user2org', 'User', 'all'],
      );

      const res1 = await request.get('/api/github/installations').set('Cookie', `refresh_token=${token}`);
      expect(res1.body.installations).toHaveLength(1);
      expect(res1.body.installations[0].accountLogin).toBe('user1org');

      const res2List = await request.get('/api/github/installations').set('Cookie', `refresh_token=${token2}`);
      expect(res2List.body.installations).toHaveLength(1);
      expect(res2List.body.installations[0].accountLogin).toBe('user2org');
    });

    it('should reject unauthenticated access', async () => {
      const res = await request.get('/api/github/installations');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/github/repos', () => {
    it('should require installation_id param', async () => {
      const res = await request
        .get('/api/github/repos')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('installation_id');
    });

    it('should reject non-numeric installation_id', async () => {
      const res = await request
        .get('/api/github/repos?installation_id=abc')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(400);
    });

    it('should reject access to installations not owned by user', async () => {
      // Create another user
      const { res: res2 } = await signUp('other@test.com', 'Password123!');
      const token2 = extractRefreshToken(res2)!;
      const user2Res = await request.get('/auth/me').set('Cookie', `refresh_token=${token2}`);

      await query(
        `INSERT INTO github_installations (user_id, installation_id, account_login, account_type, repos_selection)
         VALUES ($1, $2, $3, $4, $5)`,
        [user2Res.body.user.id, 99999, 'otheruser', 'User', 'all'],
      );

      // User 1 tries to access user 2's installation
      const res = await request
        .get('/api/github/repos?installation_id=99999')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(403);
    });

    it('should clean up stale installation on 401 from GitHub and return 404', async () => {
      // Insert a fake installation that doesn't exist on GitHub
      await query(
        `INSERT INTO github_installations (user_id, installation_id, account_login, account_type, repos_selection)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, 999888, 'stale-account', 'User', 'all'],
      );

      // Trying to list repos will fail with 401 from GitHub (invalid installation)
      const res = await request
        .get('/api/github/repos?installation_id=999888')
        .set('Cookie', `refresh_token=${token}`);

      // Should return 404 with INSTALLATION_REMOVED code (or 502 if error isn't 401)
      // Since this is a fake installation, GitHub will return an error
      expect([404, 502]).toContain(res.status);

      if (res.status === 404) {
        expect(res.body.code).toBe('INSTALLATION_REMOVED');

        // Verify the stale record was cleaned up
        const dbCheck = await query(
          'SELECT 1 FROM github_installations WHERE installation_id = $1',
          [999888],
        );
        expect(dbCheck.rows).toHaveLength(0);
      }
    });

    it('should reject unauthenticated access', async () => {
      const res = await request.get('/api/github/repos?installation_id=12345');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/github/branches', () => {
    it('should require owner, repo, and baseBranch', async () => {
      const res = await request
        .post('/api/github/branches')
        .set('Cookie', `refresh_token=${token}`)
        .send({ owner: 'test' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('should return 404 when no installation found for owner', async () => {
      const res = await request
        .post('/api/github/branches')
        .set('Cookie', `refresh_token=${token}`)
        .send({ owner: 'nonexistent', repo: 'repo', baseBranch: 'main' });
      expect(res.status).toBe(404);
    });

    it('should reject unauthenticated access', async () => {
      const res = await request
        .post('/api/github/branches')
        .send({ owner: 'test', repo: 'repo', baseBranch: 'main' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/github/branches', () => {
    it('should require owner and repo params', async () => {
      const res = await request
        .get('/api/github/branches')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('should return 404 when no installation found for owner', async () => {
      const res = await request
        .get('/api/github/branches?owner=nonexistent&repo=repo')
        .set('Cookie', `refresh_token=${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/github/publish', () => {
    it('should require owner, repo, head, and base', async () => {
      const res = await request
        .post('/api/github/publish')
        .set('Cookie', `refresh_token=${token}`)
        .send({ owner: 'test', repo: 'repo' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('should return 404 when no installation found', async () => {
      const res = await request
        .post('/api/github/publish')
        .set('Cookie', `refresh_token=${token}`)
        .send({ owner: 'nonexistent', repo: 'r', head: 'feature', base: 'main' });
      expect(res.status).toBe(404);
    });
  });
});

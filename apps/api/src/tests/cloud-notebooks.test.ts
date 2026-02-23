import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { request, cleanDb, closeDb, signUp, extractCookies } from './helpers.js';
import { query } from '../db/pool.js';

describe('Cloud Notebooks & Entitlements', () => {
  let cookies: string;
  let userId: string;

  beforeAll(async () => {
    await cleanDb();
    // Seed the plans (migration seeds these, but cleanDb removes users)
    await query("INSERT INTO plans (id, name, is_default) VALUES ('free', 'Free', true) ON CONFLICT DO NOTHING");
    await query(`INSERT INTO plan_entitlements (plan_id, entitlement_key, entitlement_value) VALUES
      ('free', 'max_cloud_notebooks', '3'),
      ('free', 'max_storage_bytes', '524288000'),
      ('free', 'max_doc_size_bytes', '5242880')
      ON CONFLICT (plan_id, entitlement_key) DO NOTHING`);
  });

  beforeEach(async () => {
    // Clean user data but preserve plan seed
    await query('DELETE FROM collab_sessions');
    await query('DELETE FROM document_versions');
    await query('DELETE FROM cloud_documents');
    await query('DELETE FROM notebook_shares');
    await query('DELETE FROM notebook_public_links');
    await query('DELETE FROM notebooks');
    await query('DELETE FROM user_usage_counters');
    await query('DELETE FROM user_plan_subscriptions');
    await query('DELETE FROM sessions');
    await query('DELETE FROM identity_links');
    await query('DELETE FROM audit_log');
    await query('DELETE FROM email_verification_tokens');
    await query('DELETE FROM users');

    // Create test user
    const { res } = await signUp('cloud-test@example.com', 'Password1!', 'Cloud User');
    cookies = extractCookies(res);
    userId = res.body.user.id;
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('POST /api/notebooks (cloud)', () => {
    it('creates a cloud notebook', async () => {
      const res = await request
        .post('/api/notebooks')
        .set('Cookie', cookies)
        .send({ name: 'My Cloud Notebook', sourceType: 'cloud' });

      expect(res.status).toBe(201);
      expect(res.body.notebook.sourceType).toBe('cloud');
      expect(res.body.notebook.name).toBe('My Cloud Notebook');
    });

    it('increments notebook count on creation', async () => {
      await request
        .post('/api/notebooks')
        .set('Cookie', cookies)
        .send({ name: 'Notebook 1', sourceType: 'cloud' });

      const usageRes = await request
        .get('/api/usage/me')
        .set('Cookie', cookies);

      expect(usageRes.body.cloudNotebooks).toBe(1);
    });

    it('blocks creation at notebook limit (3)', async () => {
      for (let i = 1; i <= 3; i++) {
        await request
          .post('/api/notebooks')
          .set('Cookie', cookies)
          .send({ name: `Notebook ${i}`, sourceType: 'cloud' });
      }

      const res = await request
        .post('/api/notebooks')
        .set('Cookie', cookies)
        .send({ name: 'Notebook 4', sourceType: 'cloud' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('limit');
    });

    it('creates owner share entry for cloud notebook', async () => {
      const res = await request
        .post('/api/notebooks')
        .set('Cookie', cookies)
        .send({ name: 'Shared Notebook', sourceType: 'cloud' });

      const shares = await query(
        'SELECT * FROM notebook_shares WHERE notebook_id = $1',
        [res.body.notebook.id],
      );

      expect(shares.rows.length).toBe(1);
      expect(shares.rows[0].owner_user_id).toBe(userId);
      expect(shares.rows[0].shared_with_user_id).toBe(userId);
    });
  });

  describe('Cloud document CRUD via /api/sources/cloud', () => {
    let notebookId: string;

    beforeEach(async () => {
      const res = await request
        .post('/api/notebooks')
        .set('Cookie', cookies)
        .send({ name: 'CRUD Test', sourceType: 'cloud' });
      notebookId = res.body.notebook.id;
    });

    it('creates a file in a cloud notebook', async () => {
      const res = await request
        .post('/api/sources/cloud/files/notes/hello.md')
        .set('Cookie', cookies)
        .query({ root: notebookId })
        .send({ content: '# Hello World' });

      expect(res.status).toBe(201);
      expect(res.body.path).toBe('notes/hello.md');
    });

    it('reads a created file', async () => {
      await request
        .post('/api/sources/cloud/files/test.md')
        .set('Cookie', cookies)
        .query({ root: notebookId })
        .send({ content: '# Test Content' });

      const res = await request
        .get('/api/sources/cloud/files/test.md')
        .set('Cookie', cookies)
        .query({ root: notebookId });

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('# Test Content');
      expect(res.body.encoding).toBe('utf-8');
    });

    it('content is encrypted at rest', async () => {
      await request
        .post('/api/sources/cloud/files/secret.md')
        .set('Cookie', cookies)
        .query({ root: notebookId })
        .send({ content: 'My secret content' });

      // Check raw database - content_enc should not be plaintext
      const row = await query<{ content_enc: string }>(
        'SELECT content_enc FROM cloud_documents WHERE notebook_id = $1 AND path = $2',
        [notebookId, 'secret.md'],
      );

      expect(row.rows.length).toBe(1);
      // The encrypted content should not equal the plaintext
      const rawEnc = row.rows[0].content_enc;
      expect(rawEnc).not.toBe('My secret content');
      expect(rawEnc).toBeTruthy();
    });

    it('updates a file', async () => {
      await request
        .post('/api/sources/cloud/files/update-me.md')
        .set('Cookie', cookies)
        .query({ root: notebookId })
        .send({ content: 'Original content' });

      const res = await request
        .put('/api/sources/cloud/files/update-me.md')
        .set('Cookie', cookies)
        .query({ root: notebookId })
        .send({ content: 'Updated content' });

      expect(res.status).toBe(200);

      const read = await request
        .get('/api/sources/cloud/files/update-me.md')
        .set('Cookie', cookies)
        .query({ root: notebookId });

      expect(read.body.content).toBe('Updated content');
    });

    it('deletes a file', async () => {
      await request
        .post('/api/sources/cloud/files/delete-me.md')
        .set('Cookie', cookies)
        .query({ root: notebookId })
        .send({ content: 'To be deleted' });

      const res = await request
        .delete('/api/sources/cloud/files/delete-me.md')
        .set('Cookie', cookies)
        .query({ root: notebookId });

      expect(res.status).toBe(200);
    });

    it('lists files', async () => {
      await request
        .post('/api/sources/cloud/files/file1.md')
        .set('Cookie', cookies)
        .query({ root: notebookId })
        .send({ content: 'File 1' });

      await request
        .post('/api/sources/cloud/files/file2.md')
        .set('Cookie', cookies)
        .query({ root: notebookId })
        .send({ content: 'File 2' });

      const res = await request
        .get('/api/sources/cloud/tree')
        .set('Cookie', cookies)
        .query({ root: notebookId });

      expect(res.status).toBe(200);
      expect(res.body.entries.length).toBe(2);
    });

    it('tracks storage usage on create and delete', async () => {
      const content = 'A'.repeat(1000);
      await request
        .post('/api/sources/cloud/files/sized.md')
        .set('Cookie', cookies)
        .query({ root: notebookId })
        .send({ content });

      let usageRes = await request.get('/api/usage/me').set('Cookie', cookies);
      expect(usageRes.body.storageBytesUsed).toBe(1000);

      await request
        .delete('/api/sources/cloud/files/sized.md')
        .set('Cookie', cookies)
        .query({ root: notebookId });

      usageRes = await request.get('/api/usage/me').set('Cookie', cookies);
      expect(usageRes.body.storageBytesUsed).toBe(0);
    });
  });

  describe('DELETE /api/notebooks/:id (cloud)', () => {
    it('decrements notebook count on deletion', async () => {
      const createRes = await request
        .post('/api/notebooks')
        .set('Cookie', cookies)
        .send({ name: 'To Delete', sourceType: 'cloud' });

      let usageRes = await request.get('/api/usage/me').set('Cookie', cookies);
      expect(usageRes.body.cloudNotebooks).toBe(1);

      await request
        .delete(`/api/notebooks/${createRes.body.notebook.id}`)
        .set('Cookie', cookies);

      usageRes = await request.get('/api/usage/me').set('Cookie', cookies);
      expect(usageRes.body.cloudNotebooks).toBe(0);
    });
  });

  describe('GET /api/entitlements/me', () => {
    it('returns free plan entitlements', async () => {
      const res = await request
        .get('/api/entitlements/me')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.plan).toBe('free');
      expect(res.body.entitlements.maxCloudNotebooks).toBe(3);
      expect(res.body.entitlements.maxStorageBytes).toBe(524288000);
      expect(res.body.entitlements.maxDocSizeBytes).toBe(5242880);
    });
  });

  describe('GET /api/usage/me', () => {
    it('returns usage counters with banner state', async () => {
      const res = await request
        .get('/api/usage/me')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.cloudNotebooks).toBe(0);
      expect(res.body.storageBytesUsed).toBe(0);
      expect(res.body.bannerState).toBe('none');
    });
  });

  describe('User signup assigns free plan', () => {
    it('new users get free plan and zero usage counters', async () => {
      const { res: signupRes, cookies: newCookies } = await signUp('newuser@example.com', 'Password1!', 'New User');

      const planResult = await query(
        'SELECT plan_id FROM user_plan_subscriptions WHERE user_id = $1',
        [signupRes.body.user.id],
      );
      expect(planResult.rows[0].plan_id).toBe('free');

      const usageRes = await request
        .get('/api/usage/me')
        .set('Cookie', newCookies);
      expect(usageRes.body.cloudNotebooks).toBe(0);
      expect(usageRes.body.storageBytesUsed).toBe(0);
    });
  });
});

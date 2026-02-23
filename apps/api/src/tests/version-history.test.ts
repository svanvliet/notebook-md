import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request, signUp, cleanDb, closeDb } from './helpers.js';
import { query } from '../db/pool.js';
import { encrypt } from '../lib/encryption.js';
import { runVersionCleanup } from '../jobs/versionCleanup.js';
import { runUsageReconciliation } from '../jobs/usageReconciliation.js';

describe('Version History & Jobs (Phase 5)', () => {
  let ownerCookies: string;
  let ownerId: string;
  let notebookId: string;
  let documentId: string;

  beforeAll(async () => {
    await cleanDb();

    // Seed feature flags
    await query(
      `INSERT INTO feature_flags (key, enabled, description) VALUES
       ('cloud_notebooks', true, 'test'),
       ('cloud_sharing', true, 'test'),
       ('soft_quota_banners', true, 'test')
       ON CONFLICT (key) DO UPDATE SET enabled = true`
    );

    // Create owner
    const owner = await signUp('version-owner@test.com', 'Password1!', 'VersionOwner');
    ownerCookies = owner.cookies;
    ownerId = owner.res.body.user.id;

    // Create cloud notebook
    const nbRes = await request
      .post('/api/notebooks')
      .set('Cookie', ownerCookies)
      .send({ name: 'Version Test', sourceType: 'cloud', sourceConfig: {} });
    expect(nbRes.status).toBe(201);
    notebookId = nbRes.body.notebook.id;

    // Create a document
    const createRes = await request
      .post(`/api/sources/cloud/files/test.md?root=${notebookId}`)
      .set('Cookie', ownerCookies)
      .send({ content: 'Original content' });
    expect(createRes.status).toBe(201);

    // Get document ID
    const docResult = await query<{ id: string }>(
      'SELECT id FROM cloud_documents WHERE notebook_id = $1 AND path = $2',
      [notebookId, 'test.md'],
    );
    documentId = docResult.rows[0].id;

    // Create some versions
    for (let i = 1; i <= 3; i++) {
      await query(
        `INSERT INTO document_versions (document_id, version_number, content_enc, size_bytes, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [documentId, i, encrypt(`Version ${i} content`), 20, ownerId],
      );
    }
  });

  afterAll(async () => {
    await cleanDb();
    await closeDb();
  });

  describe('Version list', () => {
    it('should list versions for a document', async () => {
      const res = await request
        .get(`/api/cloud/documents/${documentId}/versions`)
        .set('Cookie', ownerCookies);

      expect(res.status).toBe(200);
      expect(res.body.versions.length).toBe(3);
      expect(res.body.versions[0].versionNumber).toBe(3); // newest first
    });

    it('should deny access to non-member', async () => {
      const other = await signUp('other-version@test.com', 'Password1!', 'Other');

      const res = await request
        .get(`/api/cloud/documents/${documentId}/versions`)
        .set('Cookie', other.cookies);

      expect(res.status).toBe(403);
    });
  });

  describe('Version content', () => {
    it('should get version content', async () => {
      // Get the first version
      const listRes = await request
        .get(`/api/cloud/documents/${documentId}/versions`)
        .set('Cookie', ownerCookies);

      const versionId = listRes.body.versions[2].id; // oldest (v1)

      const res = await request
        .get(`/api/cloud/documents/${documentId}/versions/${versionId}`)
        .set('Cookie', ownerCookies);

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Version 1 content');
      expect(res.body.versionNumber).toBe(1);
    });
  });

  describe('Version restore', () => {
    it('should restore a version', async () => {
      const listRes = await request
        .get(`/api/cloud/documents/${documentId}/versions`)
        .set('Cookie', ownerCookies);

      const versionId = listRes.body.versions[2].id; // oldest (v1)

      const res = await request
        .post(`/api/cloud/documents/${documentId}/versions/${versionId}/restore`)
        .set('Cookie', ownerCookies);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Version restored');

      // Now there should be one more version (the pre-restore snapshot)
      const afterRes = await request
        .get(`/api/cloud/documents/${documentId}/versions`)
        .set('Cookie', ownerCookies);
      expect(afterRes.body.versions.length).toBe(4); // 3 original + 1 pre-restore snapshot
    });
  });

  describe('Version cleanup job', () => {
    it('should run without errors', async () => {
      const result = await runVersionCleanup();
      expect(result.deleted).toBeGreaterThanOrEqual(0);
      expect(result.reclaimedBytes).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Usage reconciliation job', () => {
    it('should reconcile counters', async () => {
      const result = await runUsageReconciliation();
      expect(result.usersUpdated).toBeGreaterThanOrEqual(0);
    });

    it('should fix drifted counters', async () => {
      // Manually drift the counter
      await query(
        `UPDATE user_usage_counters SET counter_value = 999999 WHERE user_id = $1 AND counter_key = 'cloud_storage_bytes'`,
        [ownerId],
      );

      await runUsageReconciliation();

      // Check that it's been corrected
      const counter = await query<{ counter_value: number }>(
        `SELECT counter_value FROM user_usage_counters WHERE user_id = $1 AND counter_key = 'cloud_storage_bytes'`,
        [ownerId],
      );
      // Should be the actual total, not 999999
      expect(Number(counter.rows[0].counter_value)).toBeLessThan(999999);
    });
  });

  describe('Usage quota banner', () => {
    it('should return usage data', async () => {
      const res = await request
        .get('/api/usage/me')
        .set('Cookie', ownerCookies);

      expect(res.status).toBe(200);
      expect(res.body.cloudNotebooks).toBeDefined();
      expect(res.body.storageBytesUsed).toBeDefined();
      expect(res.body.storageLimit).toBeDefined();
      expect(res.body.bannerState).toBeDefined();
    });
  });
});

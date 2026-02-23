import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { request, signUp, cleanDb, closeDb, clearMailpit, getMailpitMessages, getMailpitMessageBody, extractCookies } from './helpers.js';
import { query } from '../db/pool.js';

describe('Sharing & Permissions (Phase 3)', () => {
  let ownerCookies: string;
  let editorCookies: string;
  let viewerCookies: string;
  let ownerId: string;
  let editorId: string;
  let viewerId: string;
  let notebookId: string;

  beforeAll(async () => {
    await cleanDb();
    await clearMailpit();

    // Seed feature flags
    await query(
      `INSERT INTO feature_flags (key, enabled, description) VALUES
       ('cloud_notebooks', true, 'test'),
       ('cloud_sharing', true, 'test')
       ON CONFLICT (key) DO UPDATE SET enabled = true`
    );

    // Create owner
    const owner = await signUp('owner@test.com', 'Password1!', 'Owner');
    ownerCookies = owner.cookies;
    ownerId = owner.res.body.user.id;

    // Create editor
    const editor = await signUp('editor@test.com', 'Password1!', 'Editor');
    editorCookies = editor.cookies;
    editorId = editor.res.body.user.id;

    // Create viewer
    const viewer = await signUp('viewer@test.com', 'Password1!', 'Viewer');
    viewerCookies = viewer.cookies;
    viewerId = viewer.res.body.user.id;

    // Create a cloud notebook
    const nbRes = await request
      .post('/api/notebooks')
      .set('Cookie', ownerCookies)
      .send({ name: 'Shared Notebook', sourceType: 'cloud', sourceConfig: {} });
    expect(nbRes.status).toBe(201);
    notebookId = nbRes.body.notebook.id;
  });

  afterAll(async () => {
    await cleanDb();
    await closeDb();
  });

  describe('Invites', () => {
    it('should send an invite email', async () => {
      await clearMailpit();

      const res = await request
        .post(`/api/cloud/notebooks/${notebookId}/invites`)
        .set('Cookie', ownerCookies)
        .send({ email: 'editor@test.com', permission: 'editor' });

      expect(res.status).toBe(201);
      expect(res.body.invite.email).toBe('editor@test.com');
      expect(res.body.invite.permission).toBe('editor');

      // Check email was sent
      await new Promise(r => setTimeout(r, 500));
      const msgs = await getMailpitMessages('editor@test.com');
      expect(msgs.length).toBeGreaterThanOrEqual(1);
      const inviteEmail = msgs.find(m => m.Subject.includes('invited you'));
      expect(inviteEmail).toBeDefined();
    });

    it('should reject invite without valid permission', async () => {
      const res = await request
        .post(`/api/cloud/notebooks/${notebookId}/invites`)
        .set('Cookie', ownerCookies)
        .send({ email: 'someone@test.com', permission: 'admin' });

      expect(res.status).toBe(400);
    });

    it('should list pending invites', async () => {
      const res = await request
        .get(`/api/cloud/notebooks/${notebookId}/invites`)
        .set('Cookie', ownerCookies);

      expect(res.status).toBe(200);
      // Owner and possibly pending invites
      expect(Array.isArray(res.body.invites)).toBe(true);
    });
  });

  describe('Accept invite', () => {
    it('should accept a valid invite via API-created token', async () => {
      // Clean up any previous viewer shares
      await query(
        `DELETE FROM notebook_shares WHERE notebook_id = $1 AND shared_with_email = 'viewer@test.com'`,
        [notebookId],
      );

      // Create invite via API (which returns raw token)
      const inviteRes = await request
        .post(`/api/cloud/notebooks/${notebookId}/invites`)
        .set('Cookie', ownerCookies)
        .send({ email: 'viewer@test.com', permission: 'viewer' });
      expect(inviteRes.status).toBe(201);

      // Get raw token from the invite response — but API doesn't return token for security
      // Instead, check the email sent via Mailpit
      await new Promise(r => setTimeout(r, 500));
      const msgs = await getMailpitMessages('viewer@test.com');
      const inviteEmail = msgs.find(m => m.Subject.includes('invited you'));
      expect(inviteEmail).toBeDefined();

      // Get full email body to extract token
      const body = await getMailpitMessageBody(inviteEmail!.ID);
      const tokenMatch = body.match(/token=([^\s&]+)/);
      expect(tokenMatch).toBeDefined();
      const token = decodeURIComponent(tokenMatch![1]);

      const res = await request
        .post(`/api/cloud/invites/${token}/accept`)
        .set('Cookie', viewerCookies);

      expect(res.status).toBe(200);
      expect(res.body.notebookId).toBe(notebookId);
    });

    it('should reject invalid invite token', async () => {
      const res = await request
        .post(`/api/cloud/invites/invalid-token-abc/accept`)
        .set('Cookie', viewerCookies);

      expect(res.status).toBe(400);
    });
  });

  describe('Members', () => {
    it('should list members after accepted invite', async () => {
      const res = await request
        .get(`/api/cloud/notebooks/${notebookId}/members`)
        .set('Cookie', ownerCookies);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.members)).toBe(true);
      // Should include owner as an editor at minimum
      const ownerMember = res.body.members.find((m: any) => m.userId === ownerId);
      expect(ownerMember).toBeDefined();
    });

    it('should update member role', async () => {
      // Clean previous editor shares
      await query(
        `DELETE FROM notebook_shares WHERE notebook_id = $1 AND shared_with_email = 'editor@test.com'`,
        [notebookId],
      );
      await clearMailpit();

      // Create invite via API
      const invRes = await request
        .post(`/api/cloud/notebooks/${notebookId}/invites`)
        .set('Cookie', ownerCookies)
        .send({ email: 'editor@test.com', permission: 'editor' });
      expect(invRes.status).toBe(201);

      // Get token from email
      await new Promise(r => setTimeout(r, 500));
      const msgs = await getMailpitMessages('editor@test.com');
      const inviteEmail = msgs.find(m => m.Subject.includes('invited you'));
      expect(inviteEmail).toBeDefined();
      const body = await getMailpitMessageBody(inviteEmail!.ID);
      const tokenMatch = body.match(/token=([^\s&]+)/);
      const token = decodeURIComponent(tokenMatch![1]);

      // Accept
      await request
        .post(`/api/cloud/invites/${token}/accept`)
        .set('Cookie', editorCookies);

      // Change to viewer
      const res = await request
        .patch(`/api/cloud/notebooks/${notebookId}/members/${editorId}`)
        .set('Cookie', ownerCookies)
        .send({ permission: 'viewer' });

      expect(res.status).toBe(200);
    });

    it('should remove a member', async () => {
      const res = await request
        .delete(`/api/cloud/notebooks/${notebookId}/members/${editorId}`)
        .set('Cookie', ownerCookies);

      expect(res.status).toBe(200);
    });
  });

  describe('Share Links', () => {
    it('should create a public share link', async () => {
      const res = await request
        .post(`/api/cloud/notebooks/${notebookId}/share-links`)
        .set('Cookie', ownerCookies)
        .send({ visibility: 'public' });

      expect(res.status).toBe(201);
      expect(res.body.link.token).toBeDefined();
      expect(res.body.link.visibility).toBe('public');
      expect(res.body.link.isActive).toBe(true);
    });

    it('should list share links', async () => {
      const res = await request
        .get(`/api/cloud/notebooks/${notebookId}/share-links`)
        .set('Cookie', ownerCookies);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.links)).toBe(true);
      expect(res.body.links.length).toBeGreaterThan(0);
    });

    it('should resolve a public share link', async () => {
      // Get the link token
      const linksRes = await request
        .get(`/api/cloud/notebooks/${notebookId}/share-links`)
        .set('Cookie', ownerCookies);
      const token = linksRes.body.links[0].token;

      const res = await request.get(`/api/public/shares/${token}/resolve`);
      expect(res.status).toBe(200);
      expect(res.body.notebookName).toBe('Shared Notebook');
    });

    it('should not resolve a revoked link', async () => {
      // Create and revoke a link
      const createRes = await request
        .post(`/api/cloud/notebooks/${notebookId}/share-links`)
        .set('Cookie', ownerCookies)
        .send({ visibility: 'public' });

      const linkId = createRes.body.link.id;
      const token = createRes.body.link.token;

      await request
        .post(`/api/cloud/share-links/${linkId}/revoke`)
        .set('Cookie', ownerCookies);

      const res = await request.get(`/api/public/shares/${token}/resolve`);
      expect(res.status).toBe(404);
    });
  });

  describe('Public document access', () => {
    it('should read a document via public link', async () => {
      // Create a document in the cloud notebook via the sources API
      const writeRes = await request
        .post(`/api/sources/cloud/files/README.md?root=${notebookId}`)
        .set('Cookie', ownerCookies)
        .send({ content: '# Hello World' });
      expect(writeRes.status).toBe(201);

      // Get a public link
      const linksRes = await request
        .get(`/api/cloud/notebooks/${notebookId}/share-links`)
        .set('Cookie', ownerCookies);
      const activeLink = linksRes.body.links.find((l: any) => l.isActive);
      expect(activeLink).toBeDefined();

      const res = await request.get(`/api/public/shares/${activeLink.token}/documents/README.md`);
      expect(res.status).toBe(200);
      expect(res.body.content).toBe('# Hello World');
    });

    it('should return 404 for non-existent document', async () => {
      const linksRes = await request
        .get(`/api/cloud/notebooks/${notebookId}/share-links`)
        .set('Cookie', ownerCookies);
      const activeLink = linksRes.body.links.find((l: any) => l.isActive);

      const res = await request.get(`/api/public/shares/${activeLink.token}/documents/nonexistent.md`);
      expect(res.status).toBe(404);
    });
  });
});

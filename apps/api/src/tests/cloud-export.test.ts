import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request, signUp, cleanDb, closeDb } from './helpers.js';
import { query } from '../db/pool.js';
import JSZip from 'jszip';

describe('Cloud Export (Phase 4)', () => {
  let ownerCookies: string;
  let notebookId: string;

  beforeAll(async () => {
    await cleanDb();

    // Seed feature flags
    await query(
      `INSERT INTO feature_flags (key, enabled, description) VALUES
       ('cloud_notebooks', true, 'test'),
       ('cloud_sharing', true, 'test')
       ON CONFLICT (key) DO UPDATE SET enabled = true`
    );

    // Create owner
    const owner = await signUp('export-owner@test.com', 'Password1!', 'Exporter');
    ownerCookies = owner.cookies;

    // Create a cloud notebook
    const nbRes = await request
      .post('/api/notebooks')
      .set('Cookie', ownerCookies)
      .send({ name: 'Export Test', sourceType: 'cloud', sourceConfig: {} });
    expect(nbRes.status).toBe(201);
    notebookId = nbRes.body.notebook.id;

    // Create some documents
    await request
      .post(`/api/sources/cloud/files/README.md?root=${notebookId}`)
      .set('Cookie', ownerCookies)
      .send({ content: '# Export Test' });

    await request
      .post(`/api/sources/cloud/files/notes/todo.md?root=${notebookId}`)
      .set('Cookie', ownerCookies)
      .send({ content: '- [ ] Task 1' });
  });

  afterAll(async () => {
    await cleanDb();
    await closeDb();
  });

  it('should export notebook as zip', async () => {
    const res = await request
      .get(`/api/cloud/notebooks/${notebookId}/export`)
      .set('Cookie', ownerCookies)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');

    // Parse the zip
    const zip = await JSZip.loadAsync(res.body as Buffer);
    const files = Object.keys(zip.files);
    expect(files).toContain('README.md');
    expect(files).toContain('notes/todo.md');

    // Verify content
    const readme = await zip.file('README.md')!.async('string');
    expect(readme).toBe('# Export Test');
    const todo = await zip.file('notes/todo.md')!.async('string');
    expect(todo).toBe('- [ ] Task 1');
  });

  it('should deny export for non-member', async () => {
    const other = await signUp('other-export@test.com', 'Password1!', 'Other');

    const res = await request
      .get(`/api/cloud/notebooks/${notebookId}/export`)
      .set('Cookie', other.cookies);

    expect(res.status).toBe(403);
  });
});

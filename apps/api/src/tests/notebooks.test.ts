import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { request, cleanDb, closeDb, signUp, extractRefreshToken } from './helpers.js';

afterAll(async () => { await closeDb(); });

describe('Notebooks CRUD', () => {
  let tokenA: string;
  let tokenB: string;

  beforeEach(async () => {
    await cleanDb();
    const { res: resA } = await signUp('alice@test.com', 'password123');
    tokenA = extractRefreshToken(resA)!;
    const { res: resB } = await signUp('bob@test.com', 'password123');
    tokenB = extractRefreshToken(resB)!;
  });

  it('should create a notebook', async () => {
    const res = await request
      .post('/api/notebooks')
      .set('Cookie', `refresh_token=${tokenA}`)
      .send({ name: 'My Notes', sourceType: 'local' });
    expect(res.status).toBe(201);
    expect(res.body.notebook.name).toBe('My Notes');
    expect(res.body.notebook.sourceType).toBe('local');
    expect(res.body.notebook.id).toBeTruthy();
  });

  it('should list only the authenticated user notebooks', async () => {
    // Alice creates two notebooks
    await request.post('/api/notebooks').set('Cookie', `refresh_token=${tokenA}`).send({ name: 'Alice NB 1', sourceType: 'local' });
    await request.post('/api/notebooks').set('Cookie', `refresh_token=${tokenA}`).send({ name: 'Alice NB 2', sourceType: 'local' });

    // Bob creates one
    await request.post('/api/notebooks').set('Cookie', `refresh_token=${tokenB}`).send({ name: 'Bob NB 1', sourceType: 'local' });

    // Alice sees only her notebooks
    const aliceRes = await request.get('/api/notebooks').set('Cookie', `refresh_token=${tokenA}`);
    expect(aliceRes.status).toBe(200);
    expect(aliceRes.body.notebooks).toHaveLength(2);
    expect(aliceRes.body.notebooks.map((n: { name: string }) => n.name).sort()).toEqual(['Alice NB 1', 'Alice NB 2']);

    // Bob sees only his
    const bobRes = await request.get('/api/notebooks').set('Cookie', `refresh_token=${tokenB}`);
    expect(bobRes.body.notebooks).toHaveLength(1);
    expect(bobRes.body.notebooks[0].name).toBe('Bob NB 1');
  });

  it('should update a notebook', async () => {
    const createRes = await request
      .post('/api/notebooks')
      .set('Cookie', `refresh_token=${tokenA}`)
      .send({ name: 'Old Name', sourceType: 'local' });
    const id = createRes.body.notebook.id;

    const updateRes = await request
      .put(`/api/notebooks/${id}`)
      .set('Cookie', `refresh_token=${tokenA}`)
      .send({ name: 'New Name' });
    expect(updateRes.status).toBe(200);

    const listRes = await request.get('/api/notebooks').set('Cookie', `refresh_token=${tokenA}`);
    expect(listRes.body.notebooks[0].name).toBe('New Name');
  });

  it('should not let user B update user A notebook', async () => {
    const createRes = await request
      .post('/api/notebooks')
      .set('Cookie', `refresh_token=${tokenA}`)
      .send({ name: 'Alice Only', sourceType: 'local' });
    const id = createRes.body.notebook.id;

    const res = await request
      .put(`/api/notebooks/${id}`)
      .set('Cookie', `refresh_token=${tokenB}`)
      .send({ name: 'Hacked' });
    expect(res.status).toBe(404);
  });

  it('should delete a notebook', async () => {
    const createRes = await request
      .post('/api/notebooks')
      .set('Cookie', `refresh_token=${tokenA}`)
      .send({ name: 'Delete Me', sourceType: 'local' });
    const id = createRes.body.notebook.id;

    const deleteRes = await request
      .delete(`/api/notebooks/${id}`)
      .set('Cookie', `refresh_token=${tokenA}`);
    expect(deleteRes.status).toBe(200);

    const listRes = await request.get('/api/notebooks').set('Cookie', `refresh_token=${tokenA}`);
    expect(listRes.body.notebooks).toHaveLength(0);
  });

  it('should not let user B delete user A notebook', async () => {
    const createRes = await request
      .post('/api/notebooks')
      .set('Cookie', `refresh_token=${tokenA}`)
      .send({ name: 'Alice Only', sourceType: 'local' });
    const id = createRes.body.notebook.id;

    const res = await request
      .delete(`/api/notebooks/${id}`)
      .set('Cookie', `refresh_token=${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('should reject unauthenticated access', async () => {
    const listRes = await request.get('/api/notebooks');
    expect(listRes.status).toBe(401);

    const createRes = await request.post('/api/notebooks').send({ name: 'Test', sourceType: 'local' });
    expect(createRes.status).toBe(401);
  });

  it('should reject creating notebook without required fields', async () => {
    const res = await request
      .post('/api/notebooks')
      .set('Cookie', `refresh_token=${tokenA}`)
      .send({ name: 'No Source Type' });
    expect(res.status).toBe(400);
  });

  it('should create a GitHub notebook with sourceConfig', async () => {
    const res = await request
      .post('/api/notebooks')
      .set('Cookie', `refresh_token=${tokenA}`)
      .send({
        name: 'My GitHub Notebook',
        sourceType: 'github',
        sourceConfig: { owner: 'testuser', repo: 'notes', rootPath: 'testuser/notes' },
      });
    expect(res.status).toBe(201);
    expect(res.body.notebook.sourceType).toBe('github');
    expect(res.body.notebook.sourceConfig.owner).toBe('testuser');
    expect(res.body.notebook.sourceConfig.rootPath).toBe('testuser/notes');
  });

  it('should return sourceConfig in notebook list', async () => {
    await request
      .post('/api/notebooks')
      .set('Cookie', `refresh_token=${tokenA}`)
      .send({
        name: 'GH NB',
        sourceType: 'github',
        sourceConfig: { owner: 'user1', repo: 'repo1' },
      });

    const listRes = await request.get('/api/notebooks').set('Cookie', `refresh_token=${tokenA}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.notebooks[0].sourceConfig.owner).toBe('user1');
  });

  it('should default sourceConfig to empty object', async () => {
    const res = await request
      .post('/api/notebooks')
      .set('Cookie', `refresh_token=${tokenA}`)
      .send({ name: 'Local NB', sourceType: 'local' });
    expect(res.status).toBe(201);
    expect(res.body.notebook.sourceConfig).toEqual({});
  });

  it('should reject creating notebook without name', async () => {
    const res = await request
      .post('/api/notebooks')
      .set('Cookie', `refresh_token=${tokenA}`)
      .send({ sourceType: 'local' });
    expect(res.status).toBe(400);
  });
});

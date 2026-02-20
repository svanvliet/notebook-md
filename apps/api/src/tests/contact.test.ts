import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { request, cleanDb, closeDb, clearMailpit, getMailpitMessages } from './helpers.js';

afterAll(async () => { await closeDb(); });

describe('POST /api/contact', () => {
  beforeEach(async () => { await cleanDb(); await clearMailpit(); });

  it('should send a contact form email', async () => {
    const res = await request
      .post('/api/contact')
      .send({ name: 'Alice', email: 'alice@test.com', message: 'Hello, I love the app!' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify email was sent via Mailpit
    const messages = await getMailpitMessages();
    const contactMsg = messages.find(m => m.Subject.includes('Contact'));
    expect(contactMsg).toBeDefined();
    expect(contactMsg!.Subject).toContain('Alice');
  });

  it('should reject missing name', async () => {
    const res = await request
      .post('/api/contact')
      .send({ email: 'alice@test.com', message: 'Hello' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('should reject missing email', async () => {
    const res = await request
      .post('/api/contact')
      .send({ name: 'Alice', message: 'Hello' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('should reject missing message', async () => {
    const res = await request
      .post('/api/contact')
      .send({ name: 'Alice', email: 'alice@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('should reject empty body', async () => {
    const res = await request.post('/api/contact').send({});
    expect(res.status).toBe(400);
  });

  it('should reject non-string inputs', async () => {
    const res = await request
      .post('/api/contact')
      .send({ name: 123, email: 'alice@test.com', message: 'Hello' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('should reject overly long name', async () => {
    const res = await request
      .post('/api/contact')
      .send({ name: 'A'.repeat(201), email: 'alice@test.com', message: 'Hello' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too long/i);
  });

  it('should reject overly long message', async () => {
    const res = await request
      .post('/api/contact')
      .send({ name: 'Alice', email: 'alice@test.com', message: 'A'.repeat(5001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too long/i);
  });

  it('should trim whitespace from inputs', async () => {
    const res = await request
      .post('/api/contact')
      .send({ name: '  Alice  ', email: '  alice@test.com  ', message: '  Hello  ' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

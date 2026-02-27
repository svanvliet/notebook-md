import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { request, cleanDb, closeDb, createTestUser, seedFlagsWithGAFlight } from './helpers.js';
import { query } from '../db/pool.js';
import { redis } from '../lib/redis.js';
import { buildMessages, SYSTEM_PROMPT, MAX_TOKENS, LENGTH_GUIDANCE, MAX_CONTEXT_LENGTH } from '../services/ai.js';
import { clearFlagCache } from '../services/featureFlags.js';

// ---------------------------------------------------------------------------
// Unit tests for buildMessages / prompt construction
// ---------------------------------------------------------------------------

describe('buildMessages (unit)', () => {
  it('includes system prompt with length guidance', () => {
    const msgs = buildMessages('Write about dogs', 'short');
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain(SYSTEM_PROMPT);
    expect(msgs[0].content).toContain(LENGTH_GUIDANCE.short);
  });

  it('includes document context with [INSERT HERE] marker guidance', () => {
    const msgs = buildMessages('Summarise', 'medium', 'Hello [INSERT HERE] World');
    expect(msgs[1].content).toContain('[INSERT HERE]');
    expect(msgs[1].content).toContain('document');
  });

  it('truncates document context at MAX_CONTEXT_LENGTH', () => {
    const longDoc = 'x'.repeat(MAX_CONTEXT_LENGTH + 5000);
    const msgs = buildMessages('Go', 'long', longDoc);
    // The user content should mention truncation
    expect(msgs[1].content).toContain('truncated');
  });

  it('truncates around [INSERT HERE] marker when document is too long', () => {
    const prefix = 'A'.repeat(60_000);
    const suffix = 'B'.repeat(60_000);
    const doc = `${prefix}[INSERT HERE]${suffix}`;
    const msgs = buildMessages('Go', 'medium', doc);
    expect(msgs[1].content).toContain('[INSERT HERE]');
    expect(msgs[1].content).toContain('truncated');
  });

  it('uses correct length guidance for each setting', () => {
    for (const len of ['short', 'medium', 'long'] as const) {
      const msgs = buildMessages('test', len);
      expect(msgs[0].content).toContain(LENGTH_GUIDANCE[len]);
    }
  });
});

// ---------------------------------------------------------------------------
// Integration tests for POST /api/ai/generate
// ---------------------------------------------------------------------------

describe('POST /api/ai/generate (integration)', () => {
  let userCookies: string;
  let userId: string;

  beforeAll(async () => {
    await cleanDb();
    await seedFlagsWithGAFlight([
      { key: 'ai_content_generation', enabled: true },
      { key: 'ai_unlimited_generations', enabled: false },
    ]);
    const user = await createTestUser('ai-test@test.com', 'AI Tester');
    userCookies = user.cookies;
    userId = user.userId;
  });

  beforeEach(async () => {
    // Clear this user's quota key
    await redis.del(`ai:quota:${userId}`);
    // Clear feature flag cache to ensure DB changes are reflected
    clearFlagCache();
  });

  afterAll(async () => {
    await cleanDb();
  });

  it('rejects unauthenticated requests (401)', async () => {
    const res = await request.post('/api/ai/generate').send({ prompt: 'hello' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when ai_content_generation flag is disabled', async () => {
    // Disable the flag
    await query(`UPDATE feature_flags SET enabled = false WHERE key = 'ai_content_generation'`);

    const res = await request
      .post('/api/ai/generate')
      .set('Cookie', userCookies)
      .send({ prompt: 'hello' });
    expect(res.status).toBe(404);

    // Re-enable
    await query(`UPDATE feature_flags SET enabled = true WHERE key = 'ai_content_generation'`);
    clearFlagCache();  });

  it('validates prompt — rejects empty (400)', async () => {
    const res = await request
      .post('/api/ai/generate')
      .set('Cookie', userCookies)
      .send({ prompt: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Prompt');
  });

  it('validates prompt — rejects over 2000 chars (400)', async () => {
    const res = await request
      .post('/api/ai/generate')
      .set('Cookie', userCookies)
      .send({ prompt: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('2000');
  });

  it('validates length — rejects invalid value (400)', async () => {
    const res = await request
      .post('/api/ai/generate')
      .set('Cookie', userCookies)
      .send({ prompt: 'hello', length: 'gigantic' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Length');
  });

  it('returns 429 when daily quota exhausted', async () => {
    // Set quota to limit
    const quotaKey = `ai:quota:${userId}`;
    await redis.set(quotaKey, '999');
    await redis.expire(quotaKey, 60);
    // Temporarily set limit low via env
    const originalLimit = process.env.AI_DAILY_GENERATION_LIMIT;
    process.env.AI_DAILY_GENERATION_LIMIT = '5';

    const res = await request
      .post('/api/ai/generate')
      .set('Cookie', userCookies)
      .send({ prompt: 'hello', length: 'short' });
    expect(res.status).toBe(429);
    expect(res.body.error).toContain('limit');

    if (originalLimit !== undefined) {
      process.env.AI_DAILY_GENERATION_LIMIT = originalLimit;
    } else {
      delete process.env.AI_DAILY_GENERATION_LIMIT;
    }
  });

  it('quota headers are present in successful SSE response', async () => {
    const res = await request
      .post('/api/ai/generate')
      .set('Cookie', userCookies)
      .send({ prompt: 'hello', length: 'short' });

    // The response should be SSE (200) with quota headers
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['x-ai-generations-remaining']).toBeDefined();
    expect(res.headers['x-ai-generations-limit']).toBeDefined();
  });

  it('returns SSE stream with error event when AI not configured', async () => {
    // Without valid Azure credentials in test, the service returns an error event
    const originalEndpoint = process.env.AZURE_AI_ENDPOINT;
    const originalKey = process.env.AZURE_AI_API_KEY;
    process.env.AZURE_AI_ENDPOINT = '';
    process.env.AZURE_AI_API_KEY = '';

    const res = await request
      .post('/api/ai/generate')
      .set('Cookie', userCookies)
      .send({ prompt: 'hello', length: 'short' })
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => cb(null, data));
      });

    expect(res.status).toBe(200);
    const body = res.body as string;
    expect(body).toContain('"type":"error"');
    expect(body).toContain('not configured');

    if (originalEndpoint !== undefined) {
      process.env.AZURE_AI_ENDPOINT = originalEndpoint;
    } else {
      delete process.env.AZURE_AI_ENDPOINT;
    }
    if (originalKey !== undefined) {
      process.env.AZURE_AI_API_KEY = originalKey;
    } else {
      delete process.env.AZURE_AI_API_KEY;
    }
  });

  it('creates audit log entry on generation', async () => {
    await query(`DELETE FROM audit_log WHERE action = 'ai.generate'`);

    await request
      .post('/api/ai/generate')
      .set('Cookie', userCookies)
      .send({ prompt: 'audit test', length: 'short' });

    // Wait a bit for async audit log
    await new Promise(r => setTimeout(r, 200));

    const result = await query<{ action: string; details: any }>(
      `SELECT action, details FROM audit_log WHERE action = 'ai.generate' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.rows[0].action).toBe('ai.generate');
    const details = typeof result.rows[0].details === 'string'
      ? JSON.parse(result.rows[0].details)
      : result.rows[0].details;
    expect(details.prompt).toContain('audit test');
  });
});

// ---------------------------------------------------------------------------
// Integration tests for POST /api/ai/generate/demo
// ---------------------------------------------------------------------------

describe('POST /api/ai/generate/demo (integration)', () => {
  beforeAll(async () => {
    await cleanDb();
    await seedFlagsWithGAFlight([
      { key: 'ai_content_generation', enabled: true },
      { key: 'ai_demo_mode', enabled: true },
    ]);
  });

  beforeEach(async () => {
    // Clear all demo quota keys
    const keys = await redis.keys('ai:demo:*');
    if (keys.length) await redis.del(...keys);
    clearFlagCache();
  });

  afterAll(async () => {
    await cleanDb();
    await closeDb();
  });

  it('allows unauthenticated requests when ai_demo_mode flag is enabled', async () => {
    const res = await request
      .post('/api/ai/generate/demo')
      .send({ prompt: 'hello', length: 'short' });
    // Should get 200 SSE (or an error event if Azure not configured), but NOT 401
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  it('returns 404 when ai_demo_mode flag is disabled', async () => {
    await query(`UPDATE feature_flags SET enabled = false WHERE key = 'ai_demo_mode'`);
    clearFlagCache();

    const res = await request
      .post('/api/ai/generate/demo')
      .send({ prompt: 'hello', length: 'short' });
    expect(res.status).toBe(404);

    // Re-enable
    await query(`UPDATE feature_flags SET enabled = true WHERE key = 'ai_demo_mode'`);
    clearFlagCache();
  });

  it('sets notebookmd_demo_token cookie on first request', async () => {
    const res = await request
      .post('/api/ai/generate/demo')
      .send({ prompt: 'hello', length: 'short' });
    expect(res.status).toBe(200);

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const tokenCookie = Array.isArray(cookies)
      ? cookies.find((c: string) => c.includes('notebookmd_demo_token'))
      : (cookies as string)?.includes('notebookmd_demo_token') ? cookies : undefined;
    expect(tokenCookie).toBeDefined();
    expect(tokenCookie).toContain('HttpOnly');
  });

  it('includes quota headers in response', async () => {
    const res = await request
      .post('/api/ai/generate/demo')
      .send({ prompt: 'hello', length: 'short' });
    expect(res.status).toBe(200);
    expect(res.headers['x-ai-generations-remaining']).toBeDefined();
    expect(res.headers['x-ai-generations-limit']).toBeDefined();
  });

  it('validates input — rejects empty prompt (400)', async () => {
    const res = await request
      .post('/api/ai/generate/demo')
      .send({ prompt: '' });
    expect(res.status).toBe(400);
  });

  it('validates input — rejects long prompt (400)', async () => {
    const res = await request
      .post('/api/ai/generate/demo')
      .send({ prompt: 'x'.repeat(2001), length: 'short' });
    expect(res.status).toBe(400);
  });

  it('returns 429 with signUpRequired when demo quota exhausted', async () => {
    const originalLimit = process.env.AI_DEMO_GENERATION_LIMIT;
    process.env.AI_DEMO_GENERATION_LIMIT = '1';

    // First request should succeed — extract the demo token
    const res1 = await request
      .post('/api/ai/generate/demo')
      .send({ prompt: 'hello', length: 'short' });
    expect(res1.status).toBe(200);

    // Extract token cookie to reuse
    const cookies = res1.headers['set-cookie'];
    const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies || '';

    // Second request with same token should be rate limited
    const res2 = await request
      .post('/api/ai/generate/demo')
      .set('Cookie', cookieStr)
      .send({ prompt: 'hello again', length: 'short' });
    expect(res2.status).toBe(429);
    expect(res2.body.signUpRequired).toBe(true);
    expect(res2.body.error).toContain('Sign up');

    if (originalLimit !== undefined) {
      process.env.AI_DEMO_GENERATION_LIMIT = originalLimit;
    } else {
      delete process.env.AI_DEMO_GENERATION_LIMIT;
    }
  });

  it('does not allow webSearch in demo mode', async () => {
    const res = await request
      .post('/api/ai/generate/demo')
      .send({ prompt: 'hello', length: 'short', webSearch: true })
      .buffer(true)
      .parse((res: any, cb: any) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => cb(null, data));
      });
    expect(res.status).toBe(200);
    // The response should go through without web search — just verify it streams
    // (webSearch param is ignored in demo route)
    const body = res.body as string;
    expect(body).toContain('data:');
  });

  it('creates audit log with demo action', async () => {
    await query(`DELETE FROM audit_log WHERE action = 'ai.generate.demo'`);

    await request
      .post('/api/ai/generate/demo')
      .send({ prompt: 'demo audit test', length: 'short' });

    await new Promise(r => setTimeout(r, 200));

    const result = await query<{ action: string; user_id: string | null; details: any }>(
      `SELECT action, user_id, details FROM audit_log WHERE action = 'ai.generate.demo' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.rows[0].action).toBe('ai.generate.demo');
    expect(result.rows[0].user_id).toBeNull();
    const details = typeof result.rows[0].details === 'string'
      ? JSON.parse(result.rows[0].details)
      : result.rows[0].details;
    expect(details.demoToken).toBeDefined();
  });
});

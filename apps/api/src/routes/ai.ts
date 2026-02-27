import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../lib/redis.js';
import { requireAuth } from '../middleware/auth.js';
import { requireFeature, isFeatureEnabled, isKillSwitched } from '../services/featureFlags.js';
import { streamGeneration, checkQuota, incrementQuota, checkDemoQuota, incrementDemoQuota } from '../services/ai.js';
import { auditLog } from '../lib/audit.js';
import { randomUUID } from 'crypto';
import type { AiLength } from '../services/ai.js';

const router = Router();

const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: isTest ? undefined : new RedisStore({
    sendCommand: (...args: string[]) => (redis as any).call(...args),
  }),
  message: { error: 'Too many AI requests, please try again later' },
});

const VALID_LENGTHS = new Set(['short', 'medium', 'long']);

router.post(
  '/generate',
  requireAuth as any,
  requireFeature('ai_content_generation') as any,
  aiRateLimiter as any,
  async (req: any, res) => {
    const userId = req.userId as string;

    // Validate input
    const { prompt, length = 'medium', documentContext, cursorContext, notebookId, webSearch = false } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    if (prompt.trim().length > 2000) {
      return res.status(400).json({ error: 'Prompt must be 2000 characters or less' });
    }
    if (!VALID_LENGTHS.has(length)) {
      return res.status(400).json({ error: 'Length must be short, medium, or long' });
    }

    // Check quota
    const quota = await checkQuota(userId);
    res.setHeader('X-AI-Generations-Remaining', String(quota.remaining));
    res.setHeader('X-AI-Generations-Limit', String(quota.limit));

    if (!quota.allowed) {
      return res.status(429).json({
        error: 'Daily AI generation limit reached. Try again tomorrow.',
        remaining: 0,
        limit: quota.limit,
      });
    }

    // Increment quota before starting (optimistic — prevents race conditions)
    await incrementQuota(userId);

    // Check if web search is requested and allowed
    let useWebSearch = false;
    if (webSearch) {
      useWebSearch = await isFeatureEnabled('ai_web_search', userId);
    }

    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-AI-Generations-Remaining': String(Math.max(0, quota.remaining - 1)),
      'X-AI-Generations-Limit': String(quota.limit),
    });

    let outcome = 'success';

    try {
      const stream = streamGeneration(
        prompt.trim(),
        length as AiLength,
        documentContext,
        cursorContext,
        useWebSearch,
      );

      for await (const event of stream) {
        if (res.writableEnded) break;

        res.write(`data: ${JSON.stringify(event)}\n\n`);

        if (event.type === 'error') {
          outcome = 'error';
          break;
        }
      }
    } catch (err: any) {
      outcome = 'error';
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Internal server error' })}\n\n`);
      }
    } finally {
      // Audit log
      await auditLog({
        userId,
        action: 'ai.generate',
        details: {
          prompt: prompt.trim().slice(0, 500),
          length,
          webSearch: useWebSearch,
          outcome,
          notebookId: notebookId || null,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      }).catch(() => {}); // Don't fail the request if audit logging fails

      if (!res.writableEnded) {
        res.end();
      }
    }
  },
);

// --- Demo route (no auth required) ---

const demoRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: isTest ? undefined : new RedisStore({
    sendCommand: (...args: string[]) => (redis as any).call(...args),
    prefix: 'rl:ai-demo:',
  }),
  message: { error: 'Too many AI requests, please try again later' },
});

router.post(
  '/generate/demo',
  demoRateLimiter as any,
  async (req: any, res) => {
    // Check ai_demo_mode flag (global kill switch — no userId needed)
    const killed = await isKillSwitched('ai_demo_mode');
    if (killed) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Get or create demo token
    let demoToken = req.cookies?.notebookmd_demo_token;
    if (!demoToken || typeof demoToken !== 'string') {
      demoToken = randomUUID();
    }
    // Always set/refresh the cookie (30-day expiry)
    res.cookie('notebookmd_demo_token', demoToken, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === 'production',
    });

    // Validate input
    const { prompt, length = 'medium', documentContext, cursorContext } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    if (prompt.trim().length > 2000) {
      return res.status(400).json({ error: 'Prompt must be 2000 characters or less' });
    }
    if (!VALID_LENGTHS.has(length)) {
      return res.status(400).json({ error: 'Length must be short, medium, or long' });
    }

    // Check demo quota
    const quota = await checkDemoQuota(demoToken);
    res.setHeader('X-AI-Generations-Remaining', String(quota.remaining));
    res.setHeader('X-AI-Generations-Limit', String(quota.limit));

    if (!quota.allowed) {
      return res.status(429).json({
        error: 'Demo AI generation limit reached. Sign up for a free account to continue using AI features!',
        remaining: 0,
        limit: quota.limit,
        signUpRequired: true,
      });
    }

    // Increment demo quota before starting
    await incrementDemoQuota(demoToken);

    // Set up SSE — no web search for demo users
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-AI-Generations-Remaining': String(Math.max(0, quota.remaining - 1)),
      'X-AI-Generations-Limit': String(quota.limit),
    });

    let outcome = 'success';

    try {
      const stream = streamGeneration(
        prompt.trim(),
        length as AiLength,
        documentContext,
        cursorContext,
        false, // webSearch always false for demo
      );

      for await (const event of stream) {
        if (res.writableEnded) break;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.type === 'error') {
          outcome = 'error';
          break;
        }
      }
    } catch (err: any) {
      outcome = 'error';
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Internal server error' })}\n\n`);
      }
    } finally {
      await auditLog({
        userId: null as any,
        action: 'ai.generate.demo',
        details: {
          demoToken: demoToken.slice(0, 8),
          prompt: prompt.trim().slice(0, 500),
          length,
          outcome,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      }).catch(() => {});

      if (!res.writableEnded) {
        res.end();
      }
    }
  },
);

export default router;

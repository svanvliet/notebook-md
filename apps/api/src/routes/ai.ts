import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../lib/redis.js';
import { requireAuth } from '../middleware/auth.js';
import { requireFeature } from '../services/featureFlags.js';
import { streamGeneration, checkQuota, incrementQuota } from '../services/ai.js';
import { auditLog } from '../lib/audit.js';
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
    const { prompt, length = 'medium', documentContext, cursorContext, notebookId } = req.body || {};

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

export default router;

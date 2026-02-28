import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { correlationMiddleware, requestLogger, errorHandler } from './middleware/common.js';
import { healthCheck } from './db/pool.js';
import { redisHealthCheck } from './lib/redis.js';
import { sendContactForm } from './lib/email.js';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import oauthRoutes from './routes/oauth.js';
import settingsRoutes from './routes/settings.js';
import notebookRoutes from './routes/notebooks.js';
import sourcesRoutes from './routes/sources.js';
import githubRoutes from './routes/github.js';
import onedriveRoutes from './routes/onedrive.js';
import googledriveRoutes from './routes/googledrive.js';
import webhookRoutes from './routes/webhooks.js';
import twoFactorRoutes from './routes/two-factor.js';
import adminRoutes from './routes/admin.js';
import entitlementsRoutes from './routes/entitlements.js';
import usageRoutes from './routes/usage.js';
import sharingRoutes from './routes/sharing.js';
import cloudRoutes from './routes/cloud.js';
import aiRoutes from './routes/ai.js';

// Register source adapters (side-effect imports)
import './services/sources/github.js';
import './services/sources/onedrive.js';
import './services/sources/googledrive.js';
import './services/sources/cloud.js';

const app = express();

// Trust proxy when behind Nginx/Front Door (enables correct client IP for rate limiting)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Webhooks need raw body for signature verification — mount BEFORE json parser
app.use('/webhooks/github', express.text({ type: 'application/json' }), webhookRoutes);

// Core middleware

// Security headers via helmet with custom CSP
const isDev = process.env.NODE_ENV !== 'production';
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind injects inline styles
        imgSrc: ["'self'", 'data:', 'blob:', '*.sharepoint.com', '*.googleusercontent.com', '*.githubusercontent.com', '*.ggpht.com'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'fonts.gstatic.com'],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    // HSTS: 1 year, include subdomains, preload-ready
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    crossOriginEmbedderPolicy: false, // Needed for external images
  }),
);

// CORS: restrict to allowed origins
const allowedOrigins = isDev
  ? [/^http:\/\/localhost:\d+$/]
  : [...(process.env.CORS_ORIGIN ?? 'https://notebookmd.io').split(','), process.env.ADMIN_ORIGIN ?? 'https://admin.notebookmd.io'];
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (server-to-server, curl, etc.)
      if (!origin) return cb(null, true);
      const allowed = allowedOrigins.some((o) =>
        o instanceof RegExp ? o.test(origin) : o === origin,
      );
      cb(allowed ? null : new Error('CORS not allowed'), allowed);
    },
    credentials: true,
  }),
);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// CSRF protection: state-changing requests must have JSON Content-Type
// Browsers can't send cross-origin JSON without a CORS preflight, so
// this plus SameSite=Lax cookies prevents CSRF attacks.
app.use((req, res, next) => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) return next();
  const ct = req.headers['content-type'] ?? '';
  const hasBody = req.headers['content-length'] && req.headers['content-length'] !== '0';
  // Allow JSON, text (webhooks), or bodyless requests (cookie-only endpoints like /auth/refresh)
  if (ct.includes('application/json') || ct.includes('text/') || !hasBody || req.path.startsWith('/webhooks/')) {
    return next();
  }
  res.status(403).json({ error: 'Invalid Content-Type' });
});

app.use(correlationMiddleware);
app.use(requestLogger);

// Health check endpoint
app.get('/api/health', async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([healthCheck(), redisHealthCheck()]);
  const ok = dbOk && redisOk;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    services: { db: dbOk ? 'ok' : 'down', redis: redisOk ? 'ok' : 'down' },
    timestamp: new Date().toISOString(),
  });
});

// Routes
// Public contact form (rate-limited: 5 per hour per IP)
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.VITEST === 'true' ? 10000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages. Please try again later.' },
});

app.post('/api/contact', contactLimiter, async (req, res) => {
  const { name, email, message } = req.body ?? {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }
  if (typeof name !== 'string' || typeof email !== 'string' || typeof message !== 'string') {
    return res.status(400).json({ error: 'Invalid input.' });
  }
  if (name.length > 200 || email.length > 320 || message.length > 5000) {
    return res.status(400).json({ error: 'Input too long.' });
  }
  try {
    const cleanName = name.trim().replace(/<[^>]*>/g, '');
    const cleanMessage = message.trim().replace(/<[^>]*>/g, '');
    await sendContactForm(cleanName, email.trim(), cleanMessage);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

import { isFeatureEnabled, isKillSwitched, resolveAllFlags, clearFlagCache } from './services/featureFlags.js';
import { optionalAuth, requireAuth } from './middleware/auth.js';

app.use('/auth', authRoutes);
app.use('/auth/2fa', twoFactorRoutes);
app.use('/auth/oauth', oauthRoutes);
app.use('/auth/settings', settingsRoutes);
app.use('/api/notebooks', notebookRoutes);
app.use('/api/sources', sourcesRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/onedrive', onedriveRoutes);
app.use('/api/googledrive', googledriveRoutes);
app.use('/api/entitlements', entitlementsRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/cloud', sharingRoutes);
app.use('/api/cloud', cloudRoutes);
app.use('/api/ai', aiRoutes);

// Public share link routes (no auth, separate mount point)
import { Router as PublicRouter } from 'express';
import { resolvePublicLink as resolveLink } from './services/shareLinks.js';
import { decrypt as decryptContent } from './lib/encryption.js';
const publicShareRouter = PublicRouter();
publicShareRouter.get('/shares/:token/resolve', async (req, res) => {
  const killed = await isKillSwitched('cloud_public_links');
  if (killed) { res.status(403).json({ error: 'Public links are currently disabled' }); return; }
  const result = await resolveLink(req.params.token);
  if (!result) { res.status(404).json({ error: 'Link not found or not public' }); return; }
  const { query: dbQuery } = await import('./db/pool.js');
  const files = await dbQuery<{ path: string; size_bytes: number }>(
    'SELECT path, size_bytes FROM cloud_documents WHERE notebook_id = $1 ORDER BY path',
    [result.notebookId],
  );
  res.json({ notebookName: result.notebookName, ownerName: result.ownerName, files: files.rows.map(f => ({ path: f.path, size: f.size_bytes })) });
});
publicShareRouter.get('/shares/:token/documents/{*filePath}', async (req, res) => {
  const killed = await isKillSwitched('cloud_public_links');
  if (killed) { res.status(403).json({ error: 'Public links are currently disabled' }); return; }
  const result = await resolveLink(req.params.token);
  if (!result) { res.status(404).json({ error: 'Link not found or not public' }); return; }
  const rawPath = (req.params as any).filePath;
  const filePath = Array.isArray(rawPath) ? rawPath.join('/') : rawPath;
  const { query: dbQuery } = await import('./db/pool.js');
  const doc = await dbQuery<{ content_enc: string | null }>(
    'SELECT content_enc FROM cloud_documents WHERE notebook_id = $1 AND path = $2',
    [result.notebookId, filePath],
  );
  if (doc.rows.length === 0) { res.status(404).json({ error: 'Document not found' }); return; }
  const content = doc.rows[0].content_enc ? decryptContent(doc.rows[0].content_enc) : '';
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.json({ content, path: filePath });
});
app.use('/api/public', publicShareRouter);

app.use('/admin', adminRoutes);

// Feature flag check (public — used by web client to gate UI)
app.get('/api/feature-flags/:key', optionalAuth, async (req, res) => {
  const key = req.params.key as string;
  const enabled = await isFeatureEnabled(key, req.userId ?? null);
  res.json({ key, enabled });
});

// Batch flag resolution (returns all flags for the current user)
app.get('/api/flags', optionalAuth, async (req, res) => {
  const userId = req.userId ?? null;
  const allFlags = await resolveAllFlags(userId);
  // Only return enabled flags and their metadata (omit disabled flags for security)
  const flags: Record<string, { enabled: boolean; variant: string | null; badge: string | null }> = {};
  for (const [key, resolved] of Object.entries(allFlags)) {
    flags[key] = { enabled: resolved.enabled, variant: resolved.variant, badge: resolved.badge };
  }
  // For anonymous users, include demo-relevant flags that aren't kill-switched
  if (!userId) {
    const demoKilled = await isKillSwitched('ai_demo_mode');
    flags['ai_demo_mode'] = { enabled: !demoKilled, variant: null, badge: null };
  }
  res.json({ flags });
});

// ── Self-enrollment groups (user-facing) ─────────────────────────────────────

app.get('/api/groups/joinable', requireAuth, async (req, res) => {
  const { query: dbQuery } = await import('./db/pool.js');
  const result = await dbQuery<{
    id: string;
    name: string;
    description: string | null;
    is_member: boolean;
  }>(
    `SELECT g.id, g.name, g.description,
            EXISTS(SELECT 1 FROM user_group_members ugm WHERE ugm.group_id = g.id AND ugm.user_id = $1) as is_member
     FROM user_groups g
     WHERE g.allow_self_enroll = true
     ORDER BY g.name`,
    [req.userId],
  );
  res.json({
    groups: result.rows.map(g => ({
      id: g.id,
      name: g.name,
      description: g.description,
      isMember: g.is_member,
    })),
  });
});

app.post('/api/groups/:id/join', requireAuth, async (req, res) => {
  const { query: dbQuery } = await import('./db/pool.js');
  const group = await dbQuery<{ allow_self_enroll: boolean }>(
    'SELECT allow_self_enroll FROM user_groups WHERE id = $1',
    [req.params.id],
  );
  if (group.rows.length === 0) { res.status(404).json({ error: 'Group not found' }); return; }
  if (!group.rows[0].allow_self_enroll) { res.status(403).json({ error: 'This group does not allow self-enrollment' }); return; }

  await dbQuery(
    'INSERT INTO user_group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.params.id, req.userId],
  );
  clearFlagCache(req.userId!);
  res.json({ message: 'Joined group' });
});

app.post('/api/groups/:id/leave', requireAuth, async (req, res) => {
  const { query: dbQuery } = await import('./db/pool.js');
  await dbQuery(
    'DELETE FROM user_group_members WHERE group_id = $1 AND user_id = $2',
    [req.params.id, req.userId],
  );
  clearFlagCache(req.userId!);
  res.json({ message: 'Left group' });
});

// Error handler (must be last)
app.use(errorHandler);

export default app;

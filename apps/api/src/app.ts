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

// Register source adapters (side-effect imports)
import './services/sources/github.js';
import './services/sources/onedrive.js';
import './services/sources/googledrive.js';

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
    await sendContactForm(name.trim(), email.trim(), message.trim());
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

app.use('/auth', authRoutes);
app.use('/auth/2fa', twoFactorRoutes);
app.use('/auth/oauth', oauthRoutes);
app.use('/auth/settings', settingsRoutes);
app.use('/api/notebooks', notebookRoutes);
app.use('/api/sources', sourcesRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/onedrive', onedriveRoutes);
app.use('/api/googledrive', googledriveRoutes);
app.use('/admin', adminRoutes);

// Error handler (must be last)
app.use(errorHandler);

export default app;

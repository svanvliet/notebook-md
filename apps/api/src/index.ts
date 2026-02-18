import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { correlationMiddleware, requestLogger, errorHandler } from './middleware/common.js';
import { healthCheck } from './db/pool.js';
import { redis, redisHealthCheck } from './lib/redis.js';
import { logger } from './lib/logger.js';
import { seed } from './db/seed.js';
import authRoutes from './routes/auth.js';
import oauthRoutes from './routes/oauth.js';
import settingsRoutes from './routes/settings.js';
import notebookRoutes from './routes/notebooks.js';
import { initializeOAuthProviders } from './services/oauth/index.js';

const app = express();
const port = process.env.PORT ?? 3001;

// Core middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173', credentials: true }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
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
app.use('/auth', authRoutes);
app.use('/auth/oauth', oauthRoutes);
app.use('/auth/settings', settingsRoutes);
app.use('/api/notebooks', notebookRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Start server
async function start() {
  try {
    await redis.connect();
    logger.info('Connected to Redis');

    initializeOAuthProviders();
  } catch (err) {
    logger.warn('Redis connection failed, continuing without cache', { error: (err as Error).message });
  }

  // Run seed in dev
  if (process.env.NODE_ENV !== 'production') {
    try {
      await seed();
    } catch (err) {
      logger.warn('Seed failed (run migrations first)', { error: (err as Error).message });
    }
  }

  app.listen(port, () => {
    logger.info(`Notebook.md API listening on port ${port}`);
  });
}

start();

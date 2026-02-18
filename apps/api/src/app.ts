import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { correlationMiddleware, requestLogger, errorHandler } from './middleware/common.js';
import { healthCheck } from './db/pool.js';
import { redisHealthCheck } from './lib/redis.js';
import authRoutes from './routes/auth.js';
import oauthRoutes from './routes/oauth.js';
import settingsRoutes from './routes/settings.js';
import notebookRoutes from './routes/notebooks.js';
import sourcesRoutes from './routes/sources.js';

const app = express();

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
app.use('/api/sources', sourcesRoutes);

// Error handler (must be last)
app.use(errorHandler);

export default app;

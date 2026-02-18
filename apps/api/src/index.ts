import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from monorepo root (CWD may be apps/api/ via npm workspace)
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import app from './app.js';
import { redis } from './lib/redis.js';
import { logger } from './lib/logger.js';
import { seed } from './db/seed.js';
import { initializeOAuthProviders } from './services/oauth/index.js';

const port = process.env.PORT ?? 3001;

// Prevent unhandled errors from crashing the process
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { error: String(reason) });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
});

// Start server
async function start() {
  try {
    await redis.connect();
    logger.info('Connected to Redis');
  } catch (err) {
    logger.warn('Redis connection failed, continuing without cache', { error: (err as Error).message });
  }

  initializeOAuthProviders();

  // Run seed in dev
  if (process.env.NODE_ENV !== 'production') {
    try {
      await seed();
    } catch (err) {
      logger.warn('Seed failed (run migrations first)', { error: (err as Error).message });
    }
  }

  const server = app.listen(port, () => {
    logger.info(`Notebook.md API listening on port ${port}`);
  });

  server.on('error', (err) => {
    logger.error('HTTP server error', { error: err.message, stack: (err as Error).stack });
  });

  server.on('close', () => {
    logger.error('HTTP server closed unexpectedly');
  });
}

start();

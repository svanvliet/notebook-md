import app from './app.js';
import { redis } from './lib/redis.js';
import { logger } from './lib/logger.js';
import { seed } from './db/seed.js';
import { initializeOAuthProviders } from './services/oauth/index.js';

const port = process.env.PORT ?? 3001;

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

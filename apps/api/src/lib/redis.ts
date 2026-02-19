import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

export const redis = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 10) return null; // stop retrying after 10 attempts
        return Math.min(times * 500, 5000);
      },
    })
  : new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 10) return null;
        return Math.min(times * 500, 5000);
      },
    });

let lastErrorTime = 0;
redis.on('error', (err) => {
  const now = Date.now();
  // Throttle error logs to once per 5 seconds
  if (now - lastErrorTime > 5000) {
    console.error('[redis] Connection error:', err.message);
    lastErrorTime = now;
  }
});

export async function redisHealthCheck(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

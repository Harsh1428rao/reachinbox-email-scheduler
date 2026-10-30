import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

redisConnection.on('connect', () => console.log('Redis connected successfully'));
redisConnection.on('error', (err) => console.error('Redis connection error:', err));

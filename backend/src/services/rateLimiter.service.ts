import { redisConnection } from '../config/redis';

export class RateLimiterService {
  /**
   * Sliding window hour-based rate limiter using Redis
   * Window Key: ratelimit:sender:<senderId>:<hourTimestamp>
   */
  public static async checkAndIncrement(
    senderId: string,
    maxPerHour: number
  ): Promise<{ allowed: boolean; retryAfterMs: number }> {
    const now = Date.now();
    const currentHourWindow = Math.floor(now / 3600000);
    const key = `ratelimit:sender:${senderId}:${currentHourWindow}`;

    const count = await redisConnection.incr(key);

    if (count === 1) {
      await redisConnection.expire(key, 3700);
    }

    if (count > maxPerHour) {
      const nextHourTimestamp = (currentHourWindow + 1) * 3600000;
      const retryAfterMs = nextHourTimestamp - now + 1000;
      return { allowed: false, retryAfterMs };
    }

    return { allowed: true, retryAfterMs: 0 };
  }
}

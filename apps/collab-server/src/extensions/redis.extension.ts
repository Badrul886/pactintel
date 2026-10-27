/**
 * Collab Server Redis Realtime Extension
 * Scales Hocuspocus horizontally across Cloud Run instances.
 * Blueprint References: §8, §16, Invariant I-02
 */
import { Redis } from '@hocuspocus/extension-redis';
import { config } from '../config';

export function createRedisExtension(): Redis | null {
  if (!config.redisRealtimeHost && !config.redisRealtimeUrl) {
    if (config.env === 'production') {
      console.warn(
        '[CollabRedis] REDIS_REALTIME_HOST not set in production. Single-instance fallback mode.',
      );
    }
    return null;
  }

  const host =
    config.redisRealtimeHost ||
    (config.redisRealtimeUrl ? new URL(config.redisRealtimeUrl).hostname : 'localhost');
  const port =
    config.redisRealtimePort ||
    (config.redisRealtimeUrl
      ? parseInt(new URL(config.redisRealtimeUrl).port || '6379', 10)
      : 6379);

  return new Redis({
    host,
    port,
    prefix: 'pactintel:collab',
    options: {
      password: config.redisRealtimePassword,
      tls:
        config.env === 'production' ||
        (config.redisRealtimeUrl && config.redisRealtimeUrl.startsWith('rediss://'))
          ? {}
          : undefined,
    },
  });
}

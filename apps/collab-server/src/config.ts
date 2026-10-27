/**
 * Collab Server Configuration
 * Blueprint References: §8, §16, Invariant I-01 (configurable max-in-memory-docs)
 */

export interface CollabConfig {
  port: number;
  env: string;
  redisRealtimeHost?: string;
  redisRealtimePort: number;
  redisRealtimePassword?: string;
  redisRealtimeUrl?: string;
  maxInMemoryDocs: number;
  gcTimeoutMs: number;
  apiUrl: string;
  databaseUrl?: string;
}

export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value !== undefined && value !== '') {
    return value;
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  return '';
}

export const config: CollabConfig = {
  port: parseInt(getEnv('COLLAB_PORT', getEnv('PORT', '1234')), 10),
  env: getEnv('NODE_ENV', 'development'),
  redisRealtimeHost: getEnv('REDIS_REALTIME_HOST') || undefined,
  redisRealtimePort: parseInt(getEnv('REDIS_REALTIME_PORT', '6382'), 10),
  redisRealtimePassword: getEnv('REDIS_REALTIME_PASSWORD') || undefined,
  redisRealtimeUrl: getEnv('REDIS_REALTIME_URL') || undefined,
  maxInMemoryDocs: parseInt(getEnv('MAX_IN_MEMORY_DOCS', '500'), 10),
  gcTimeoutMs: parseInt(getEnv('COLLAB_GC_TIMEOUT_MS', String(5 * 60 * 1000)), 10), // 5 minutes (RULE COLLAB-003)
  apiUrl: getEnv('INTERNAL_API_URL', 'http://localhost:3000'),
  databaseUrl: getEnv('DATABASE_URL') || undefined,
};

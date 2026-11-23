import Redis, { RedisOptions } from 'ioredis';
import { reportBackgroundError } from '../utils/databaseErrors';

const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  username: process.env.REDIS_USERNAME || undefined,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
};

// All queue producers and workers consume these options, so URL credentials
// and TLS must be resolved here rather than only on the shared connection.
if (process.env.REDIS_URL?.trim()) {
  try {
    const url = new URL(process.env.REDIS_URL.trim());
    if (!['redis:', 'rediss:'].includes(url.protocol) || !url.hostname || url.search || url.hash) {
      throw new Error('Unsupported Redis URL');
    }
    const database = url.pathname.replace(/^\//, '') || '0';
    if (!/^\d+$/.test(database) || !Number.isSafeInteger(Number(database))) {
      throw new Error('Invalid Redis database');
    }
    Object.assign(redisConfig, {
      host: url.hostname.replace(/^\[|\]$/g, ''),
      port: Number(url.port || 6379),
      username: decodeURIComponent(url.username) || undefined,
      password: decodeURIComponent(url.password) || undefined,
      db: Number(database),
      ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    });
  } catch {
    // URL parser errors can contain credentials; never forward the input/error.
    throw new Error('Invalid REDIS_URL. Use redis:// or rediss:// with optional credentials, port and database number.');
  }
}

export const redisConnection = new Redis(redisConfig);

redisConnection.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

redisConnection.on('error', (error) => {
  reportBackgroundError('Redis connection', error);
});

export default redisConfig;

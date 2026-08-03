import { z } from 'zod';

/**
 * Ortam değişkeni şeması.
 *
 * Uygulama, eksik veya hatalı bir env ile AÇILMAZ. "Sunucu ayakta ama JWT
 * secret'ı boş" durumu, sessizce güvensiz çalışan bir sisteme yol açar.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url(),
  WORKER_DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().url().optional(),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_GLOBAL_PREFIX: z.string().default('api'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET en az 32 karakter olmalı'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET en az 32 karakter olmalı'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  AUTH_COOKIE_DOMAIN: z.string().default('localhost'),
  AUTH_COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  ENCRYPTION_KEY_V1: z.string().min(1),
  ENCRYPTION_ACTIVE_KEY_VERSION: z.coerce.number().int().min(1).default(1),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  env: Env['NODE_ENV'];
  isProduction: boolean;
  port: number;
  globalPrefix: string;
  corsOrigins: string[];
  database: { url: string; directUrl: string; workerUrl: string };
  redisUrl?: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  cookie: { domain: string; secure: boolean };
  encryption: { keys: Record<number, string>; activeVersion: number };
}

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Ortam değişkenleri geçersiz:\n${issues}\n\n.env dosyanı kontrol et.`);
  }

  const env = parsed.data;

  if (env.NODE_ENV === 'production') {
    if (!env.AUTH_COOKIE_SECURE) {
      throw new Error('Üretimde AUTH_COOKIE_SECURE=true olmalı.');
    }
    if (env.JWT_ACCESS_SECRET.includes('degistir') || env.JWT_REFRESH_SECRET.includes('degistir')) {
      throw new Error('Üretimde varsayılan JWT secret değerleri kullanılamaz.');
    }
  }

  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.API_PORT,
    globalPrefix: env.API_GLOBAL_PREFIX,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    database: {
      url: env.DATABASE_URL,
      directUrl: env.DIRECT_DATABASE_URL,
      workerUrl: env.WORKER_DATABASE_URL,
    },
    redisUrl: env.REDIS_URL,
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
    },
    cookie: {
      domain: env.AUTH_COOKIE_DOMAIN,
      secure: env.AUTH_COOKIE_SECURE,
    },
    encryption: {
      keys: { 1: env.ENCRYPTION_KEY_V1 },
      activeVersion: env.ENCRYPTION_ACTIVE_KEY_VERSION,
    },
  };
}

export const CONFIG = 'APP_CONFIG';

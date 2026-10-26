// Конфигурация через переменные окружения. Секреты не попадают в клиент: /api/config отдаёт только публичные поля.

import path from 'node:path';
import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

export const ROOT_DIR = path.resolve(import.meta.dirname, '../../..');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(8080),
  /** Публичный HTTPS-адрес приложения (Mini App и webhook). */
  PUBLIC_URL: z.string().url().optional(),
  /** PostgreSQL. Если не задан — встроенный PGlite в DATA_DIR (только для разработки/демо). */
  DATABASE_URL: z.string().optional(),
  DATA_DIR: z.string().default(path.join(ROOT_DIR, 'data')),
  BOT_TOKEN: z.string().optional(),
  BOT_USERNAME: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  INIT_DATA_MAX_AGE_SEC: z.coerce.number().int().positive().default(86400),
  /** Вход без Telegram для локальной разработки. Запрещён в production. */
  DEV_AUTH: bool.default(false),
  /** stars — Telegram Stars; sandbox — тестовая оплата без денег; disabled — оплата выключена. */
  PAYMENTS_MODE: z.enum(['stars', 'sandbox', 'disabled']).default('disabled'),
  ADMIN_TELEGRAM_IDS: z.string().default(''),
  AUDIO_DIR: z.string().default(path.join(ROOT_DIR, 'storage/audio')),
  /** Базовый URL аудио (CDN). По умолчанию файлы отдаёт сам сервер по /media/audio. */
  AUDIO_BASE_URL: z.string().default('/media/audio'),
  WEB_DIST: z.string().default(path.join(ROOT_DIR, 'apps/web/dist')),
  CONTENT_DIR: z.string().default(path.join(ROOT_DIR, 'content')),
  LEGAL_DIR: z.string().default(path.join(ROOT_DIR, 'docs/legal')),
  SUPPORT_CONTACT: z.string().default('@pravo_na_sluh_support'),
  TERMS_VERSION: z.string().default('2026-10-14'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().default(240),
  /** Сколько бонусов за приглашения может получить один пользователь (по 7 дней Pro за каждого друга). */
  REFERRAL_MAX_REWARDS: z.coerce.number().int().min(0).default(10),
  AUTO_MIGRATE: bool.default(true),
  AUTO_SEED: bool.default(true),
});

export type Config = z.infer<typeof schema> & { adminIds: Set<string> };

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Некорректная конфигурация: ${msg}`);
  }
  const c = parsed.data;
  if (c.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (c.DEV_AUTH) missing.push('DEV_AUTH должен быть выключен в production');
    if (!c.BOT_TOKEN) missing.push('BOT_TOKEN');
    if (!c.TELEGRAM_WEBHOOK_SECRET) missing.push('TELEGRAM_WEBHOOK_SECRET');
    if (!c.PUBLIC_URL) missing.push('PUBLIC_URL');
    if (!c.DATABASE_URL) missing.push('DATABASE_URL (PGlite не предназначен для production)');
    if (c.PAYMENTS_MODE === 'sandbox') missing.push('PAYMENTS_MODE=sandbox запрещён в production');
    if (missing.length) throw new Error(`Конфигурация production неполная: ${missing.join(', ')}`);
  }
  return { ...c, adminIds: new Set(c.ADMIN_TELEGRAM_IDS.split(',').map((s) => s.trim()).filter(Boolean)) };
}

/** Токен для подписи initData в режиме разработки, если реальный BOT_TOKEN не задан. */
export const DEV_BOT_TOKEN = '000000000:DEV-ONLY-NOT-A-REAL-TOKEN';

export function botTokenFor(c: Config): string | null {
  if (c.BOT_TOKEN) return c.BOT_TOKEN;
  return c.NODE_ENV !== 'production' ? DEV_BOT_TOKEN : null;
}

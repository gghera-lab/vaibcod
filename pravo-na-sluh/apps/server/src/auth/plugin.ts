// Авторизация запросов Mini App: заголовок «Authorization: tma <initData>».
// Telegram ID берётся только из проверенной подписи; любые id из тела запроса игнорируются.

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { botTokenFor, type Config } from '../config.ts';
import type { DB } from '../db/client.ts';
import { users, userSettings } from '../db/schema.ts';
import { AppError, forbidden } from '../lib/errors.ts';
import { InitDataError, validateInitData, type TelegramUser } from './telegram.ts';

export type UserRow = typeof users.$inferSelect;

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow | null;
    telegramUser: TelegramUser | null;
    /** start_param из подписанных initData (например, ref_<код> из ссылки-приглашения). */
    startParam: string | null;
  }
}

/** Диапазон id для пользователей режима разработки (вне диапазона реальных Telegram ID). */
export const DEV_USER_ID_BASE = 990_000_000_000;

const lastSeenWrites = new Map<number, number>();

export async function upsertUser(db: DB, tg: TelegramUser): Promise<UserRow> {
  const [existing] = await db.select().from(users).where(eq(users.telegramId, tg.id)).limit(1);
  if (existing) {
    const changed = existing.firstName !== (tg.first_name ?? null) || existing.username !== (tg.username ?? null);
    const last = lastSeenWrites.get(existing.id) ?? 0;
    if (changed || Date.now() - last > 10 * 60_000) {
      lastSeenWrites.set(existing.id, Date.now());
      const [u] = await db.update(users).set({
        firstName: tg.first_name ?? null, lastName: tg.last_name ?? null, username: tg.username ?? null,
        languageCode: tg.language_code ?? null, lastSeenAt: new Date(),
      }).where(eq(users.id, existing.id)).returning();
      return u;
    }
    return existing;
  }
  const [created] = await db.insert(users).values({
    telegramId: tg.id,
    firstName: tg.first_name ?? null,
    lastName: tg.last_name ?? null,
    username: tg.username ?? null,
    languageCode: tg.language_code ?? null,
    isDevUser: tg.id >= DEV_USER_ID_BASE,
  }).onConflictDoNothing().returning();
  const user = created ?? (await db.select().from(users).where(eq(users.telegramId, tg.id)).limit(1))[0];
  await db.insert(userSettings).values({ userId: user.id }).onConflictDoNothing();
  return user;
}

export function registerAuth(app: FastifyInstance, db: DB, config: Config) {
  app.decorateRequest('user', null);
  app.decorateRequest('telegramUser', null);
  app.decorateRequest('startParam', null);
  const token = botTokenFor(config);

  app.addHook('preHandler', async (req) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('tma ')) return;
    if (!token) throw new AppError(503, 'bot_not_configured', 'Сервер не настроен: не задан BOT_TOKEN');
    try {
      const { user, startParam } = validateInitData(header.slice(4), token, config.INIT_DATA_MAX_AGE_SEC);
      if (user.id >= DEV_USER_ID_BASE && !config.DEV_AUTH) throw new InitDataError('bad_hash', 'Тестовые пользователи отключены');
      req.telegramUser = user;
      req.startParam = startParam;
      req.user = await upsertUser(db, user);
    } catch (e) {
      if (e instanceof InitDataError) {
        const status = e.code === 'expired' ? 401 : 401;
        throw new AppError(status, `auth_${e.code}`, e.message);
      }
      throw e;
    }
  });
}

export function requireUser(req: FastifyRequest): UserRow {
  if (!req.user) throw new AppError(401, 'auth_required', 'Откройте приложение через Telegram, чтобы продолжить');
  return req.user;
}

export function isAdmin(config: Config, user: UserRow | null): boolean {
  return !!user && config.adminIds.has(String(user.telegramId));
}

export function requireAdmin(req: FastifyRequest, config: Config): UserRow {
  const u = requireUser(req);
  if (!isAdmin(config, u)) throw forbidden('Раздел доступен только администраторам');
  return u;
}

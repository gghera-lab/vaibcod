// Тестовое окружение: PostgreSQL в памяти (PGlite), реальные миграции и справочные данные,
// фиктивный Telegram-бот, записывающий вызовы (без сетевых запросов).

import { buildApp, type AppContext } from '../src/app.ts';
import { signInitData, type TelegramUser } from '../src/auth/telegram.ts';
import { loadConfig } from '../src/config.ts';
import { openDatabase } from '../src/db/client.ts';
import { seed } from '../src/db/seed.ts';
import type { BotClient } from '../src/telegram/bot-api.ts';

export const TEST_BOT_TOKEN = '123456:TEST-TOKEN';
export const WEBHOOK_SECRET = 'test-webhook-secret-0123456789';

export class FakeBot implements BotClient {
  readonly enabled = true;
  calls: { method: string; params: Record<string, unknown> }[] = [];
  async call<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
    this.calls.push({ method, params });
    if (method === 'createInvoiceLink') return 'https://t.me/$test-invoice' as T;
    return true as T;
  }
  last(method: string) {
    return [...this.calls].reverse().find((c) => c.method === method);
  }
}

export async function setup(env: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'memory',
    BOT_TOKEN: TEST_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
    PAYMENTS_MODE: 'stars',
    DEV_AUTH: 'false',
    ADMIN_TELEGRAM_IDS: '777',
    ...env,
  });
  const database = await openDatabase('memory', '');
  await database.migrate();
  await seed(database.db, config);
  const bot = new FakeBot();
  const ctx: AppContext = await buildApp(config, database, { bot, logger: false });
  await ctx.app.ready();
  return { ...ctx, bot, database, close: async () => { await ctx.app.close(); await database.close(); } };
}

export function auth(user: Partial<TelegramUser> & { id: number }, token = TEST_BOT_TOKEN, authDate?: number, extra: Record<string, string> = {}) {
  return { authorization: `tma ${signInitData({ first_name: 'Тест', ...user }, token, authDate, extra)}` };
}

/** Слушает трек статьи подряд, пока сервер не отметит его дослушанным. */
export async function listenToEnd(t: Awaited<ReturnType<typeof setup>>, headers: Record<string, string>, trackKey: string) {
  const pl = json(await t.app.inject({ method: 'GET', url: '/api/constitution/playlist' }));
  const track = pl.tracks.find((x: { key: string }) => x.key === trackKey);
  let res: { completed: boolean; justCompleted: boolean } = { completed: false, justCompleted: false };
  for (let ms = 0; ms <= track.durationMs && !res.completed; ms += 60_000) {
    res = json(await t.app.inject({ method: 'PUT', url: '/api/progress/constitution', headers, payload: { trackKey, positionMs: Math.min(ms + 60_000, track.durationMs), listenedDeltaMs: 60_000, event: 'tick' } }));
  }
  return res;
}

export const json = <T = any>(res: { body: string }) => JSON.parse(res.body) as T; // eslint-disable-line @typescript-eslint/no-explicit-any

// Точка входа сервера: конфигурация → БД (миграции, справочные данные) → HTTP → фоновые задачи.

import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from './app.ts';
import { loadConfig, ROOT_DIR } from './config.ts';
import { openDatabase } from './db/client.ts';
import { seed } from './db/seed.ts';
import { moscowHour } from './lib/time.ts';
import { processOutbox, queueContinueReminders, queueReviewReminders } from './notifications/outbox.ts';

/** Напоминания о недослушанной статье ставятся раз в день, в этот час по Москве. */
const CONTINUE_REMINDER_HOUR_MSK = 12;

const envFile = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const config = loadConfig();
const database = await openDatabase(config.DATABASE_URL, config.DATA_DIR);
if (config.AUTO_MIGRATE) await database.migrate();
const ctx = await buildApp(config, database);
if (config.AUTO_SEED) {
  const report = await seed(database.db, config);
  ctx.app.log.info({ report }, 'Справочные данные загружены');
  if (report.missingFiles) ctx.app.log.warn(`Аудио: отсутствуют файлы для ${report.missingFiles} треков — они помечены как недоступные`);
}

await ctx.app.listen({ host: config.HOST, port: config.PORT });
ctx.app.log.info(`«Право на слух» запущено: http://localhost:${config.PORT} (БД: ${database.kind}, оплата: ${config.PAYMENTS_MODE})`);

const timer = setInterval(() => {
  processOutbox(database.db, config, ctx.bot).catch((e) => ctx.app.log.error({ err: e }, 'Ошибка отправки уведомлений'));
}, 30_000);

// Раз в час — напоминания о повторении (по согласию пользователя, не чаще раза в сутки).
// Раз в день (в CONTINUE_REMINDER_HOUR_MSK) — о начатой, но не дослушанной статье (тоже по согласию).
const reminders = setInterval(() => {
  queueReviewReminders(database.db).catch((e) => ctx.app.log.error({ err: e }, 'Ошибка постановки напоминаний'));
  if (moscowHour() === CONTINUE_REMINDER_HOUR_MSK) {
    queueContinueReminders(database.db).catch((e) => ctx.app.log.error({ err: e }, 'Ошибка постановки напоминаний о статье'));
  }
}, 3600_000);

const shutdown = async () => {
  clearInterval(timer);
  clearInterval(reminders);
  await ctx.app.close();
  await database.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

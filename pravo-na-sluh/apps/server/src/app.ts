// Сборка HTTP-приложения (используется и при запуске, и в тестах).

import fs from 'node:fs';
import path from 'node:path';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { botTokenFor, type Config } from './config.ts';
import type { Database, DB } from './db/client.ts';
import { registerAuth } from './auth/plugin.ts';
import { registerErrorHandler } from './lib/errors.ts';
import { registerBillingRoutes } from './routes/billing.ts';
import { registerContentRoutes } from './routes/content.ts';
import { registerMeRoutes } from './routes/me.ts';
import { registerMemoryRoutes } from './routes/memory.ts';
import { registerSystemRoutes } from './routes/system.ts';
import { BotApi, DisabledBot, type BotClient } from './telegram/bot-api.ts';

export interface AppContext {
  app: FastifyInstance;
  db: DB;
  dbKind: Database['kind'];
  config: Config;
  bot: BotClient;
}

export async function buildApp(config: Config, database: Database, opts: { bot?: BotClient; logger?: boolean } = {}): Promise<AppContext> {
  const app = Fastify({
    logger: opts.logger ?? config.NODE_ENV !== 'test',
    trustProxy: true,
    bodyLimit: 256 * 1024,
  });
  const bot = opts.bot ?? (config.BOT_TOKEN ? new BotApi(config.BOT_TOKEN) : new DisabledBot());
  const ctx: AppContext = { app, db: database.db, dbKind: database.kind, config, bot };

  registerErrorHandler(app);
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
    // Ключ — пользователь (по подписи initData), иначе IP.
    keyGenerator: (req) => (req.headers.authorization ? `a:${req.headers.authorization.slice(-64)}` : `ip:${req.ip}`),
    allowList: (req) => req.url.startsWith('/media/') || !req.url.startsWith('/api/'),
  });

  // Безопасные заголовки. X-Frame-Options не ставится: Mini App открывается во фрейме Telegram Web.
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  if (!botTokenFor(config)) app.log.warn('BOT_TOKEN не задан: авторизация Mini App недоступна');
  registerAuth(app, database.db, config);
  registerSystemRoutes(ctx);
  registerMeRoutes(ctx);
  registerContentRoutes(ctx);
  registerMemoryRoutes(ctx);
  registerBillingRoutes(ctx);

  // Аудиофайлы: поддержка Range-запросов (перемотка), кеширование по ETag.
  if (fs.existsSync(config.AUDIO_DIR)) {
    await app.register(fastifyStatic, {
      root: config.AUDIO_DIR,
      prefix: '/media/audio/',
      decorateReply: false,
      acceptRanges: true,
      cacheControl: true,
      maxAge: '1d',
      allowedPath: (p) => p.endsWith('.mp3'),
    });
  }

  // Собранный Mini App + SPA-маршруты.
  const index = path.join(config.WEB_DIST, 'index.html');
  if (fs.existsSync(index)) {
    // index.html не кешируется (иначе после обновления открывается старая версия), файлы сборки с хешем в имени — навсегда.
    await app.register(fastifyStatic, {
      root: config.WEB_DIST, prefix: '/', wildcard: false, cacheControl: false,
      setHeaders: (res, file) => {
        res.setHeader('Cache-Control', file.endsWith('.html') ? 'no-cache' : /[\\/]assets[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      },
    });
    app.get('/*', async (req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/media/')) return reply.status(404).send({ error: { code: 'not_found', message: 'Не найдено' } });
      // Читается при каждом запросе: после пересборки без перезапуска сервера отдаётся новая версия.
      return reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache').send(await fs.promises.readFile(index, 'utf8'));
    });
  }
  return ctx;
}

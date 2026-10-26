// Служебные маршруты: конфигурация, здоровье, аналитика, обратная связь, вход для разработки,
// webhook Telegram и метрики для администратора.

import { timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PublicConfig } from '@pravo/shared';
import { ANALYTICS_EVENTS } from '@pravo/shared';
import { and, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DEV_USER_ID_BASE, requireAdmin } from '../auth/plugin.ts';
import { signInitData } from '../auth/telegram.ts';
import type { AppContext } from '../app.ts';
import { botTokenFor } from '../config.ts';
import {
  analyticsEvents, audioRequests, dailyActivity, feedback, legalDocuments, payments, quizAttempts, trackProgress, users, votes,
} from '../db/schema.ts';
import { AppError } from '../lib/errors.ts';
import { handleUpdate, type TelegramUpdate } from '../telegram/webhook.ts';

export function registerSystemRoutes(ctx: AppContext) {
  const { app, db, config } = ctx;

  app.get('/api/health', async () => {
    await db.execute(sql`select 1`);
    return { ok: true, db: ctx.dbKind, time: new Date().toISOString() };
  });

  app.get('/api/config', async (): Promise<PublicConfig> => ({
    env: config.NODE_ENV,
    botUsername: config.BOT_USERNAME ?? null,
    paymentsMode: config.PAYMENTS_MODE,
    devAuth: config.DEV_AUTH && config.NODE_ENV !== 'production',
    supportContact: config.SUPPORT_CONTACT,
    termsVersion: config.TERMS_VERSION,
  }));

  // ── Юридические документы приложения (Markdown из docs/legal).
  const LEGAL: Record<string, string> = {
    terms: 'Пользовательское соглашение', privacy: 'Политика обработки персональных данных', consent: 'Согласие на обработку персональных данных',
    subscription: 'Условия подписки и оплаты', notifications: 'Правила уведомлений', support: 'Порядок обращения в поддержку', disclaimer: 'Ограничения информационного сервиса',
  };
  app.get('/api/legal/:doc', async (req) => {
    const { doc } = z.object({ doc: z.enum(Object.keys(LEGAL) as [string, ...string[]]) }).parse(req.params);
    const file = path.join(config.LEGAL_DIR, `${doc}.md`);
    if (!fs.existsSync(file)) throw new AppError(404, 'not_found', 'Документ не найден');
    return { id: doc, title: LEGAL[doc], markdown: fs.readFileSync(file, 'utf8') };
  });

  // ── Вход без Telegram (только разработка): выдаёт подписанные тестовые initData.
  app.post('/api/dev/init-data', async (req) => {
    if (!config.DEV_AUTH || config.NODE_ENV === 'production') throw new AppError(404, 'not_found', 'Маршрут не найден');
    const body = z.object({
      slot: z.number().int().min(1).max(50).default(1),
      firstName: z.string().max(40).default('Тестовый пользователь'),
      /** Как startapp в ссылке Mini App (например, ref_<код>) — для проверки приглашений. */
      startParam: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
    }).parse(req.body ?? {});
    const token = botTokenFor(config)!;
    const extra: Record<string, string> = body.startParam ? { start_param: body.startParam } : {};
    return { initData: signInitData({ id: DEV_USER_ID_BASE + body.slot, first_name: body.firstName, username: `dev_user_${body.slot}`, language_code: 'ru' }, token, undefined, extra) };
  });

  // ── Продуктовая аналитика: только события из белого списка, без содержимого ответов и персональных данных.
  app.post('/api/analytics', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const body = z.object({
      events: z.array(z.object({
        name: z.enum(ANALYTICS_EVENTS as unknown as [string, ...string[]]),
        props: z.record(z.union([z.string().max(100), z.number(), z.boolean(), z.null()])).optional(),
      })).max(50),
    }).parse(req.body);
    if (req.user?.analyticsOptOut) return { stored: 0, reason: 'opt_out' };
    const rows = body.events.map((e) => ({ userId: req.user?.id ?? null, name: e.name, props: Object.fromEntries(Object.entries(e.props ?? {}).slice(0, 12)) }));
    if (rows.length) await db.insert(analyticsEvents).values(rows);
    return { stored: rows.length };
  });

  app.post('/api/feedback', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const body = z.object({
      kind: z.enum(['bug', 'idea', 'audio_error', 'payment', 'other']),
      message: z.string().min(3).max(2000),
      context: z.record(z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional(),
    }).parse(req.body);
    await db.insert(feedback).values({ userId: req.user?.id ?? null, kind: body.kind, message: body.message, context: body.context ?? null });
    return { ok: true };
  });

  // ── Webhook Telegram: проверяется секрет из заголовка X-Telegram-Bot-Api-Secret-Token.
  app.post('/telegram/webhook', { config: { rateLimit: false } }, async (req, reply) => {
    const secret = config.TELEGRAM_WEBHOOK_SECRET;
    const given = String(req.headers['x-telegram-bot-api-secret-token'] ?? '');
    if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
      return reply.status(401).send({ ok: false });
    }
    const update = req.body as TelegramUpdate;
    if (!update || typeof update.update_id !== 'number') return reply.status(400).send({ ok: false });
    try {
      const result = await handleUpdate({ db, config, bot: ctx.bot }, update, req.log);
      return { ok: true, result };
    } catch {
      // 500 → Telegram повторит доставку; обработчики идемпотентны.
      return reply.status(500).send({ ok: false });
    }
  });

  // ── Метрики для администратора (агрегаты, без персональных данных).
  app.get('/api/admin/metrics', async (req) => {
    requireAdmin(req, config);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [u] = await db.select({ total: sql<number>`count(*)::int`, real: sql<number>`count(*) filter (where not ${users.isDevUser})::int`, new7: sql<number>`count(*) filter (where ${users.createdAt} > now() - interval '7 days')::int` }).from(users);
    const funnelNames = ['app_open', 'onboarding_complete', 'listen_start', 'article_complete', 'quiz_start', 'quiz_finish', 'paywall_view', 'purchase_start', 'purchase_complete', 'playback_error'];
    const funnelRows = await db.select({ name: analyticsEvents.name, users: sql<number>`count(distinct ${analyticsEvents.userId})::int`, events: sql<number>`count(*)::int` })
      .from(analyticsEvents).where(gte(analyticsEvents.createdAt, since)).groupBy(analyticsEvents.name);
    const funnel = funnelNames.map((n) => ({ name: n, users: funnelRows.find((r) => r.name === n)?.users ?? 0, events: funnelRows.find((r) => r.name === n)?.events ?? 0 }));

    // Удержание: доля пользователей, активных на следующий день / на 7-й день после регистрации.
    const retention = await db.execute(sql`
      with u as (select id, (created_at at time zone 'Europe/Moscow')::date as d0 from users where not is_dev_user),
      a as (select user_id, day from daily_activity where listened_ms >= 30000 or reviews > 0 or quiz_answers > 0)
      select
        count(*) filter (where u.d0 <= current_date - 1)::int as eligible_d1,
        count(*) filter (where u.d0 <= current_date - 1 and exists (select 1 from a where a.user_id = u.id and a.day = u.d0 + 1))::int as retained_d1,
        count(*) filter (where u.d0 <= current_date - 7)::int as eligible_d7,
        count(*) filter (where u.d0 <= current_date - 7 and exists (select 1 from a where a.user_id = u.id and a.day = u.d0 + 7))::int as retained_d7,
        count(*) filter (where (select count(distinct day) from daily_activity d where d.user_id = u.id and (d.reviews > 0 or d.quiz_answers > 0)) >= 2)::int as returned_to_learning,
        count(*) filter (where exists (select 1 from track_progress t where t.user_id = u.id and t.completed_at is not null))::int as activated
      from u`);
    const r = (retention as unknown as { rows: Record<string, number>[] }).rows?.[0] ?? (retention as unknown as Record<string, number>[])[0];
    const [articles] = await db.select({ n: sql<number>`count(*)::int` }).from(trackProgress).where(isNotNull(trackProgress.completedAt));
    const [paid] = await db.select({ users: sql<number>`count(distinct ${payments.userId})::int`, stars: sql<number>`coalesce(sum(${payments.amount}), 0)::int` }).from(payments).where(and(eq(payments.status, 'paid'), eq(payments.isTest, false)));
    const [qz] = await db.select({ started: sql<number>`count(*)::int`, finished: sql<number>`count(${quizAttempts.finishedAt})::int` }).from(quizAttempts);
    const topVotes = await db.select({ id: votes.documentId, title: legalDocuments.shortTitle, n: sql<number>`count(*)::int` }).from(votes)
      .innerJoin(legalDocuments, eq(legalDocuments.id, votes.documentId)).groupBy(votes.documentId, legalDocuments.shortTitle).orderBy(sql`count(*) desc`).limit(10);
    const topRequests = await db.select({ id: audioRequests.documentId, n: sql<number>`count(*)::int` }).from(audioRequests).groupBy(audioRequests.documentId).orderBy(sql`count(*) desc`).limit(10);
    const listenStarts = funnel.find((f) => f.name === 'listen_start')!.events;
    const errors = funnel.find((f) => f.name === 'playback_error')!.events;
    const real = u?.real ?? 0;
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
    const [days] = await db.select({ n: sql<number>`count(*)::int` }).from(dailyActivity);
    return {
      note: 'Значения рассчитаны по фактическим событиям. До запуска с реальными пользователями показатели нулевые или отражают тестовые сессии.',
      users: { total: u?.total ?? 0, real, new7d: u?.new7 ?? 0 },
      activation: { activatedUsers: r?.activated ?? 0, rate: pct(r?.activated ?? 0, real), definition: 'дослушал хотя бы одну статью (≥80% трека)' },
      retention: {
        d1: pct(r?.retained_d1 ?? 0, r?.eligible_d1 ?? 0), d7: pct(r?.retained_d7 ?? 0, r?.eligible_d7 ?? 0),
        returnedToLearning: pct(r?.returned_to_learning ?? 0, real), definition: 'активность: ≥30 с прослушивания, ответ на карточку или вопрос теста',
      },
      learning: { articlesCompletedAvg: real ? Math.round(((articles?.n ?? 0) / real) * 10) / 10 : null, quizCompletionRate: pct(qz?.finished ?? 0, qz?.started ?? 0), activityDays: days?.n ?? 0 },
      monetization: { payingUsers: paid?.users ?? 0, conversion: pct(paid?.users ?? 0, real), revenueStars: paid?.stars ?? 0 },
      playback: { listenStarts, errors, errorRate: pct(errors, listenStarts) },
      funnel30d: funnel,
      demand: { topVotes, topAudioRequests: topRequests },
    };
  });
}

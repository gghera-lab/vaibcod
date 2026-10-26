// Профиль, настройки, приватность (выгрузка и удаление данных), статистика, приглашения друзей.

import type { MeDto, SettingsDto } from '@pravo/shared';
import { eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { isAdmin, requireUser } from '../auth/plugin.ts';
import type { AppContext } from '../app.ts';
import {
  analyticsEvents, audioRequests, bookmarks, dailyActivity, favorites, feedback, listeningProgress, payments, quizAttempts, referrals, reviewLogs, reviewStates,
  subscriptions, trackProgress, users, userSettings, votes,
} from '../db/schema.ts';
import { audit } from '../lib/audit.ts';
import { badRequest } from '../lib/errors.ts';
import { getEntitlement } from '../services/entitlements.ts';
import { getReferralInfo, parseReferralParam, registerReferral } from '../services/referrals.ts';
import { getStats } from '../services/stats.ts';

async function loadSettings(ctx: AppContext, userId: number): Promise<SettingsDto> {
  let [s] = await ctx.db.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (!s) [s] = await ctx.db.insert(userSettings).values({ userId }).onConflictDoNothing().returning();
  return {
    voiceId: s.voiceId, playbackRate: s.playbackRate, chapterChime: s.chapterChime, autoAdvance: s.autoAdvance,
    notifyReviews: s.notifyReviews, notifyAudioReleases: s.notifyAudioReleases, notifyContinue: s.notifyContinue, theme: s.theme as SettingsDto['theme'], dailyGoalMin: s.dailyGoalMin,
  };
}

export async function meDto(ctx: AppContext, userId: number): Promise<MeDto> {
  const [u] = await ctx.db.select().from(users).where(eq(users.id, userId));
  return {
    user: {
      id: u.id, firstName: u.firstName, username: u.username, isDevUser: u.isDevUser, onboarded: !!u.onboardedAt,
      termsAccepted: u.termsVersion === ctx.config.TERMS_VERSION, analyticsOptOut: u.analyticsOptOut, createdAt: u.createdAt.toISOString(),
    },
    settings: await loadSettings(ctx, userId),
    entitlement: await getEntitlement(ctx.db, userId),
    isAdmin: isAdmin(ctx.config, u),
  };
}

const SettingsPatch = z.object({
  voiceId: z.string().max(64).nullable().optional(),
  playbackRate: z.number().min(0.5).max(2.5).optional(),
  chapterChime: z.boolean().optional(),
  autoAdvance: z.boolean().optional(),
  notifyReviews: z.boolean().optional(),
  notifyAudioReleases: z.boolean().optional(),
  notifyContinue: z.boolean().optional(),
  theme: z.enum(['auto', 'light', 'dark']).optional(),
  dailyGoalMin: z.number().int().min(5).max(120).optional(),
}).strict();

export function registerMeRoutes(ctx: AppContext) {
  const { app, db, config } = ctx;

  app.get('/api/me', async (req) => {
    const user = requireUser(req);
    // Mini App открыт по ссылке-приглашению (startapp=ref_<код>): запоминаем пригласившего.
    const code = parseReferralParam(req.startParam);
    if (code) await registerReferral(db, user, code, 'mini_app');
    return meDto(ctx, user.id);
  });

  app.get('/api/me/referrals', async (req) => getReferralInfo(db, config, requireUser(req).id));

  app.post('/api/me/onboarding', async (req) => {
    const user = requireUser(req);
    const body = z.object({ acceptTerms: z.literal(true), termsVersion: z.string() }).parse(req.body);
    if (body.termsVersion !== config.TERMS_VERSION) throw badRequest('Версия условий устарела — обновите приложение');
    await db.update(users).set({ onboardedAt: new Date(), termsVersion: config.TERMS_VERSION, termsAcceptedAt: new Date() }).where(eq(users.id, user.id));
    await audit(db, `user:${user.id}`, 'terms_accepted', 'user', user.id, { version: config.TERMS_VERSION });
    return meDto(ctx, user.id);
  });

  app.patch('/api/me/settings', async (req) => {
    const user = requireUser(req);
    const patch = SettingsPatch.parse(req.body);
    await loadSettings(ctx, user.id);
    await db.update(userSettings).set({ ...patch, updatedAt: new Date() }).where(eq(userSettings.userId, user.id));
    return loadSettings(ctx, user.id);
  });

  app.patch('/api/me/privacy', async (req) => {
    const user = requireUser(req);
    const body = z.object({ analyticsOptOut: z.boolean() }).parse(req.body);
    await db.update(users).set({ analyticsOptOut: body.analyticsOptOut }).where(eq(users.id, user.id));
    if (body.analyticsOptOut) await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, user.id));
    return meDto(ctx, user.id);
  });

  app.get('/api/me/stats', async (req) => {
    const user = requireUser(req);
    const ent = await getEntitlement(db, user.id);
    return getStats(db, user.id, ent.pro);
  });

  /** Выгрузка персональных данных пользователя (право субъекта на доступ к своим данным). */
  app.get('/api/me/export', async (req, reply) => {
    const user = requireUser(req);
    const [u] = await db.select().from(users).where(eq(users.id, user.id));
    const data = {
      exportedAt: new Date().toISOString(),
      user: { ...u, telegramId: String(u.telegramId) },
      settings: await loadSettings(ctx, user.id),
      listening: await db.select().from(trackProgress).where(eq(trackProgress.userId, user.id)),
      activity: await db.select().from(dailyActivity).where(eq(dailyActivity.userId, user.id)),
      favorites: await db.select().from(favorites).where(eq(favorites.userId, user.id)),
      bookmarks: await db.select().from(bookmarks).where(eq(bookmarks.userId, user.id)),
      reviews: await db.select().from(reviewLogs).where(eq(reviewLogs.userId, user.id)),
      quizzes: await db.select().from(quizAttempts).where(eq(quizAttempts.userId, user.id)),
      subscriptions: await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)),
      payments: await db.select().from(payments).where(eq(payments.userId, user.id)),
      audioRequests: await db.select().from(audioRequests).where(eq(audioRequests.userId, user.id)),
      votes: await db.select().from(votes).where(eq(votes.userId, user.id)),
      referrals: await db.select().from(referrals).where(or(eq(referrals.inviterId, user.id), eq(referrals.inviteeId, user.id))),
    };
    reply.header('Content-Disposition', 'attachment; filename="pravo-na-sluh-my-data.json"');
    return data;
  });

  /**
   * Удаление аккаунта: стираются профиль и все связанные данные (каскадно).
   * Платёжные записи обезличиваются в журнале аудита (сумма/дата без привязки к пользователю) —
   * срок хранения для бухгалтерии уточнить у юриста (см. docs/legal/legal-questions.md).
   */
  app.delete('/api/me', async (req) => {
    const user = requireUser(req);
    z.object({ confirm: z.literal('УДАЛИТЬ') }).parse(req.body);
    const paid = await db.select().from(payments).where(eq(payments.userId, user.id));
    if (paid.length) await audit(db, 'system', 'payments_anonymized_on_account_delete', 'payment', null, paid.map((p) => ({ id: p.id, productId: p.productId, amount: p.amount, currency: p.currency, status: p.status, paidAt: p.paidAt })));
    await db.delete(listeningProgress).where(eq(listeningProgress.userId, user.id));
    await db.delete(reviewStates).where(eq(reviewStates.userId, user.id));
    await db.delete(feedback).where(eq(feedback.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
    await audit(db, 'system', 'account_deleted', 'user', user.id);
    return { deleted: true };
  });
}

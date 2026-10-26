// Реферальная программа: ссылка t.me/<бот>?startapp=ref_<код> (или /start ref_<код> в боте) → запись приглашения →
// по 7 дней Pro пригласившему и приглашённому, но только когда приглашённый дослушает первую статью.
// Защита от накруток: приглашать можно только новых пользователей, себя пригласить нельзя,
// у пригласившего не больше REFERRAL_MAX_REWARDS бонусов, начисление идемпотентно.

import { randomBytes } from 'node:crypto';
import type { ReferralDto } from '@pravo/shared';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { UserRow } from '../auth/plugin.ts';
import { grantAccess } from '../billing/service.ts';
import type { Config } from '../config.ts';
import type { DB } from '../db/client.ts';
import { documentArticles, notifications, products, referrals, trackProgress, users } from '../db/schema.ts';
import { audit } from '../lib/audit.ts';

export const REFERRAL_BONUS_DAYS = 7;
/** Служебный тариф бонусного доступа: не продаётся (active=false), нужен для subscriptions.product_id. */
export const REFERRAL_PRODUCT_ID = 'pro_referral';
/** Приглашённым считается только тот, кто зарегистрировался не раньше чем сутки назад. */
const NEW_USER_WINDOW_MS = 24 * 3600_000;

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 8;

export type ReferralChannel = 'mini_app' | 'bot';
export type RegisterResult = 'registered' | 'unknown_code' | 'self' | 'already' | 'not_new' | 'mutual';

/** Код из start_param или аргумента /start: «ref_<код>». Остальные метки (рекламные) игнорируются. */
export function parseReferralParam(param: string | null | undefined): string | null {
  const m = /^ref_([a-z0-9]{4,32})$/i.exec(param?.trim() ?? '');
  return m ? m[1].toLowerCase() : null;
}

function randomCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** Возвращает код приглашения пользователя, при первом обращении создаёт его. */
export async function ensureReferralCode(db: DB, userId: number): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [u] = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId)).limit(1);
    if (u?.code) return u.code;
    try {
      const [updated] = await db.update(users).set({ referralCode: randomCode() }).where(and(eq(users.id, userId), isNull(users.referralCode))).returning({ code: users.referralCode });
      if (updated?.code) return updated.code;
    } catch (e) {
      // Совпадение с чужим кодом (users_referral_code_uq) — пробуем другой.
      const msg = `${(e as Error).message} ${String((e as { cause?: Error }).cause?.message ?? '')}`;
      if (!msg.includes('users_referral_code_uq')) throw e;
    }
  }
  throw new Error('Не удалось создать код приглашения');
}

/** Записывает приглашение. Повторные вызовы безопасны: у приглашённого может быть только один пригласивший. */
export async function registerReferral(db: DB, invitee: UserRow, code: string, channel: ReferralChannel, now = new Date()): Promise<RegisterResult> {
  const [inviter] = await db.select().from(users).where(eq(users.referralCode, code.toLowerCase())).limit(1);
  if (!inviter) return 'unknown_code';
  if (inviter.id === invitee.id) return 'self';
  const [existing] = await db.select({ id: referrals.id }).from(referrals).where(eq(referrals.inviteeId, invitee.id)).limit(1);
  if (existing) return 'already';
  // Уже знакомые с приложением пользователи не считаются приглашёнными: аккаунт старше суток или статья уже дослушана.
  if (now.getTime() - invitee.createdAt.getTime() > NEW_USER_WINDOW_MS) return 'not_new';
  const [listened] = await db.select({ key: trackProgress.trackKey }).from(trackProgress)
    .innerJoin(documentArticles, and(eq(documentArticles.editionId, trackProgress.editionId), eq(documentArticles.articleKey, trackProgress.trackKey)))
    .where(and(eq(trackProgress.userId, invitee.id), isNotNull(trackProgress.completedAt))).limit(1);
  if (listened) return 'not_new';
  // Взаимное приглашение (А пригласил Б, Б приглашает А) не засчитывается.
  const [mutual] = await db.select({ id: referrals.id }).from(referrals).where(and(eq(referrals.inviterId, invitee.id), eq(referrals.inviteeId, inviter.id))).limit(1);
  if (mutual) return 'mutual';

  const [row] = await db.insert(referrals).values({ inviterId: inviter.id, inviteeId: invitee.id, channel, createdAt: now }).onConflictDoNothing().returning();
  if (!row) return 'already';
  await audit(db, `user:${invitee.id}`, 'referral_registered', 'referral', row.id, { inviterId: inviter.id, channel });
  return 'registered';
}

/**
 * Приглашённый дослушал статью: начисляет бонусы ровно один раз
 * (приглашённому — всегда, пригласившему — пока не исчерпан лимит). Возвращает null, если начислять нечего.
 */
export async function qualifyReferral(db: DB, config: Config, inviteeId: number, now = new Date()) {
  const [ref] = await db.update(referrals).set({ qualifiedAt: now })
    .where(and(eq(referrals.inviteeId, inviteeId), isNull(referrals.qualifiedAt))).returning();
  if (!ref) return null;
  const [product] = await db.select().from(products).where(eq(products.id, REFERRAL_PRODUCT_ID)).limit(1);
  if (!product) throw new Error(`Не найден служебный тариф ${REFERRAL_PRODUCT_ID} (выполните seed)`);

  await grantAccess(db, inviteeId, product, now, null, `referral_${ref.id}_invitee`, 'referral');
  await db.insert(notifications).values({ userId: inviteeId, kind: 'referral_bonus', payload: { role: 'invitee', days: product.periodDays } });

  // Лимит проверяется в том же запросе, что и отметка о начислении.
  const [inviterRow] = await db.update(referrals).set({ inviterRewarded: true })
    .where(and(eq(referrals.id, ref.id), sql`(select count(*) from ${referrals} r where r.inviter_id = ${ref.inviterId} and r.inviter_rewarded) < ${config.REFERRAL_MAX_REWARDS}`))
    .returning({ id: referrals.id });
  const inviterRewarded = !!inviterRow;
  if (inviterRewarded) {
    await grantAccess(db, ref.inviterId, product, now, null, `referral_${ref.id}_inviter`, 'referral');
    await db.insert(notifications).values({ userId: ref.inviterId, kind: 'referral_bonus', payload: { role: 'inviter', days: product.periodDays } });
  }
  await audit(db, 'system', 'referral_rewarded', 'referral', ref.id, { inviterId: ref.inviterId, inviteeId, inviterRewarded });
  return { referralId: ref.id, inviterRewarded };
}

export async function getReferralInfo(db: DB, config: Config, userId: number): Promise<ReferralDto> {
  const code = await ensureReferralCode(db, userId);
  const [c] = await db.select({
    invited: sql<number>`count(*)::int`,
    qualified: sql<number>`count(${referrals.qualifiedAt})::int`,
    rewarded: sql<number>`count(*) filter (where ${referrals.inviterRewarded})::int`,
  }).from(referrals).where(eq(referrals.inviterId, userId));
  return {
    link: config.BOT_USERNAME ? `https://t.me/${config.BOT_USERNAME.replace(/^@/, '')}?startapp=ref_${code}` : null,
    code,
    bonusDays: REFERRAL_BONUS_DAYS,
    invited: c?.invited ?? 0,
    qualified: c?.qualified ?? 0,
    rewarded: c?.rewarded ?? 0,
    maxRewards: config.REFERRAL_MAX_REWARDS,
  };
}

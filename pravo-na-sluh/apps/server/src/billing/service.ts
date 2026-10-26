// Оплата цифрового доступа через Telegram Stars (XTR) и тестовая «песочница».
// Доступ выдаётся ТОЛЬКО после successful_payment (или тестового подтверждения в sandbox),
// с защитой от повторной обработки: уникальный telegram_payment_charge_id и журнал событий.
// Правила Telegram: https://core.telegram.org/bots/payments-stars

import { randomBytes } from 'node:crypto';
import type { InvoiceDto } from '@pravo/shared';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import type { Config } from '../config.ts';
import type { DB } from '../db/client.ts';
import { notifications, payments, products, subscriptions, users } from '../db/schema.ts';
import { audit } from '../lib/audit.ts';
import { AppError, badRequest, notFound } from '../lib/errors.ts';
import { DisabledBot, type BotClient } from '../telegram/bot-api.ts';

export const SUBSCRIPTION_PERIOD_SEC = 2_592_000; // 30 дней — единственное допустимое значение для подписок Stars
const DAY = 86_400_000;

export interface BillingDeps {
  db: DB;
  config: Config;
  bot: BotClient;
}

export interface PreCheckoutQuery {
  id: string;
  from: { id: number };
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

export interface SuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id?: string;
  subscription_expiration_date?: number;
  is_recurring?: boolean;
  is_first_recurring?: boolean;
}

export interface RefundedPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
}

export async function createInvoice(deps: BillingDeps, userId: number, productId: string): Promise<InvoiceDto> {
  const { db, config, bot } = deps;
  if (config.PAYMENTS_MODE === 'disabled') throw new AppError(409, 'payments_disabled', 'Оплата пока не подключена. Требуется настройка платежей (см. документацию).');
  const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.active, true))).limit(1);
  if (!product) throw notFound('Тариф');
  const isTest = config.PAYMENTS_MODE === 'sandbox';
  const payload = `p:${randomBytes(12).toString('hex')}`;
  const [payment] = await db.insert(payments).values({
    userId, productId, payload, status: 'created', amount: product.priceStars, currency: 'XTR', isTest,
  }).returning();
  await audit(db, `user:${userId}`, 'invoice_created', 'payment', payment.id, { productId, mode: config.PAYMENTS_MODE });

  if (isTest) return { mode: 'sandbox', paymentId: payment.id, amount: product.priceStars, productTitle: product.title };

  if (!bot.enabled) throw new AppError(503, 'bot_not_configured', 'Требуется подключение Telegram-бота (BOT_TOKEN)');
  const invoiceUrl = await bot.call<string>('createInvoiceLink', {
    title: product.title.slice(0, 32),
    description: product.description.slice(0, 255),
    payload,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: product.title.slice(0, 32), amount: product.priceStars }],
    ...(product.recurring ? { subscription_period: SUBSCRIPTION_PERIOD_SEC } : {}),
  });
  return { mode: 'stars', paymentId: payment.id, invoiceUrl };
}

/** Ответ на pre_checkout_query — обязательно в течение 10 секунд. */
export async function handlePreCheckout(deps: BillingDeps, q: PreCheckoutQuery): Promise<{ ok: boolean; reason?: string }> {
  const { db, bot } = deps;
  const reject = async (reason: string) => {
    await bot.call('answerPreCheckoutQuery', { pre_checkout_query_id: q.id, ok: false, error_message: reason });
    return { ok: false, reason };
  };
  const [p] = await db.select({ payment: payments, telegramId: users.telegramId, active: products.active, price: products.priceStars })
    .from(payments).innerJoin(users, eq(users.id, payments.userId)).innerJoin(products, eq(products.id, payments.productId))
    .where(eq(payments.payload, q.invoice_payload)).orderBy(payments.id).limit(1);
  if (!p) return reject('Счёт не найден. Откройте оплату заново из приложения.');
  if (p.telegramId !== q.from.id) return reject('Счёт выставлен другому пользователю.');
  if (!p.active) return reject('Этот тариф больше недоступен.');
  if (q.currency !== 'XTR' || q.total_amount !== p.payment.amount) return reject('Сумма счёта изменилась. Откройте оплату заново.');
  if (!['created', 'pre_checkout', 'paid'].includes(p.payment.status)) return reject('Счёт уже недействителен.');
  if (p.payment.status === 'created') await db.update(payments).set({ status: 'pre_checkout' }).where(eq(payments.id, p.payment.id));
  await bot.call('answerPreCheckoutQuery', { pre_checkout_query_id: q.id, ok: true });
  return { ok: true };
}

/** successful_payment: идемпотентно отмечает оплату и выдаёт/продлевает доступ. */
export async function handleSuccessfulPayment(deps: BillingDeps, fromTelegramId: number, sp: SuccessfulPayment): Promise<'granted' | 'duplicate' | 'unknown_payload'> {
  const { db } = deps;
  const [dup] = await db.select({ id: payments.id }).from(payments).where(eq(payments.telegramChargeId, sp.telegram_payment_charge_id)).limit(1);
  if (dup) return 'duplicate';

  const [base] = await db.select().from(payments).where(eq(payments.payload, sp.invoice_payload)).orderBy(payments.id).limit(1);
  if (!base) {
    await audit(db, 'telegram', 'payment_unknown_payload', 'payment', null, sp);
    return 'unknown_payload';
  }
  const [owner] = await db.select().from(users).where(eq(users.id, base.userId)).limit(1);
  if (!owner || owner.telegramId !== fromTelegramId) {
    await audit(db, 'telegram', 'payment_user_mismatch', 'payment', base.id, { fromTelegramId });
    return 'unknown_payload';
  }
  const [product] = await db.select().from(products).where(eq(products.id, base.productId)).limit(1);
  const now = new Date();
  const expiresAt = sp.subscription_expiration_date ? new Date(sp.subscription_expiration_date * 1000) : null;
  const paymentFields = {
    status: 'paid',
    amount: sp.total_amount,
    currency: sp.currency,
    telegramChargeId: sp.telegram_payment_charge_id,
    providerChargeId: sp.provider_payment_charge_id ?? null,
    isRecurring: !!sp.is_recurring,
    isFirstRecurring: !!sp.is_first_recurring,
    subscriptionExpiresAt: expiresAt,
    paidAt: now,
  };

  let paymentId: number;
  try {
    if (base.status !== 'paid') {
      const [updated] = await db.update(payments).set(paymentFields).where(and(eq(payments.id, base.id), inArray(payments.status, ['created', 'pre_checkout', 'failed']))).returning();
      if (updated) paymentId = updated.id;
      else {
        // Кто-то уже отметил базовый платёж — это продление (renewal) той же подписки.
        const [ins] = await db.insert(payments).values({ ...paymentFields, userId: base.userId, productId: base.productId, payload: base.payload, isTest: base.isTest }).returning();
        paymentId = ins.id;
      }
    } else {
      const [ins] = await db.insert(payments).values({ ...paymentFields, userId: base.userId, productId: base.productId, payload: base.payload, isTest: base.isTest }).returning();
      paymentId = ins.id;
    }
  } catch (e) {
    // Нарушение уникальности telegram_charge_id при параллельной доставке — это дубликат.
    if (String((e as Error).message).includes('payments_charge_uq') || String((e as { cause?: Error }).cause?.message ?? '').includes('payments_charge_uq')) return 'duplicate';
    throw e;
  }

  await grantAccess(db, base.userId, product, now, expiresAt, sp.telegram_payment_charge_id, base.isTest ? 'sandbox' : 'stars');
  await audit(db, 'telegram', 'payment_paid', 'payment', paymentId, { productId: product.id, amount: sp.total_amount, recurring: sp.is_recurring ?? false });
  await db.insert(notifications).values({ userId: base.userId, kind: 'payment_success', payload: { productTitle: product.title, test: base.isTest } });
  return 'granted';
}

/** Выдаёт или продлевает доступ по тарифу (также используется для бонусов реферальной программы). */
export async function grantAccess(db: DB, userId: number, product: typeof products.$inferSelect, now: Date, expiresAt: Date | null, chargeId: string, source: string) {
  if (product.recurring) {
    const [sub] = await db.select().from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.productId, product.id), eq(subscriptions.source, source)))
      .orderBy(desc(subscriptions.id)).limit(1);
    const base = sub && sub.currentPeriodEnd > now && sub.status !== 'refunded' ? sub.currentPeriodEnd : now;
    const end = expiresAt ?? new Date(base.getTime() + product.periodDays * DAY);
    if (sub && sub.status !== 'refunded') {
      await db.update(subscriptions).set({ status: 'active', currentPeriodEnd: end, cancelAtPeriodEnd: false, telegramChargeId: chargeId, updatedAt: now }).where(eq(subscriptions.id, sub.id));
    } else {
      await db.insert(subscriptions).values({ userId, productId: product.id, status: 'active', source, startedAt: now, currentPeriodEnd: end, telegramChargeId: chargeId });
    }
    return;
  }
  // Разовая оплата периода: начинается после окончания уже оплаченного доступа.
  const [latest] = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, ['active', 'canceled']), gt(subscriptions.currentPeriodEnd, now)))
    .orderBy(desc(subscriptions.currentPeriodEnd)).limit(1);
  const start = latest ? latest.currentPeriodEnd : now;
  await db.insert(subscriptions).values({
    userId, productId: product.id, status: 'active', source, startedAt: now,
    currentPeriodEnd: new Date(start.getTime() + product.periodDays * DAY), telegramChargeId: chargeId,
  });
}

/** Возврат (refunded_payment от Telegram или ручной возврат администратором). Идемпотентно. */
export async function handleRefund(deps: BillingDeps, r: { telegram_payment_charge_id: string }, actor = 'telegram'): Promise<'refunded' | 'already' | 'not_found'> {
  const { db } = deps;
  const [p] = await db.select().from(payments).where(eq(payments.telegramChargeId, r.telegram_payment_charge_id)).limit(1);
  if (!p) return 'not_found';
  if (p.status === 'refunded') return 'already';
  const now = new Date();
  await db.update(payments).set({ status: 'refunded', refundedAt: now }).where(eq(payments.id, p.id));
  await db.update(subscriptions).set({ status: 'refunded', currentPeriodEnd: now, updatedAt: now })
    .where(and(eq(subscriptions.userId, p.userId), eq(subscriptions.telegramChargeId, r.telegram_payment_charge_id)));
  await audit(db, actor, 'payment_refunded', 'payment', p.id, r);
  await db.insert(notifications).values({ userId: p.userId, kind: 'payment_refunded', payload: { paymentId: p.id } });
  return 'refunded';
}

export async function refundPayment(deps: BillingDeps, paymentId: number, actor: string) {
  const { db, bot } = deps;
  const [p] = await db.select({ payment: payments, telegramId: users.telegramId }).from(payments).innerJoin(users, eq(users.id, payments.userId)).where(eq(payments.id, paymentId)).limit(1);
  if (!p || p.payment.status !== 'paid' || !p.payment.telegramChargeId) throw badRequest('Платёж не найден или не оплачен');
  if (!p.payment.isTest) {
    await bot.call('refundStarPayment', { user_id: p.telegramId, telegram_payment_charge_id: p.payment.telegramChargeId });
  }
  return handleRefund(deps, { telegram_payment_charge_id: p.payment.telegramChargeId }, actor);
}

/** Отмена автопродления: доступ сохраняется до конца оплаченного периода. */
export async function setAutoRenew(deps: BillingDeps, userId: number, enabled: boolean) {
  const { db, bot } = deps;
  const now = new Date();
  const active = await db.select({ sub: subscriptions, recurring: products.recurring, telegramId: users.telegramId })
    .from(subscriptions).innerJoin(products, eq(products.id, subscriptions.productId)).innerJoin(users, eq(users.id, subscriptions.userId))
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, ['active', 'canceled']), gt(subscriptions.currentPeriodEnd, now)))
    .orderBy(desc(subscriptions.currentPeriodEnd));
  if (!active.length) throw badRequest('Нет активной подписки');
  // После автопродляемой подписки могут идти разовые или бонусные дни — управляем именно подпиской.
  const sub = active.find((s) => s.recurring);
  if (!sub) throw badRequest('Этот тариф оплачен разово и не продлевается автоматически');
  if (sub.sub.source === 'stars') {
    if (!bot.enabled) throw new AppError(503, 'bot_not_configured', 'Требуется подключение Telegram-бота');
    await bot.call('editUserStarSubscription', { user_id: sub.telegramId, telegram_payment_charge_id: sub.sub.telegramChargeId, is_canceled: !enabled });
  }
  await db.update(subscriptions).set({ cancelAtPeriodEnd: !enabled, status: enabled ? 'active' : 'canceled', updatedAt: now }).where(eq(subscriptions.id, sub.sub.id));
  await audit(db, `user:${userId}`, enabled ? 'subscription_resumed' : 'subscription_canceled', 'subscription', sub.sub.id);
}

/** Тестовая оплата (только PAYMENTS_MODE=sandbox): проходит через те же обработчики, что и Telegram. */
export async function completeSandbox(deps: BillingDeps, userId: number, paymentId: number, outcome: 'paid' | 'failed' | 'cancelled') {
  const { db, config } = deps;
  if (config.PAYMENTS_MODE !== 'sandbox') throw new AppError(409, 'sandbox_disabled', 'Тестовая оплата отключена');
  const [p] = await db.select({ payment: payments, telegramId: users.telegramId }).from(payments).innerJoin(users, eq(users.id, payments.userId))
    .where(and(eq(payments.id, paymentId), eq(payments.userId, userId))).limit(1);
  if (!p) throw notFound('Платёж');
  if (!p.payment.isTest) throw badRequest('Это не тестовый платёж');
  if (outcome !== 'paid') {
    await db.update(payments).set({ status: outcome === 'failed' ? 'failed' : 'cancelled' }).where(and(eq(payments.id, paymentId), inArray(payments.status, ['created', 'pre_checkout'])));
    return { status: outcome };
  }
  // Ответ на pre-checkout в песочнице никуда не отправляется (это не запрос Telegram).
  const pre = await handlePreCheckout({ ...deps, bot: new DisabledBot() }, { id: `sandbox-${paymentId}`, from: { id: p.telegramId }, currency: 'XTR', total_amount: p.payment.amount, invoice_payload: p.payment.payload });
  if (!pre.ok) throw badRequest(pre.reason ?? 'Платёж отклонён');
  const product = (await db.select().from(products).where(eq(products.id, p.payment.productId)).limit(1))[0];
  const result = await handleSuccessfulPayment(deps, p.telegramId, {
    currency: 'XTR',
    total_amount: p.payment.amount,
    invoice_payload: p.payment.payload,
    telegram_payment_charge_id: `sandbox_${paymentId}_${randomBytes(4).toString('hex')}`,
    is_recurring: product.recurring,
    is_first_recurring: product.recurring,
  });
  return { status: result === 'granted' ? 'paid' : result };
}

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, json, setup, WEBHOOK_SECRET } from './helpers.ts';

const TG_ID = 5555;
let updateId = 1000;

describe('Оплата Telegram Stars', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  const h = auth({ id: TG_ID });
  const webhook = (update: Record<string, unknown>, secret = WEBHOOK_SECRET) =>
    t.app.inject({ method: 'POST', url: '/telegram/webhook', headers: { 'x-telegram-bot-api-secret-token': secret }, payload: { update_id: ++updateId, ...update } });
  const sub = async () => json(await t.app.inject({ method: 'GET', url: '/api/billing/subscription', headers: h }));

  beforeAll(async () => { t = await setup({ PAYMENTS_MODE: 'stars' }); }, 60_000);
  afterAll(async () => t.close());

  let payload = '';
  let paymentId = 0;

  it('создаёт счёт в XTR с периодом подписки 30 дней', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/billing/invoice', headers: h, payload: { productId: 'pro_month' } });
    expect(res.statusCode).toBe(200);
    const inv = json(res);
    expect(inv.mode).toBe('stars');
    paymentId = inv.paymentId;
    const call = t.bot.last('createInvoiceLink')!;
    expect(call.params.currency).toBe('XTR');
    expect(call.params.provider_token).toBe('');
    expect(call.params.subscription_period).toBe(2592000);
    expect((call.params.prices as { amount: number }[])[0].amount).toBe(199);
    payload = call.params.payload as string;
  });

  it('webhook без секрета отклоняется', async () => {
    const res = await webhook({ message: { message_id: 1, chat: { id: TG_ID, type: 'private' }, from: { id: TG_ID }, text: '/start' } }, 'wrong');
    expect(res.statusCode).toBe(401);
  });

  it('pre_checkout от другого пользователя отклоняется', async () => {
    await webhook({ pre_checkout_query: { id: 'q1', from: { id: 1 }, currency: 'XTR', total_amount: 199, invoice_payload: payload } });
    const ans = t.bot.last('answerPreCheckoutQuery')!;
    expect(ans.params.ok).toBe(false);
  });

  it('pre_checkout с изменённой суммой отклоняется', async () => {
    await webhook({ pre_checkout_query: { id: 'q2', from: { id: TG_ID }, currency: 'XTR', total_amount: 1, invoice_payload: payload } });
    expect(t.bot.last('answerPreCheckoutQuery')!.params.ok).toBe(false);
  });

  it('корректный pre_checkout подтверждается, но доступ ещё не выдаётся', async () => {
    await webhook({ pre_checkout_query: { id: 'q3', from: { id: TG_ID }, currency: 'XTR', total_amount: 199, invoice_payload: payload } });
    expect(t.bot.last('answerPreCheckoutQuery')!.params.ok).toBe(true);
    expect((await sub()).pro).toBe(false);
  });

  it('successful_payment выдаёт Pro', async () => {
    const exp = Math.floor(Date.now() / 1000) + 30 * 86400;
    const res = await webhook({ message: { message_id: 2, chat: { id: TG_ID, type: 'private' }, from: { id: TG_ID }, successful_payment: {
      currency: 'XTR', total_amount: 199, invoice_payload: payload, telegram_payment_charge_id: 'charge-1', provider_payment_charge_id: '',
      subscription_expiration_date: exp, is_recurring: true, is_first_recurring: true } } });
    expect(json(res).result).toBe('granted');
    const e = await sub();
    expect(e.pro).toBe(true);
    expect(e.productId).toBe('pro_month');
    const p = json(await t.app.inject({ method: 'GET', url: `/api/billing/payments/${paymentId}`, headers: h }));
    expect(p.status).toBe('paid');
  });

  it('повторная доставка того же обновления не обрабатывается дважды', async () => {
    const update = { update_id: 99999, message: { message_id: 3, chat: { id: TG_ID, type: 'private' }, from: { id: TG_ID }, successful_payment: {
      currency: 'XTR', total_amount: 199, invoice_payload: payload, telegram_payment_charge_id: 'charge-dup' } } };
    const first = await t.app.inject({ method: 'POST', url: '/telegram/webhook', headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }, payload: update });
    const second = await t.app.inject({ method: 'POST', url: '/telegram/webhook', headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET }, payload: update });
    expect(json(first).result).toBe('granted');
    expect(json(second).result).toBe('duplicate_update');
  });

  it('тот же платёж (charge id) в другом обновлении не зачисляется повторно', async () => {
    const before = await sub();
    const res = await webhook({ message: { message_id: 4, chat: { id: TG_ID, type: 'private' }, from: { id: TG_ID }, successful_payment: {
      currency: 'XTR', total_amount: 199, invoice_payload: payload, telegram_payment_charge_id: 'charge-1' } } });
    expect(json(res).result).toBe('duplicate');
    expect((await sub()).until).toBe(before.until);
  });

  it('продление подписки (новый charge id) переносит дату окончания', async () => {
    const exp = Math.floor(Date.now() / 1000) + 60 * 86400;
    await webhook({ message: { message_id: 5, chat: { id: TG_ID, type: 'private' }, from: { id: TG_ID }, successful_payment: {
      currency: 'XTR', total_amount: 199, invoice_payload: payload, telegram_payment_charge_id: 'charge-renew', subscription_expiration_date: exp, is_recurring: true } } });
    const e = await sub();
    expect(new Date(e.until).getTime()).toBe(exp * 1000);
  });

  it('отмена автопродления вызывает editUserStarSubscription и сохраняет доступ', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/billing/auto-renew', headers: h, payload: { enabled: false } });
    expect(res.statusCode).toBe(200);
    const call = t.bot.last('editUserStarSubscription')!;
    expect(call.params).toMatchObject({ user_id: TG_ID, is_canceled: true });
    const e = json(res);
    expect(e.pro).toBe(true);
    expect(e.cancelAtPeriodEnd).toBe(true);
  });

  it('возврат (refunded_payment) отзывает доступ', async () => {
    await webhook({ message: { message_id: 6, chat: { id: TG_ID, type: 'private' }, from: { id: TG_ID }, refunded_payment: {
      currency: 'XTR', total_amount: 199, invoice_payload: payload, telegram_payment_charge_id: 'charge-renew' } } });
    await webhook({ message: { message_id: 7, chat: { id: TG_ID, type: 'private' }, from: { id: TG_ID }, refunded_payment: {
      currency: 'XTR', total_amount: 199, invoice_payload: payload, telegram_payment_charge_id: 'charge-1' } } });
    await webhook({ message: { message_id: 8, chat: { id: TG_ID, type: 'private' }, from: { id: TG_ID }, refunded_payment: {
      currency: 'XTR', total_amount: 199, invoice_payload: payload, telegram_payment_charge_id: 'charge-dup' } } });
    const e = await sub();
    expect(e.pro).toBe(false);
    expect(e.status).toBe('refunded');
  });

  it('клиент не может выдать себе доступ: тестовая оплата закрыта в режиме stars', async () => {
    const inv = json(await t.app.inject({ method: 'POST', url: '/api/billing/invoice', headers: h, payload: { productId: 'pro_year' } }));
    const res = await t.app.inject({ method: 'POST', url: `/api/billing/sandbox/${inv.paymentId}/complete`, headers: h, payload: { outcome: 'paid' } });
    expect(res.statusCode).toBe(409);
    expect((await sub()).pro).toBe(false);
  });

  it('/paysupport отвечает текстом поддержки по оплате', async () => {
    await webhook({ message: { message_id: 9, chat: { id: TG_ID, type: 'private' }, from: { id: TG_ID }, text: '/paysupport' } });
    expect(String(t.bot.last('sendMessage')!.params.text)).toContain('Поддержка по оплате');
  });
});

describe('Тестовая оплата (sandbox)', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  const h = auth({ id: 6666 });
  beforeAll(async () => { t = await setup({ PAYMENTS_MODE: 'sandbox' }); }, 60_000);
  afterAll(async () => t.close());

  it('отказ не выдаёт доступ, подтверждение — выдаёт тестовый Pro', async () => {
    const inv1 = json(await t.app.inject({ method: 'POST', url: '/api/billing/invoice', headers: h, payload: { productId: 'pro_year' } }));
    expect(inv1.mode).toBe('sandbox');
    const failed = json(await t.app.inject({ method: 'POST', url: `/api/billing/sandbox/${inv1.paymentId}/complete`, headers: h, payload: { outcome: 'failed' } }));
    expect(failed.entitlement.pro).toBe(false);
    const inv2 = json(await t.app.inject({ method: 'POST', url: '/api/billing/invoice', headers: h, payload: { productId: 'pro_year' } }));
    const ok = json(await t.app.inject({ method: 'POST', url: `/api/billing/sandbox/${inv2.paymentId}/complete`, headers: h, payload: { outcome: 'paid' } }));
    expect(ok.entitlement.pro).toBe(true);
    expect(ok.entitlement.isTest).toBe(true);
  });

  it('чужой платёж подтвердить нельзя', async () => {
    const inv = json(await t.app.inject({ method: 'POST', url: '/api/billing/invoice', headers: h, payload: { productId: 'pro_month' } }));
    const res = await t.app.inject({ method: 'POST', url: `/api/billing/sandbox/${inv.paymentId}/complete`, headers: auth({ id: 7777 }), payload: { outcome: 'paid' } });
    expect(res.statusCode).toBe(404);
  });
});

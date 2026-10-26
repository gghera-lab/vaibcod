import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { notifications, referrals, subscriptions, users } from '../src/db/schema.ts';
import { registerReferral } from '../src/services/referrals.ts';
import { auth, json, listenToEnd, setup, WEBHOOK_SECRET } from './helpers.ts';

const DAY = 86_400_000;
const A = 8001; // пригласивший
const B = 8002; // первый друг
const C = 8003; // второй друг (сверх лимита)
const D = 8004; // давно зарегистрированный пользователь
const E = 8005; // друг, пришедший через бота

describe('Реферальная программа', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  let code = '';
  const ha = auth({ id: A });
  const withRef = (id: number, c: string) => auth({ id }, undefined, undefined, { start_param: `ref_${c}` });
  const info = async (id: number) => json(await t.app.inject({ method: 'GET', url: '/api/me/referrals', headers: auth({ id }) }));
  const me = async (h: Record<string, string>) => json(await t.app.inject({ method: 'GET', url: '/api/me', headers: h }));
  const userRow = async (tgId: number) => (await t.db.select().from(users).where(eq(users.telegramId, tgId)))[0];
  const referralSubs = async (tgId: number) => {
    const u = await userRow(tgId);
    return t.db.select().from(subscriptions).where(and(eq(subscriptions.userId, u.id), eq(subscriptions.source, 'referral')));
  };

  beforeAll(async () => { t = await setup({ BOT_USERNAME: 'pravo_test_bot', REFERRAL_MAX_REWARDS: '1' }); }, 60_000);
  afterAll(async () => t.close());

  it('ссылка-приглашение: t.me/<бот>?startapp=ref_<код>, код постоянный', async () => {
    const r = await info(A);
    expect(r.link).toMatch(/^https:\/\/t\.me\/pravo_test_bot\?startapp=ref_[a-z0-9]{8}$/);
    expect(r).toMatchObject({ invited: 0, qualified: 0, rewarded: 0, bonusDays: 7, maxRewards: 1 });
    code = r.code;
    expect((await info(A)).code).toBe(code);
  });

  it('пригласить себя нельзя', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/me', headers: withRef(A, code) })).statusCode).toBe(200);
    expect((await info(A)).invited).toBe(0);
    expect(await registerReferral(t.db, await userRow(A), code, 'mini_app')).toBe('self');
  });

  it('неизвестный код не мешает входу', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/api/me', headers: withRef(B, 'zzzz9999') })).statusCode).toBe(200);
    expect(await registerReferral(t.db, await userRow(B), 'zzzz9999', 'mini_app')).toBe('unknown_code');
  });

  it('друг записывается при открытии Mini App по ссылке, но бонуса до первой статьи нет', async () => {
    const m = await me(withRef(B, code));
    expect(m.entitlement.pro).toBe(false);
    expect(await info(A)).toMatchObject({ invited: 1, qualified: 0 });
    // Неполное прослушивание не засчитывается.
    await t.app.inject({ method: 'PUT', url: '/api/progress/constitution', headers: auth({ id: B }), payload: { trackKey: 'art-1', positionMs: 2000, listenedDeltaMs: 2000 } });
    expect((await me(auth({ id: B }))).entitlement.pro).toBe(false);
  });

  it('пригласивший не меняется при переходе по другой ссылке', async () => {
    const other = (await info(D)).code;
    await me(withRef(B, other));
    expect((await info(D)).invited).toBe(0);
    expect(await registerReferral(t.db, await userRow(B), other, 'mini_app')).toBe('already');
  });

  it('давно зарегистрированный пользователь не считается приглашённым', async () => {
    const d = await userRow(D);
    await t.db.update(users).set({ createdAt: new Date(Date.now() - 3 * DAY) }).where(eq(users.id, d.id));
    await me(withRef(D, code));
    expect((await info(A)).invited).toBe(1);
  });

  it('друг дослушал первую статью — по 7 дней Pro обоим, ровно один раз', async () => {
    // У пригласившего уже есть автопродляемая подписка: бонус добавляется после неё, управление подпиской не теряется.
    const a = await userRow(A);
    const paidEnd = new Date(Date.now() + 30 * DAY);
    await t.db.insert(subscriptions).values({ userId: a.id, productId: 'pro_month', status: 'active', source: 'stars', currentPeriodEnd: paidEnd, telegramChargeId: 'charge-ref-a' });

    const done = await listenToEnd(t, auth({ id: B }), 'art-1');
    expect(done.justCompleted).toBe(true);

    const eb = (await me(auth({ id: B }))).entitlement;
    expect(eb).toMatchObject({ pro: true, source: 'referral', productId: 'pro_referral' });
    expect(Math.abs(new Date(eb.until).getTime() - (Date.now() + 7 * DAY))).toBeLessThan(60_000);

    const ea = (await me(ha)).entitlement;
    expect(ea).toMatchObject({ pro: true, productId: 'pro_month', source: 'stars' });
    const [bonusA] = await referralSubs(A);
    expect(bonusA.currentPeriodEnd.getTime()).toBe(paidEnd.getTime() + 7 * DAY);

    const kinds = await t.db.select().from(notifications).where(eq(notifications.kind, 'referral_bonus'));
    expect(kinds.map((n) => (n.payload as { role: string }).role).sort()).toEqual(['invitee', 'inviter']);

    // Следующие статьи бонус не повторяют.
    await listenToEnd(t, auth({ id: B }), 'art-2');
    expect((await referralSubs(B)).length).toBe(1);
    expect((await referralSubs(A)).length).toBe(1);
    expect(await info(A)).toMatchObject({ invited: 1, qualified: 1, rewarded: 1 });
  });

  it('отмена автопродления работает, когда после подписки идут бонусные дни', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/billing/auto-renew', headers: ha, payload: { enabled: false } });
    expect(res.statusCode).toBe(200);
    expect(t.bot.last('editUserStarSubscription')!.params).toMatchObject({ user_id: A, telegram_payment_charge_id: 'charge-ref-a', is_canceled: true });
  });

  it('лимит бонусов: сверх него бонус получает только друг', async () => {
    await me(withRef(C, code));
    await listenToEnd(t, auth({ id: C }), 'art-1');
    expect((await me(auth({ id: C }))).entitlement.pro).toBe(true);
    expect((await referralSubs(A)).length).toBe(1);
    expect(await info(A)).toMatchObject({ invited: 2, qualified: 2, rewarded: 1 });
    const [rowC] = await t.db.select().from(referrals).where(eq(referrals.inviteeId, (await userRow(C)).id));
    expect(rowC.inviterRewarded).toBe(false);
  });

  it('взаимное приглашение не засчитывается', async () => {
    const codeB = (await info(B)).code;
    expect(await registerReferral(t.db, await userRow(A), codeB, 'mini_app')).toBe('mutual');
  });

  it('бот: /start ref_<код> записывает приглашение и объясняет условия', async () => {
    const res = await t.app.inject({
      method: 'POST', url: '/telegram/webhook', headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
      payload: { update_id: 50_001, message: { message_id: 1, chat: { id: E, type: 'private' }, from: { id: E, first_name: 'Друг' }, text: `/start ref_${code}` } },
    });
    expect(json(res).result).toBe('start:referral_registered');
    expect(String(t.bot.last('sendMessage')!.params.text)).toContain('7 дней Pro');
    const [row] = await t.db.select().from(referrals).where(eq(referrals.inviteeId, (await userRow(E)).id));
    expect(row.channel).toBe('bot');
    expect((await info(A)).invited).toBe(3);
  });
});

// Обработка обновлений Telegram (webhook): команды бота и платёжные события.
// Повторно доставленные обновления (тот же update_id) не обрабатываются второй раз.

import type { FastifyBaseLogger } from 'fastify';
import { eq } from 'drizzle-orm';
import { handlePreCheckout, handleRefund, handleSuccessfulPayment, type BillingDeps, type PreCheckoutQuery, type RefundedPayment, type SuccessfulPayment } from '../billing/service.ts';
import { paymentEvents } from '../db/schema.ts';
import { upsertUser } from '../auth/plugin.ts';
import { parseReferralParam, REFERRAL_BONUS_DAYS, registerReferral } from '../services/referrals.ts';

interface TgUser { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string; is_bot?: boolean }

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: TgUser;
    chat: { id: number; type: string };
    text?: string;
    successful_payment?: SuccessfulPayment;
    refunded_payment?: RefundedPayment;
  };
  pre_checkout_query?: PreCheckoutQuery & { from: TgUser };
}

export function webAppUrl(deps: BillingDeps): string | null {
  return deps.config.PUBLIC_URL ?? null;
}

async function reply(deps: BillingDeps, chatId: number, text: string, withAppButton = false) {
  const url = webAppUrl(deps);
  await deps.bot.call('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(withAppButton && url ? { reply_markup: { inline_keyboard: [[{ text: '🎧 Открыть «Право на слух»', web_app: { url } }]] } } : {}),
  });
}

export const BOT_TEXTS = {
  start:
    '<b>Право на слух</b> — законодательство, которое удобно слушать.\n\n' +
    'В бета-версии доступна полная аудиокнига <b>Конституции РФ</b>: слушайте по главам и статьям, продолжайте с места остановки, ' +
    'закрепляйте материал карточками и тестами.\n\nОстальные кодексы и законы уже есть в каталоге — их озвучка в разработке. ' +
    'Голосуйте в приложении, какой документ озвучить следующим.',
  referralWelcome: `\n\n🎁 Вас пригласил друг. Дослушайте первую статью до конца — и вы оба получите <b>${REFERRAL_BONUS_DAYS} дней Pro</b>.`,
  paysupport: (contact: string) =>
    '<b>Поддержка по оплате</b>\n\nЕсли оплата прошла, а доступ не открылся, или нужен возврат — напишите нам: ' +
    `${contact}. Укажите дату и сумму платежа в Stars.\n\n` +
    'Обратите внимание: поддержка Telegram не рассматривает вопросы по покупкам в ботах — по ним отвечаем мы.',
  support: (contact: string) => `<b>Поддержка</b>\n\nВопросы, ошибки и предложения: ${contact}. Можно также написать через раздел «Профиль → Помощь» в приложении.`,
  terms: (url: string | null) =>
    `<b>Условия использования</b>\n\n${url ? `Пользовательское соглашение и политика обработки данных: ${url}/legal/terms` : 'Документы доступны в приложении: Профиль → Документы.'}`,
};

export async function handleUpdate(deps: BillingDeps, update: TelegramUpdate, log?: FastifyBaseLogger): Promise<string> {
  const { db } = deps;
  const isPayment = !!(update.pre_checkout_query || update.message?.successful_payment || update.message?.refunded_payment);
  let eventId: number | null = null;
  if (isPayment) {
    const kind = update.pre_checkout_query ? 'pre_checkout_query' : update.message?.successful_payment ? 'successful_payment' : 'refunded_payment';
    const [ev] = await db.insert(paymentEvents).values({ source: 'telegram', externalId: String(update.update_id), kind, payload: update as never })
      .onConflictDoNothing().returning();
    if (ev) eventId = ev.id;
    else {
      // Повторная доставка: если прошлую попытку не удалось обработать — обрабатываем снова
      // (обработчики идемпотентны), иначе пропускаем.
      const [prev] = await db.select().from(paymentEvents).where(eq(paymentEvents.externalId, String(update.update_id))).limit(1);
      if (prev?.processedAt) return 'duplicate_update';
      eventId = prev?.id ?? null;
    }
  }
  try {
    let result = 'ignored';
    if (update.pre_checkout_query) {
      const r = await handlePreCheckout(deps, update.pre_checkout_query);
      result = r.ok ? 'pre_checkout_ok' : `pre_checkout_rejected: ${r.reason}`;
    } else if (update.message?.successful_payment && update.message.from) {
      result = await handleSuccessfulPayment(deps, update.message.from.id, update.message.successful_payment);
      if (result === 'granted') await reply(deps, update.message.chat.id, '✅ Оплата получена, доступ Pro открыт. Спасибо, что поддерживаете проект!', true);
    } else if (update.message?.refunded_payment) {
      result = await handleRefund(deps, update.message.refunded_payment);
    } else if (update.message?.text && update.message.from && !update.message.from.is_bot) {
      const [first, arg] = update.message.text.trim().split(/\s+/);
      const cmd = first.split('@')[0].toLowerCase();
      const chatId = update.message.chat.id;
      if (cmd === '/start') {
        const user = await upsertUser(db, update.message.from);
        // Ссылка t.me/<бот>?start=ref_<код> приходит боту как «/start ref_<код>».
        const code = parseReferralParam(arg);
        const referral = code ? await registerReferral(db, user, code, 'bot') : null;
        await reply(deps, chatId, BOT_TEXTS.start + (referral === 'registered' ? BOT_TEXTS.referralWelcome : ''), true);
        result = referral ? `start:referral_${referral}` : 'start';
      } else if (cmd === '/paysupport') {
        await reply(deps, chatId, BOT_TEXTS.paysupport(deps.config.SUPPORT_CONTACT));
        result = 'paysupport';
      } else if (cmd === '/support' || cmd === '/help') {
        await reply(deps, chatId, BOT_TEXTS.support(deps.config.SUPPORT_CONTACT), true);
        result = 'support';
      } else if (cmd === '/terms') {
        await reply(deps, chatId, BOT_TEXTS.terms(deps.config.PUBLIC_URL ?? null));
        result = 'terms';
      }
    }
    if (eventId) await db.update(paymentEvents).set({ processedAt: new Date() }).where(eq(paymentEvents.id, eventId));
    return result;
  } catch (e) {
    log?.error({ err: e }, 'Ошибка обработки обновления Telegram');
    if (eventId) await db.update(paymentEvents).set({ error: String((e as Error).message).slice(0, 1000) }).where(eq(paymentEvents.id, eventId));
    throw e;
  }
}

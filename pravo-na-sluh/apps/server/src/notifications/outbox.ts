// Отправка уведомлений пользователям через бота (очередь notifications).
// Без BOT_TOKEN уведомления помечаются как skipped — ничего не имитируется.

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Config } from '../config.ts';
import type { DB } from '../db/client.ts';
import { CONSTITUTION_ID } from '../db/seed.ts';
import { audioRequests, legalDocuments, notifications, users, userSettings } from '../db/schema.ts';
import type { BotClient } from '../telegram/bot-api.ts';

/** Через сколько дней без занятий напоминать о недослушанной статье. */
export const CONTINUE_AFTER_DAYS = 2;

function render(kind: string, payload: Record<string, unknown>): string | null {
  switch (kind) {
    case 'continue_listening':
      return `🎧 Вы остановились на ${payload.place} Конституции — продолжим с того же места?`;
    case 'referral_bonus':
      return payload.role === 'inviter'
        ? `🎁 Ваш друг дослушал первую статью — вам начислено ${payload.days} дней Pro. Спасибо, что рассказываете о «Праве на слух»!`
        : `🎁 Первая статья дослушана — по приглашению друга вам начислено ${payload.days} дней Pro: все тесты и расширенная статистика.`;
    case 'payment_success':
      return payload.test ? '🧪 Тестовая оплата подтверждена: доступ Pro открыт (тестовый режим, деньги не списывались).' : '✅ Оплата получена, доступ Pro открыт. Спасибо!';
    case 'payment_refunded':
      return '↩️ Возврат оформлен. Доступ Pro по этому платежу закрыт.';
    case 'audio_released':
      return `🎧 Вышла аудиоверсия: «${payload.title}». Откройте приложение, чтобы начать слушать.`;
    case 'review_due':
      return `🧠 Пора повторить: ${payload.count} карточ${Number(payload.count) === 1 ? 'ка' : 'ек'} ждут вас. Пара минут — и материал закрепится.`;
    default:
      return null;
  }
}

/** Кнопка под сообщением: открывает Mini App (для напоминания — сразу плеер с места остановки). */
function button(kind: string, publicUrl: string) {
  if (kind === 'continue_listening') return { text: '▶️ Продолжить', web_app: { url: `${publicUrl.replace(/\/$/, '')}/player` } };
  return { text: 'Открыть приложение', web_app: { url: publicUrl } };
}

/** «статье 19», «статье 67¹», «преамбуле», «пункте 2 заключительных и переходных положений». */
export function placeInConstitution(kind: string, title: string, number: string | null): string {
  if (kind === 'preamble') return 'преамбуле';
  if (kind === 'final_point') return `пункте ${number ?? title.replace(/^Пункт\s*/, '')} заключительных и переходных положений`;
  return `статье ${title.replace(/^Статья\s*/, '')}`;
}

export async function processOutbox(db: DB, config: Config, bot: BotClient, limit = 50) {
  const pending = await db.select({ n: notifications, telegramId: users.telegramId }).from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId)).where(eq(notifications.status, 'pending')).limit(limit);
  let sent = 0;
  for (const { n, telegramId } of pending) {
    const text = render(n.kind, n.payload as Record<string, unknown>);
    if (!text || !bot.enabled || telegramId >= 990_000_000_000) {
      await db.update(notifications).set({ status: 'skipped', error: !bot.enabled ? 'BOT_TOKEN не задан' : !text ? 'неизвестный тип' : 'тестовый пользователь' }).where(eq(notifications.id, n.id));
      continue;
    }
    try {
      await bot.call('sendMessage', {
        chat_id: telegramId,
        text,
        ...(config.PUBLIC_URL ? { reply_markup: { inline_keyboard: [[button(n.kind, config.PUBLIC_URL)]] } } : {}),
      });
      await db.update(notifications).set({ status: 'sent', sentAt: new Date() }).where(eq(notifications.id, n.id));
      sent++;
    } catch (e) {
      await db.update(notifications).set({ status: 'failed', error: String((e as Error).message).slice(0, 500) }).where(eq(notifications.id, n.id));
    }
  }
  return { processed: pending.length, sent };
}

/**
 * Напоминания о повторении: только пользователям, включившим их в настройках,
 * у которых есть карточки к повторению, и не чаще одного раза в сутки.
 */
export async function queueReviewReminders(db: DB, now = new Date()) {
  const rows = await db.execute(sql`
    select s.user_id as "userId", count(r.card_id)::int as "due"
    from user_settings s
    join review_states r on r.user_id = s.user_id and r.due_at <= ${now}
    where s.notify_reviews = true
      and not exists (
        select 1 from notifications n
        where n.user_id = s.user_id and n.kind = 'review_due' and n.created_at > ${new Date(now.getTime() - 20 * 3600_000)}
      )
    group by s.user_id`);
  const list = ((rows as unknown as { rows?: { userId: number; due: number }[] }).rows ?? (rows as unknown as { userId: number; due: number }[]));
  if (list.length) await db.insert(notifications).values(list.map((r) => ({ userId: r.userId, kind: 'review_due', payload: { count: r.due } })));
  return list.length;
}

/**
 * Напоминания о незавершённой статье: только пользователям, включившим их в настройках,
 * у которых последняя статья начата, но не дослушана, и не было занятий CONTINUE_AFTER_DAYS дня.
 * Одно напоминание на каждое место остановки — повторно только после нового прослушивания
 * (поэтому не чаще раза в CONTINUE_AFTER_DAYS дня).
 */
export async function queueContinueReminders(db: DB, now = new Date()) {
  const idle = new Date(now.getTime() - CONTINUE_AFTER_DAYS * 86_400_000);
  const rows = await db.execute(sql`
    select lp.user_id as "userId", a.article_key as "articleKey", a.kind as "kind", a.title as "title", a.number as "number"
    from listening_progress lp
    join user_settings s on s.user_id = lp.user_id and s.notify_continue = true
    join users u on u.id = lp.user_id and u.last_seen_at <= ${idle}
    join document_articles a on a.edition_id = lp.edition_id and a.article_key = lp.track_key
    join track_progress tp on tp.user_id = lp.user_id and tp.edition_id = lp.edition_id and tp.track_key = lp.track_key
    where lp.document_id = ${CONSTITUTION_ID}
      and lp.updated_at <= ${idle}
      and tp.completed_at is null
      and tp.listened_ms > 0
      and not exists (
        select 1 from notifications n
        where n.user_id = lp.user_id and n.kind = 'continue_listening' and n.created_at >= lp.updated_at
      )`);
  type Row = { userId: number; articleKey: string; kind: string; title: string; number: string | null };
  const list = ((rows as unknown as { rows?: Row[] }).rows ?? (rows as unknown as Row[]));
  if (list.length) {
    await db.insert(notifications).values(list.map((r) => ({
      userId: r.userId, kind: 'continue_listening', payload: { articleKey: r.articleKey, place: placeInConstitution(r.kind, r.title, r.number) },
    })));
  }
  return list.length;
}

/** Ставит уведомления о выходе аудиоверсии всем, кто нажал «Сообщить о выходе». */
export async function queueAudioRelease(db: DB, documentId: string) {
  const [doc] = await db.select().from(legalDocuments).where(eq(legalDocuments.id, documentId));
  if (!doc) throw new Error(`Документ ${documentId} не найден`);
  const reqs = await db.select({ userId: audioRequests.userId }).from(audioRequests)
    .innerJoin(userSettings, eq(userSettings.userId, audioRequests.userId))
    .where(and(eq(audioRequests.documentId, documentId), isNull(audioRequests.notifiedAt), eq(userSettings.notifyAudioReleases, true)));
  if (reqs.length) {
    await db.insert(notifications).values(reqs.map((r) => ({ userId: r.userId, kind: 'audio_released', payload: { documentId, title: doc.shortTitle } })));
    await db.update(audioRequests).set({ notifiedAt: new Date() }).where(and(eq(audioRequests.documentId, documentId), inArray(audioRequests.userId, reqs.map((r) => r.userId))));
  }
  return reqs.length;
}

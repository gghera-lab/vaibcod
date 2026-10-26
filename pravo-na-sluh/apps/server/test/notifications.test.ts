import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { notifications, users } from '../src/db/schema.ts';
import { processOutbox, queueAudioRelease, queueContinueReminders, queueReviewReminders } from '../src/notifications/outbox.ts';
import { auth, listenToEnd, setup } from './helpers.ts';

describe('Уведомления', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => { t = await setup({ PUBLIC_URL: 'https://pravo.example.ru' }); }, 60_000);
  afterAll(async () => t.close());

  it('напоминание о повторении — только при включённой настройке и не чаще раза в сутки', async () => {
    const on = auth({ id: 4001 });
    const off = auth({ id: 4002 });
    for (const h of [on, off]) {
      const q = JSON.parse((await t.app.inject({ method: 'GET', url: '/api/memory/queue?mode=article&key=art-1', headers: h })).body);
      await t.app.inject({ method: 'POST', url: `/api/memory/cards/${q.cards[0].id}/answer`, headers: h, payload: { answer: q.cards[0].type === 'truefalse' ? { value: false } : q.cards[0].type === 'cloze' ? { text: 'нет' } : { index: 9 } } });
    }
    await t.app.inject({ method: 'PATCH', url: '/api/me/settings', headers: on, payload: { notifyReviews: true } });
    const later = new Date(Date.now() + 3600_000); // карточка с ошибкой возвращается через 10 минут
    expect(await queueReviewReminders(t.db, later)).toBe(1);
    expect(await queueReviewReminders(t.db, later)).toBe(0);
    const [u] = await t.db.select().from(users).where(eq(users.telegramId, 4001));
    const rows = await t.db.select().from(notifications).where(eq(notifications.userId, u.id));
    expect(rows.filter((r) => r.kind === 'review_due').length).toBe(1);
  });

  it('уведомление о выходе аудио получают только подписавшиеся', async () => {
    const h = auth({ id: 4003 });
    await t.app.inject({ method: 'PUT', url: '/api/documents/tk/notify', headers: h, payload: { on: true } });
    expect(await queueAudioRelease(t.db, 'tk')).toBe(1);
    expect(await queueAudioRelease(t.db, 'tk')).toBe(0);
  });

  it('очередь отправляется через бота', async () => {
    const before = t.bot.calls.filter((c) => c.method === 'sendMessage').length;
    const res = await processOutbox(t.db, t.config, t.bot);
    expect(res.sent).toBeGreaterThan(0);
    expect(t.bot.calls.filter((c) => c.method === 'sendMessage').length).toBe(before + res.sent);
  });

  it('напоминание о незавершённой статье — по настройке, после 2 дней без занятий, одно на место остановки', async () => {
    const on = auth({ id: 4011 });
    const off = auth({ id: 4012 });
    const done = auth({ id: 4013 });
    const progress = (h: Record<string, string>, trackKey: string) =>
      t.app.inject({ method: 'PUT', url: '/api/progress/constitution', headers: h, payload: { trackKey, positionMs: 3000, listenedDeltaMs: 3000, event: 'pause' } });
    await progress(on, 'art-19');
    await progress(off, 'art-19');
    await listenToEnd(t, done, 'art-1'); // последняя статья дослушана — напоминать не о чем
    for (const h of [on, done]) await t.app.inject({ method: 'PATCH', url: '/api/me/settings', headers: h, payload: { notifyContinue: true } });

    expect(await queueContinueReminders(t.db, new Date())).toBe(0); // занимались только что
    const later = new Date(Date.now() + 3 * 86_400_000);
    expect(await queueContinueReminders(t.db, later)).toBe(1);
    expect(await queueContinueReminders(t.db, later)).toBe(0);
    expect(await queueContinueReminders(t.db, new Date(later.getTime() + 86_400_000))).toBe(0); // то же место — повторно не напоминаем

    await processOutbox(t.db, t.config, t.bot);
    const msg = [...t.bot.calls].reverse().find((c) => c.method === 'sendMessage' && c.params.chat_id === 4011)!;
    expect(msg.params.text).toBe('🎧 Вы остановились на статье 19 Конституции — продолжим с того же места?');
    expect(msg.params.reply_markup).toEqual({ inline_keyboard: [[{ text: '▶️ Продолжить', web_app: { url: 'https://pravo.example.ru/player' } }]] });

    // Вернулся, послушал и снова остановился — новое место остановки, новое напоминание через 2 дня.
    await progress(on, 'art-20');
    expect(await queueContinueReminders(t.db, later)).toBe(1);
    const [u] = await t.db.select().from(users).where(eq(users.telegramId, 4011));
    const rows = await t.db.select().from(notifications).where(eq(notifications.userId, u.id));
    expect(rows.filter((r) => r.kind === 'continue_listening').sort((a, b) => a.id - b.id).map((r) => (r.payload as { place: string }).place)).toEqual(['статье 19', 'статье 20']);
  });
});

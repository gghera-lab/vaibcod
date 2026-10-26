// Статистика пользователя: только из реальных событий (прослушивание, ответы, тесты).

import type { StatsDto } from '@pravo/shared';
import { and, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import type { DB } from '../db/client.ts';
import { dailyActivity, documentArticles, favorites, quizAttempts, reviewLogs, reviewStates, trackProgress } from '../db/schema.ts';
import { addDays, dayKey } from '../lib/time.ts';
import { requireEdition } from './constitution.ts';

const BUCKETS: { label: string; from: number; to: number }[] = [
  { label: 'до 1 дня', from: 0, to: 1 },
  { label: '1–3 дня', from: 1, to: 4 },
  { label: '4–7 дней', from: 4, to: 8 },
  { label: '8–30 дней', from: 8, to: 31 },
  { label: 'больше 30 дней', from: 31, to: 100000 },
];

export function streakFrom(activeDays: Set<string>, today = dayKey()): number {
  let day = activeDays.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (activeDays.has(day)) { n++; day = addDays(day, -1); }
  return n;
}

export async function getStats(db: DB, userId: number, pro: boolean): Promise<StatsDto> {
  const edition = await requireEdition(db);
  const days = await db.select().from(dailyActivity).where(eq(dailyActivity.userId, userId)).orderBy(desc(dailyActivity.day));
  const active = new Set(days.filter((d) => d.listenedMs >= 30_000 || d.reviews > 0 || d.quizAnswers > 0).map((d) => d.day));
  const listenedMs = days.reduce((s, d) => s + d.listenedMs, 0);

  const articleKeys = (await db.select({ key: documentArticles.articleKey }).from(documentArticles).where(eq(documentArticles.editionId, edition.id))).map((r) => r.key);
  const keySet = new Set(articleKeys);
  const completed = await db.select({ key: trackProgress.trackKey }).from(trackProgress)
    .where(and(eq(trackProgress.userId, userId), eq(trackProgress.editionId, edition.id), isNotNull(trackProgress.completedAt)));

  const attempts = await db.select().from(quizAttempts).where(and(eq(quizAttempts.userId, userId), isNotNull(quizAttempts.finishedAt)));
  const pcts = attempts.filter((a) => a.total > 0).map((a) => Math.round((a.correct / a.total) * 100));

  const [rev] = await db.select({ n: sql<number>`count(*)::int`, ok: sql<number>`count(*) filter (where ${reviewLogs.isCorrect})::int` }).from(reviewLogs).where(eq(reviewLogs.userId, userId));
  const [due] = await db.select({ n: sql<number>`count(*)::int` }).from(reviewStates).where(and(eq(reviewStates.userId, userId), lte(reviewStates.dueAt, new Date())));
  const [fav] = await db.select({ n: sql<number>`count(*)::int` }).from(favorites).where(eq(favorites.userId, userId));

  let retention: StatsDto['retention'] = null;
  if (pro) {
    const logs = await db.select({ e: reviewLogs.elapsedDays, ok: reviewLogs.isCorrect }).from(reviewLogs)
      .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.prevIntervalDays, 0.5)));
    retention = BUCKETS.map((b) => {
      const inB = logs.filter((l) => l.e >= b.from && l.e < b.to);
      return { bucket: b.label, answers: inB.length, accuracy: inB.length ? Math.round((inB.filter((l) => l.ok).length / inB.length) * 100) : 0 };
    });
  }

  const today = dayKey();
  const byDay = new Map(days.map((d) => [d.day, d]));
  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(today, i - 13);
    const d = byDay.get(day);
    return { day, listenedMs: d?.listenedMs ?? 0, reviews: d?.reviews ?? 0, quizAnswers: d?.quizAnswers ?? 0 };
  });

  return {
    listenedMs,
    articlesCompleted: completed.filter((c) => keySet.has(c.key)).length,
    articlesTotal: articleKeys.length,
    streakDays: streakFrom(active, today),
    activeDays: active.size,
    quizzes: { finished: attempts.length, avgPct: pcts.length ? Math.round(pcts.reduce((s, x) => s + x, 0) / pcts.length) : null, best: pcts.length ? Math.max(...pcts) : null },
    reviews: { total: rev?.n ?? 0, accuracy: rev?.n ? Math.round((rev.ok / rev.n) * 100) : null, dueNow: due?.n ?? 0 },
    favorites: fav?.n ?? 0,
    retention,
    last14Days,
  };
}

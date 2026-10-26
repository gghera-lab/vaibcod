// Запоминание: карточки, интервальные повторения, тесты по статьям и главам.
// Правильный ответ всегда хранится на сервере и подкреплён дословной цитатой из статьи.

import type { AnswerResultDto, CardDto, MemoryOverviewDto } from '@pravo/shared';
import { gradeFromAnswer, newState, previewIntervals, schedule, type Grade, type SrsState } from '@pravo/shared';
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, notInArray, sql } from 'drizzle-orm';
import type { DB } from '../db/client.ts';
import { dailyActivity, documentChapters, documentArticles, memoryCards, quizAnswers, quizAttempts, reviewLogs, reviewStates, trackProgress } from '../db/schema.ts';
import { AppError, badRequest, notFound, proRequired } from '../lib/errors.ts';
import { dayKey } from '../lib/time.ts';
import { requireEdition } from './constitution.ts';

type CardRow = typeof memoryCards.$inferSelect;

export const FREE_CHAPTERS = new Set(['preamble', 'ch-1', 'ch-2']);
export const NEW_CARDS_PER_DAY = 15;

export function normalizeAnswer(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[«»"'.,;:!?()\-—–]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function checkAnswer(card: CardRow, answer: unknown): { correct: boolean; correctAnswer: string; grade?: Grade } {
  const a = (answer ?? {}) as Record<string, unknown>;
  const key = card.answer as Record<string, unknown>;
  switch (card.type) {
    case 'single': {
      const idx = Number(a.index);
      if (!Number.isInteger(idx)) throw badRequest('Выберите вариант ответа');
      return { correct: idx === key.index, correctAnswer: card.options?.[key.index as number] ?? '' };
    }
    case 'truefalse': {
      if (typeof a.value !== 'boolean') throw badRequest('Выберите «Верно» или «Неверно»');
      return { correct: a.value === key.value, correctAnswer: key.value ? 'Верно' : 'Неверно' };
    }
    case 'cloze': {
      if (typeof a.text !== 'string' || !a.text.trim()) throw badRequest('Введите ответ');
      const accepted = [key.text as string, ...((key.accept as string[]) ?? [])].map(normalizeAnswer);
      return { correct: accepted.includes(normalizeAnswer(a.text)), correctAnswer: key.text as string };
    }
    case 'recall': {
      const g = Number(a.grade);
      if (![1, 2, 3, 4].includes(g)) throw badRequest('Оцените, насколько точно вы вспомнили');
      return { correct: g >= 3, correctAnswer: key.text as string, grade: g as Grade };
    }
    default:
      throw badRequest('Неизвестный тип карточки');
  }
}

function toCardDto(c: CardRow, state?: SrsState): CardDto {
  const s = state ?? newState(new Date());
  return {
    id: c.id, type: c.type as CardDto['type'], prompt: c.prompt, options: c.options, articleKey: c.articleKey, chapterKey: c.chapterKey,
    sourceRef: c.sourceRef, tier: c.tier as CardDto['tier'], state: s.state, intervals: previewIntervals(s, new Date(), c.difficulty),
  };
}

function rowToState(r: typeof reviewStates.$inferSelect): SrsState {
  return { state: r.state as SrsState['state'], intervalDays: r.intervalDays, ease: r.ease, reps: r.reps, lapses: r.lapses, dueAt: r.dueAt, lastReviewedAt: r.lastReviewedAt };
}

function tiersFor(pro: boolean) {
  return pro ? ['free', 'pro'] : ['free'];
}

/** Статьи, которые пользователь слушал (≥30% трека) — из них берутся новые карточки. */
async function listenedArticleKeys(db: DB, userId: number): Promise<string[]> {
  const edition = await requireEdition(db);
  const rows = await db.select({ key: trackProgress.trackKey, listened: trackProgress.listenedMs, completed: trackProgress.completedAt, max: trackProgress.maxPositionMs })
    .from(trackProgress).where(and(eq(trackProgress.userId, userId), eq(trackProgress.editionId, edition.id)));
  return rows.filter((r) => r.completed || r.listened > 15_000).map((r) => r.key);
}

export interface QueueOptions {
  mode: 'due' | 'mistakes' | 'article' | 'chapter';
  key?: string;
  limit?: number;
}

export async function getQueue(db: DB, userId: number, pro: boolean, opts: QueueOptions): Promise<{ cards: CardDto[]; lockedCount: number; hint: string | null }> {
  const now = new Date();
  const limit = Math.min(opts.limit ?? 20, 50);
  const tiers = tiersFor(pro);

  if (opts.mode === 'article' || opts.mode === 'chapter') {
    if (!opts.key) throw badRequest('Не указана статья или глава');
    const col = opts.mode === 'article' ? memoryCards.articleKey : memoryCards.chapterKey;
    const all = await db.select().from(memoryCards).where(and(eq(col, opts.key), eq(memoryCards.active, true))).orderBy(asc(memoryCards.sort));
    const accessible = all.filter((c) => tiers.includes(c.tier));
    const states = await statesFor(db, userId, accessible.map((c) => c.id));
    return { cards: accessible.slice(0, limit).map((c) => toCardDto(c, states.get(c.id))), lockedCount: all.length - accessible.length, hint: all.length === 0 ? 'Для этой статьи карточки ещё готовятся' : null };
  }

  if (opts.mode === 'mistakes') {
    if (!pro) throw proRequired();
    const rows = await db.select({ card: memoryCards, st: reviewStates }).from(reviewStates)
      .innerJoin(memoryCards, eq(memoryCards.id, reviewStates.cardId))
      .where(and(eq(reviewStates.userId, userId), gte(reviewStates.lapses, 1), eq(memoryCards.active, true)))
      .orderBy(desc(reviewStates.lapses)).limit(limit);
    return { cards: rows.map((r) => toCardDto(r.card, rowToState(r.st))), lockedCount: 0, hint: rows.length ? null : 'Ошибок пока нет — так держать' };
  }

  // Режим «к повторению»: сначала просроченные, затем новые из прослушанных статей.
  const due = await db.select({ card: memoryCards, st: reviewStates }).from(reviewStates)
    .innerJoin(memoryCards, eq(memoryCards.id, reviewStates.cardId))
    .where(and(eq(reviewStates.userId, userId), lte(reviewStates.dueAt, now), eq(memoryCards.active, true), inArray(memoryCards.tier, tiers)))
    .orderBy(asc(reviewStates.dueAt)).limit(limit);
  const cards = due.map((r) => toCardDto(r.card, rowToState(r.st)));
  let hint: string | null = null;
  if (cards.length < limit) {
    const newToday = await countNewToday(db, userId);
    const room = Math.max(0, Math.min(limit - cards.length, NEW_CARDS_PER_DAY - newToday));
    if (room > 0) {
      const listened = await listenedArticleKeys(db, userId);
      const seen = db.select({ id: reviewStates.cardId }).from(reviewStates).where(eq(reviewStates.userId, userId));
      const base = and(eq(memoryCards.active, true), inArray(memoryCards.tier, tiers), notInArray(memoryCards.id, seen));
      let fresh = listened.length
        ? await db.select().from(memoryCards).where(and(base, inArray(memoryCards.articleKey, listened))).orderBy(asc(memoryCards.sort)).limit(room)
        : [];
      if (!listened.length) {
        hint = 'Послушайте статьи Конституции — вопросы по ним появятся здесь. А пока можно начать с главы 1.';
        fresh = await db.select().from(memoryCards).where(and(base, inArray(memoryCards.chapterKey, ['preamble', 'ch-1']))).orderBy(asc(memoryCards.sort)).limit(Math.min(room, 5));
      }
      cards.push(...fresh.map((c) => toCardDto(c)));
    } else if (!cards.length) {
      hint = 'На сегодня всё: новые карточки — завтра, а повторения появятся по расписанию.';
    }
  }
  const [locked] = pro ? [{ n: 0 }] : await db.select({ n: sql<number>`count(*)::int` }).from(memoryCards).where(and(eq(memoryCards.active, true), eq(memoryCards.tier, 'pro')));
  return { cards, lockedCount: locked?.n ?? 0, hint };
}

async function statesFor(db: DB, userId: number, cardIds: string[]) {
  if (!cardIds.length) return new Map<string, SrsState>();
  const rows = await db.select().from(reviewStates).where(and(eq(reviewStates.userId, userId), inArray(reviewStates.cardId, cardIds)));
  return new Map(rows.map((r) => [r.cardId, rowToState(r)]));
}

async function countNewToday(db: DB, userId: number): Promise<number> {
  const since = new Date(`${dayKey()}T00:00:00+03:00`);
  const [r] = await db.select({ n: sql<number>`count(distinct ${reviewLogs.cardId})::int` }).from(reviewLogs)
    .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.createdAt, since), eq(reviewLogs.prevIntervalDays, 0)));
  return r?.n ?? 0;
}

async function loadCard(db: DB, cardId: string, pro: boolean): Promise<CardRow> {
  const [card] = await db.select().from(memoryCards).where(and(eq(memoryCards.id, cardId), eq(memoryCards.active, true)));
  if (!card) throw notFound('Карточка');
  if (card.tier === 'pro' && !pro) throw proRequired();
  return card;
}

async function applyReview(db: DB, userId: number, card: CardRow, grade: Grade, correct: boolean, now = new Date()) {
  const [existing] = await db.select().from(reviewStates).where(and(eq(reviewStates.userId, userId), eq(reviewStates.cardId, card.id)));
  const prev = existing ? rowToState(existing) : newState(now);
  const next = schedule(prev, grade, now, card.difficulty);
  const values = { state: next.state, dueAt: next.dueAt, intervalDays: next.intervalDays, ease: next.ease, reps: next.reps, lapses: next.lapses, lastReviewedAt: now };
  await db.insert(reviewStates).values({ userId, cardId: card.id, ...values })
    .onConflictDoUpdate({ target: [reviewStates.userId, reviewStates.cardId], set: values });
  const elapsed = prev.lastReviewedAt ? (now.getTime() - prev.lastReviewedAt.getTime()) / 86_400_000 : 0;
  await db.insert(reviewLogs).values({ userId, cardId: card.id, grade, isCorrect: correct, elapsedDays: elapsed, prevIntervalDays: prev.intervalDays, newIntervalDays: next.intervalDays });
  return next;
}

async function bumpActivity(db: DB, userId: number, field: 'reviews' | 'quizAnswers') {
  const col = field === 'reviews' ? dailyActivity.reviews : dailyActivity.quizAnswers;
  await db.insert(dailyActivity).values({ userId, day: dayKey(), [field]: 1 })
    .onConflictDoUpdate({ target: [dailyActivity.userId, dailyActivity.day], set: { [field]: sql`${col} + 1` } });
}

async function resultDto(db: DB, card: CardRow, correct: boolean, correctAnswer: string): Promise<AnswerResultDto> {
  const edition = await requireEdition(db);
  return { correct, correctAnswer, explanation: card.explanation, quote: card.quote, sourceRef: card.sourceRef, articleKey: card.articleKey, editionLabel: edition.label };
}

export async function answerReview(db: DB, userId: number, pro: boolean, cardId: string, answer: unknown, confidence: 1 | 2 | 3 | null, explicitGrade?: Grade) {
  const card = await loadCard(db, cardId, pro);
  const check = checkAnswer(card, answer);
  const grade = check.grade ?? explicitGrade ?? gradeFromAnswer(check.correct, confidence);
  // Неверный ответ нельзя «оценить» как лёгкий — алгоритм не допускает завышения.
  const safeGrade: Grade = check.correct ? grade : 1;
  const next = await applyReview(db, userId, card, safeGrade, check.correct);
  await bumpActivity(db, userId, 'reviews');
  return { ...(await resultDto(db, card, check.correct, check.correctAnswer)), nextDueAt: next.dueAt.toISOString(), intervalDays: next.intervalDays };
}

// ───────────── Тесты ─────────────

export async function startQuiz(db: DB, userId: number, pro: boolean, scope: 'article' | 'chapter', key: string) {
  const edition = await requireEdition(db);
  if (scope === 'chapter' && !FREE_CHAPTERS.has(key) && !pro) throw proRequired();
  const col = scope === 'article' ? memoryCards.articleKey : memoryCards.chapterKey;
  const all = await db.select().from(memoryCards).where(and(eq(col, key), eq(memoryCards.active, true), inArray(memoryCards.type, ['single', 'truefalse', 'cloze'])));
  const accessible = all.filter((c) => tiersFor(pro).includes(c.tier));
  if (!accessible.length) {
    if (all.length) throw proRequired();
    throw new AppError(404, 'no_cards', 'Для этого раздела вопросы ещё готовятся');
  }
  const picked = shuffle(accessible).slice(0, scope === 'chapter' ? 12 : 6);
  const [attempt] = await db.insert(quizAttempts).values({ userId, scope, scopeKey: key, editionKey: edition.editionKey, cardIds: picked.map((c) => c.id), total: picked.length }).returning();
  return { attemptId: attempt.id, title: await scopeTitle(db, scope, key), cards: picked.map((c) => toCardDto(c)) };
}

export async function answerQuiz(db: DB, userId: number, pro: boolean, attemptId: number, cardId: string, answer: unknown) {
  const [attempt] = await db.select().from(quizAttempts).where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.userId, userId)));
  if (!attempt) throw notFound('Тест');
  if (attempt.finishedAt) throw badRequest('Тест уже завершён');
  if (!attempt.cardIds.includes(cardId)) throw badRequest('Вопрос не относится к этому тесту');
  const card = await loadCard(db, cardId, pro);
  const check = checkAnswer(card, answer);
  const inserted = await db.insert(quizAnswers).values({ attemptId, userId, cardId, answer: answer as never, isCorrect: check.correct }).onConflictDoNothing().returning();
  if (inserted.length) {
    await applyReview(db, userId, card, check.correct ? 3 : 1, check.correct);
    await bumpActivity(db, userId, 'quizAnswers');
  }
  return resultDto(db, card, check.correct, check.correctAnswer);
}

export async function finishQuiz(db: DB, userId: number, attemptId: number) {
  const [attempt] = await db.select().from(quizAttempts).where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.userId, userId)));
  if (!attempt) throw notFound('Тест');
  const answers = await db.select({ a: quizAnswers, card: memoryCards }).from(quizAnswers).innerJoin(memoryCards, eq(memoryCards.id, quizAnswers.cardId))
    .where(eq(quizAnswers.attemptId, attemptId));
  const correct = answers.filter((x) => x.a.isCorrect).length;
  if (!attempt.finishedAt) await db.update(quizAttempts).set({ correct, finishedAt: new Date() }).where(eq(quizAttempts.id, attemptId));
  return {
    attemptId, title: await scopeTitle(db, attempt.scope, attempt.scopeKey), total: attempt.total, answered: answers.length, correct,
    pct: attempt.total ? Math.round((correct / attempt.total) * 100) : 0,
    mistakes: answers.filter((x) => !x.a.isCorrect).map((x) => ({ cardId: x.card.id, prompt: x.card.prompt, sourceRef: x.card.sourceRef, quote: x.card.quote, articleKey: x.card.articleKey })),
  };
}

async function scopeTitle(db: DB, scope: string, key: string): Promise<string> {
  const edition = await requireEdition(db);
  if (scope === 'chapter') {
    const [c] = await db.select().from(documentChapters).where(and(eq(documentChapters.editionId, edition.id), eq(documentChapters.chapterKey, key)));
    return c ? (c.number ? `Глава ${c.number}. ${c.title}` : c.title) : key;
  }
  const [a] = await db.select({ title: documentArticles.title }).from(documentArticles).where(and(eq(documentArticles.editionId, edition.id), eq(documentArticles.articleKey, key)));
  return a?.title ?? key;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ───────────── Обзор ─────────────

export async function overview(db: DB, userId: number, pro: boolean): Promise<MemoryOverviewDto> {
  const edition = await requireEdition(db);
  const now = new Date();
  const tiers = tiersFor(pro);
  const cards = await db.select({ id: memoryCards.id, chapterKey: memoryCards.chapterKey, articleKey: memoryCards.articleKey, tier: memoryCards.tier })
    .from(memoryCards).where(eq(memoryCards.active, true));
  const states = await db.select().from(reviewStates).where(eq(reviewStates.userId, userId));
  const stateMap = new Map(states.map((s) => [s.cardId, s]));
  const accessibleIds = new Set(cards.filter((c) => tiers.includes(c.tier)).map((c) => c.id));
  const dueNow = states.filter((s) => s.dueAt <= now && accessibleIds.has(s.cardId)).length;

  const logs = await db.select({ cardId: reviewLogs.cardId, ok: reviewLogs.isCorrect }).from(reviewLogs).where(eq(reviewLogs.userId, userId));
  const byCard = new Map<string, { n: number; ok: number }>();
  for (const l of logs) {
    const v = byCard.get(l.cardId) ?? { n: 0, ok: 0 };
    v.n++; if (l.ok) v.ok++;
    byCard.set(l.cardId, v);
  }
  const chapters = await db.select().from(documentChapters).where(eq(documentChapters.editionId, edition.id)).orderBy(asc(documentChapters.order));
  const chapterDtos = chapters.map((ch) => {
    const cc = cards.filter((c) => c.chapterKey === ch.chapterKey);
    let n = 0, ok = 0;
    for (const c of cc) { const v = byCard.get(c.id); if (v) { n += v.n; ok += v.ok; } }
    return {
      chapterKey: ch.chapterKey, title: ch.number ? `Глава ${ch.number}. ${ch.title}` : ch.title, cards: cc.length,
      locked: !pro && !FREE_CHAPTERS.has(ch.chapterKey), seen: cc.filter((c) => stateMap.has(c.id)).length, accuracy: n ? Math.round((ok / n) * 100) : null,
    };
  }).filter((c) => c.cards > 0);

  // Сложные статьи: больше всего ошибок (минимум 2 ответа).
  const byArticle = new Map<string, { n: number; err: number }>();
  for (const c of cards) {
    const v = byCard.get(c.id);
    if (!v) continue;
    const a = byArticle.get(c.articleKey) ?? { n: 0, err: 0 };
    a.n += v.n; a.err += v.n - v.ok;
    byArticle.set(c.articleKey, a);
  }
  const titles = new Map((await db.select({ key: documentArticles.articleKey, title: documentArticles.title }).from(documentArticles).where(eq(documentArticles.editionId, edition.id))).map((r) => [r.key, r.title]));
  const difficult = [...byArticle.entries()].filter(([, v]) => v.n >= 2 && v.err > 0)
    .map(([k, v]) => ({ articleKey: k, title: titles.get(k) ?? k, errors: v.err, accuracy: Math.round(((v.n - v.err) / v.n) * 100) }))
    .sort((a, b) => a.accuracy - b.accuracy || b.errors - a.errors).slice(0, 5);

  const attempts = await db.select().from(quizAttempts).where(and(eq(quizAttempts.userId, userId), isNotNull(quizAttempts.finishedAt))).orderBy(desc(quizAttempts.finishedAt)).limit(10);
  const history = await Promise.all(attempts.map(async (a) => ({ id: a.id, scope: a.scope, scopeKey: a.scopeKey, title: await scopeTitle(db, a.scope, a.scopeKey), total: a.total, correct: a.correct, finishedAt: a.finishedAt!.toISOString() })));

  const [today] = await db.select().from(dailyActivity).where(and(eq(dailyActivity.userId, userId), eq(dailyActivity.day, dayKey())));
  const listened = await listenedArticleKeys(db, userId);
  const newAvailable = cards.filter((c) => accessibleIds.has(c.id) && !stateMap.has(c.id) && listened.includes(c.articleKey)).length;
  return {
    dueNow, newAvailable, totalCards: accessibleIds.size, lockedCards: cards.length - accessibleIds.size,
    reviewedToday: (today?.reviews ?? 0) + (today?.quizAnswers ?? 0), chapters: chapterDtos, difficult, history,
  };
}

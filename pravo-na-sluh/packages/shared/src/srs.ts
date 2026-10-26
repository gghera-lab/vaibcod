// Интервальные повторения: прозрачная модификация SM-2.
// Учитывает оценку (снова/трудно/хорошо/легко), сложность карточки, опоздание с повторением,
// число успешных повторений и ошибок. Не обещает конкретный процент запоминания —
// интервалы подстраиваются под фактические ответы пользователя.

export type Grade = 1 | 2 | 3 | 4; // 1 — снова, 2 — трудно, 3 — хорошо, 4 — легко

export interface SrsState {
  state: 'new' | 'learning' | 'review' | 'relearning';
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
}

export const SRS = {
  initialEase: 2.5,
  minEase: 1.3,
  maxIntervalDays: 365,
  againMinutes: 10,
  firstIntervals: { 2: 0.5, 3: 1, 4: 4 } as Record<2 | 3 | 4, number>,
  secondIntervals: { 2: 1.5, 3: 3, 4: 7 } as Record<2 | 3 | 4, number>,
};

export function newState(now: Date): SrsState {
  return { state: 'new', intervalDays: 0, ease: SRS.initialEase, reps: 0, lapses: 0, dueAt: now, lastReviewedAt: null };
}

const DAY = 86_400_000;

/** Множитель сложности: 1 (лёгкая) … 5 (сложная) → 1.1 … 0.9. */
export function difficultyFactor(difficulty: number): number {
  const d = Math.min(5, Math.max(1, difficulty));
  return 1.15 - d * 0.05;
}

export function schedule(prev: SrsState, grade: Grade, now: Date, difficulty = 2): SrsState {
  const elapsedDays = prev.lastReviewedAt ? Math.max(0, (now.getTime() - prev.lastReviewedAt.getTime()) / DAY) : 0;
  let { ease, reps, lapses } = prev;
  let interval: number;
  let state: SrsState['state'];

  if (grade === 1) {
    if (prev.state === 'review') lapses += 1;
    ease = Math.max(SRS.minEase, ease - 0.2);
    reps = 0;
    interval = SRS.againMinutes / (24 * 60);
    state = prev.state === 'review' || prev.state === 'relearning' ? 'relearning' : 'learning';
  } else {
    if (reps === 0) interval = SRS.firstIntervals[grade];
    else if (reps === 1) interval = SRS.secondIntervals[grade];
    else {
      // Учитываем опоздание: если вспомнил позже срока, интервал растёт сильнее (как в Anki).
      const overdue = Math.max(0, elapsedDays - prev.intervalDays);
      const base = prev.intervalDays + (grade >= 3 ? overdue / 2 : 0);
      if (grade === 2) interval = Math.max(prev.intervalDays * 1.2, base * 1.2);
      else if (grade === 3) interval = base * ease;
      else interval = base * ease * 1.3;
    }
    if (grade === 2) ease = Math.max(SRS.minEase, ease - 0.15);
    if (grade === 4) ease = ease + 0.15;
    interval *= difficultyFactor(difficulty);
    // После ошибки интервал не прыгает сразу до большого значения.
    if (lapses > 0 && reps < 2) interval = Math.min(interval, 1 + lapses);
    reps += 1;
    state = 'review';
  }
  interval = Math.min(SRS.maxIntervalDays, interval);
  return {
    state,
    intervalDays: +interval.toFixed(4),
    ease: +ease.toFixed(3),
    reps,
    lapses,
    dueAt: new Date(now.getTime() + interval * DAY),
    lastReviewedAt: now,
  };
}

/** Интервалы, которые получит карточка при каждой оценке, — для подписей на кнопках. */
export function previewIntervals(prev: SrsState, now: Date, difficulty = 2): Record<Grade, number> {
  return {
    1: schedule(prev, 1, now, difficulty).intervalDays,
    2: schedule(prev, 2, now, difficulty).intervalDays,
    3: schedule(prev, 3, now, difficulty).intervalDays,
    4: schedule(prev, 4, now, difficulty).intervalDays,
  };
}

/** Перевод ответа в тесте в оценку: ошибка → «снова», верно → по уверенности. */
export function gradeFromAnswer(correct: boolean, confidence: 1 | 2 | 3 | null): Grade {
  if (!correct) return 1;
  if (confidence === 1) return 2;
  if (confidence === 3) return 4;
  return 3;
}

export function formatInterval(days: number): string {
  const minutes = Math.round(days * 24 * 60);
  if (minutes < 60) return `${Math.max(1, minutes)} мин`;
  const hours = Math.round(days * 24);
  if (hours < 24) return `${hours} ч`;
  const d = Math.round(days);
  if (d < 31) return `${d} дн`;
  const m = Math.round(days / 30);
  if (m < 12) return `${m} мес`;
  return `${(days / 365).toFixed(1).replace('.0', '')} г`;
}

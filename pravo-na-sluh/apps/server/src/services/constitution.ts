// Оглавление, статьи, плейлист аудиокниги и прогресс прослушивания Конституции РФ.

import type { ArticleDto, ArticleSearchHitDto, ConstitutionTocDto, EditionDto, PlaylistDto, ProgressDto, TextUnit, VoiceDto } from '@pravo/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Config } from '../config.ts';
import type { DB } from '../db/client.ts';
import {
  audioBooks, audioTracks, dailyActivity, documentArticles, documentChapters, documentEditions, favorites, legalDocuments, listeningProgress,
  memoryCards, trackProgress, userSettings, voiceProfiles,
} from '../db/schema.ts';
import { CONSTITUTION_ID, currentEdition } from '../db/seed.ts';
import { AppError, badRequest, notFound } from '../lib/errors.ts';
import { dayKey } from '../lib/time.ts';

export const COMPLETE_RATIO = 0.8;

export async function requireEdition(db: DB) {
  const e = await currentEdition(db);
  if (!e) throw new AppError(503, 'content_missing', 'Текст Конституции не загружен на сервер (выполните seed)');
  return e;
}

export function editionDto(e: typeof documentEditions.$inferSelect): EditionDto {
  return {
    key: e.editionKey,
    label: e.label,
    note: e.editionNote,
    sourceUrl: e.sourceUrl,
    retrievedAt: e.retrievedAt,
    verifiedAt: e.verifiedAt ? e.verifiedAt.toISOString() : null,
    verification: (e.verificationSummary as EditionDto['verification']) ?? null,
  };
}

export async function getToc(db: DB, userId: number | null): Promise<ConstitutionTocDto> {
  const edition = await requireEdition(db);
  const [doc] = await db.select().from(legalDocuments).where(eq(legalDocuments.id, CONSTITUTION_ID));
  const chapters = await db.select().from(documentChapters).where(eq(documentChapters.editionId, edition.id)).orderBy(asc(documentChapters.order));
  const articles = await db.select({
    key: documentArticles.articleKey, chapterKey: documentArticles.chapterKey, number: documentArticles.number, title: documentArticles.title,
    kind: documentArticles.kind, status: documentArticles.status, order: documentArticles.order, units: documentArticles.units,
  }).from(documentArticles).where(eq(documentArticles.editionId, edition.id)).orderBy(asc(documentArticles.order));

  const progress = new Map<string, { listenedMs: number; completed: boolean }>();
  const favs = new Set<string>();
  const durations = new Map<string, number>();
  if (userId) {
    const rows = await db.select().from(trackProgress).where(and(eq(trackProgress.userId, userId), eq(trackProgress.editionId, edition.id)));
    for (const r of rows) progress.set(r.trackKey, { listenedMs: r.listenedMs, completed: !!r.completedAt });
    const f = await db.select().from(favorites).where(and(eq(favorites.userId, userId), eq(favorites.documentId, CONSTITUTION_ID)));
    for (const r of f) if (r.articleKey) favs.add(r.articleKey);
    const voice = await userVoice(db, userId, edition.id);
    if (voice) {
      const t = await db.select({ key: audioTracks.trackKey, d: audioTracks.durationMs }).from(audioTracks).where(and(eq(audioTracks.editionId, edition.id), eq(audioTracks.voiceId, voice)));
      for (const r of t) durations.set(r.key, r.d);
    }
  }
  const adoptionLine = 'Принята всенародным голосованием 12 декабря 1993 года с изменениями, одобренными в ходе общероссийского голосования 1 июля 2020 года';
  return {
    documentId: CONSTITUTION_ID,
    title: doc?.title ?? 'Конституция Российской Федерации',
    adoption: adoptionLine,
    edition: editionDto(edition),
    chapters: chapters.map((c) => ({
      key: c.chapterKey,
      sectionTitle: c.sectionTitle,
      number: c.number,
      title: c.title,
      notes: c.notes,
      articles: articles.filter((a) => a.chapterKey === c.chapterKey).map((a) => {
        const p = progress.get(a.key);
        const d = durations.get(a.key);
        const units = a.units as TextUnit[];
        return {
          key: a.key, number: a.number, title: a.title, kind: a.kind, status: a.status,
          firstLine: (units[0]?.text ?? '').slice(0, 140),
          completed: !!p?.completed,
          listenedPct: p && d ? Math.min(100, Math.round((p.listenedMs / d) * 100)) : 0,
          favorite: favs.has(a.key),
        };
      }),
    })),
  };
}

export async function getArticle(db: DB, userId: number | null, key: string): Promise<ArticleDto> {
  const edition = await requireEdition(db);
  const all = await db.select({ key: documentArticles.articleKey, order: documentArticles.order }).from(documentArticles)
    .where(eq(documentArticles.editionId, edition.id)).orderBy(asc(documentArticles.order));
  const idx = all.findIndex((a) => a.key === key);
  if (idx < 0) throw notFound('Статья');
  const [a] = await db.select().from(documentArticles).where(and(eq(documentArticles.editionId, edition.id), eq(documentArticles.articleKey, key)));
  const [ch] = await db.select().from(documentChapters).where(and(eq(documentChapters.editionId, edition.id), eq(documentChapters.chapterKey, a.chapterKey)));
  const [cards] = await db.select({ n: sql<number>`count(*)::int` }).from(memoryCards).where(and(eq(memoryCards.articleKey, key), eq(memoryCards.active, true)));
  let favorite = false;
  if (userId) {
    const [f] = await db.select().from(favorites).where(and(eq(favorites.userId, userId), eq(favorites.documentId, CONSTITUTION_ID), eq(favorites.articleKey, key)));
    favorite = !!f;
  }
  return {
    key: a.articleKey, number: a.number, title: a.title, kind: a.kind, status: a.status, chapterKey: a.chapterKey,
    chapterTitle: ch ? (ch.number ? `Глава ${ch.number}. ${ch.title}` : ch.title) : '',
    units: a.units as TextUnit[], notes: a.notes,
    prevKey: all[idx - 1]?.key ?? null, nextKey: all[idx + 1]?.key ?? null,
    favorite, cardsCount: cards?.n ?? 0, editionLabel: edition.label,
  };
}

/**
 * Поиск по тексту статей. plain_text хранится в нижнем регистре с «ё» → «е» и той же длины, что и
 * исходный текст с номерами частей, поэтому позиция совпадения переносится на исходный текст для фрагмента.
 */
export async function searchArticles(db: DB, query: string, limit = 30): Promise<ArticleSearchHitDto[]> {
  const q = query.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  if (q.length < 2) return [];
  const edition = await requireEdition(db);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db.select({ key: documentArticles.articleKey, title: documentArticles.title, units: documentArticles.units, plain: documentArticles.plainText })
    .from(documentArticles)
    .where(and(eq(documentArticles.editionId, edition.id), sql`${documentArticles.plainText} like ${like}`))
    .orderBy(asc(documentArticles.order)).limit(limit);
  return rows.map((r) => {
    const text = (r.units as TextUnit[]).map((u) => (u.label ? `${u.label} ${u.text}` : u.text)).join(' ');
    const at = r.plain.indexOf(q);
    const from = Math.max(0, at - 40);
    const to = Math.min(text.length, at + q.length + 70);
    return {
      key: r.key,
      title: r.title,
      before: (from > 0 ? '…' : '') + text.slice(from, at).trimStart(),
      match: text.slice(at, at + q.length),
      after: text.slice(at + q.length, to).trimEnd() + (to < text.length ? '…' : ''),
    };
  });
}

async function userVoice(db: DB, userId: number | null, editionId: number): Promise<string | null> {
  const ready = await db.selectDistinct({ voiceId: audioTracks.voiceId }).from(audioTracks).where(and(eq(audioTracks.editionId, editionId), eq(audioTracks.status, 'ready')));
  const readySet = new Set(ready.map((r) => r.voiceId));
  if (userId) {
    const [s] = await db.select({ voiceId: userSettings.voiceId }).from(userSettings).where(eq(userSettings.userId, userId));
    if (s?.voiceId && readySet.has(s.voiceId)) return s.voiceId;
  }
  const voices = await db.select().from(voiceProfiles);
  const def = voices.find((v) => v.isDefault && readySet.has(v.id)) ?? voices.find((v) => readySet.has(v.id));
  return def?.id ?? null;
}

export async function getPlaylist(db: DB, config: Config, userId: number | null, requestedVoice?: string): Promise<PlaylistDto> {
  const edition = await requireEdition(db);
  const voices = await db.select().from(voiceProfiles).orderBy(asc(voiceProfiles.id));
  const counts = await db.select({ voiceId: audioTracks.voiceId, ready: sql<number>`count(*) filter (where ${audioTracks.status} = 'ready')::int`, total: sql<number>`count(*)::int` })
    .from(audioTracks).where(eq(audioTracks.editionId, edition.id)).groupBy(audioTracks.voiceId);
  const available = new Map(counts.map((c) => [c.voiceId, c]));
  const toDto = (v: typeof voices[number]): VoiceDto => ({
    id: v.id, title: v.title, description: v.description, quality: v.quality as VoiceDto['quality'], license: v.license,
    available: (available.get(v.id)?.ready ?? 0) > 0,
  });
  let voiceId = requestedVoice && available.has(requestedVoice) ? requestedVoice : await userVoice(db, userId, edition.id);
  if (!voiceId) {
    return { documentId: CONSTITUTION_ID, editionKey: edition.editionKey, status: 'unavailable', voice: null, voices: voices.map(toDto), tracks: [], totalDurationMs: 0, book: null };
  }
  const tracks = await db.select().from(audioTracks).where(and(eq(audioTracks.editionId, edition.id), eq(audioTracks.voiceId, voiceId))).orderBy(asc(audioTracks.order));
  const base = config.AUDIO_BASE_URL.replace(/\/$/, '');
  const ready = tracks.filter((t) => t.status === 'ready');
  const [bookRow] = await db.select().from(audioBooks).where(and(eq(audioBooks.editionId, edition.id), eq(audioBooks.voiceId, voiceId)));
  // Книга используется, только если в ней есть все треки плейлиста.
  const book = bookRow && bookRow.status === 'ready' && tracks.every((t) => bookRow.offsets[t.trackKey] != null) ? bookRow : null;
  const url = (p: string, sha: string) => `${base}/${p.split('/').map(encodeURIComponent).join('/')}?v=${sha.slice(0, 10)}`;
  return {
    book: book ? { url: url(book.path, book.sha256), durationMs: book.durationMs } : null,
    documentId: CONSTITUTION_ID,
    editionKey: edition.editionKey,
    status: ready.length === 0 ? 'unavailable' : ready.length < tracks.length ? 'partial' : 'ready',
    voice: toDto(voices.find((v) => v.id === voiceId)!),
    voices: voices.map(toDto),
    tracks: tracks.map((t) => ({
      key: t.trackKey, kind: t.kind as 'intro' | 'chapter_intro' | 'article', articleKey: t.articleKey, chapterKey: t.chapterKey, title: t.title,
      url: t.status === 'ready' ? url(t.path, t.sha256) : '',
      durationMs: t.durationMs, segments: t.segments as PlaylistDto['tracks'][number]['segments'],
      bookOffsetMs: book ? book.offsets[t.trackKey] : null,
    })),
    totalDurationMs: ready.reduce((s, t) => s + t.durationMs, 0),
  };
}

export async function getProgress(db: DB, userId: number): Promise<ProgressDto | null> {
  const [p] = await db.select({ p: listeningProgress, editionKey: documentEditions.editionKey }).from(listeningProgress)
    .innerJoin(documentEditions, eq(documentEditions.id, listeningProgress.editionId))
    .where(and(eq(listeningProgress.userId, userId), eq(listeningProgress.documentId, CONSTITUTION_ID)));
  if (!p) return null;
  return { trackKey: p.p.trackKey, positionMs: p.p.positionMs, updatedAt: p.p.updatedAt.toISOString(), editionKey: p.editionKey };
}

export interface ProgressInput {
  trackKey: string;
  positionMs: number;
  listenedDeltaMs: number;
  voiceId?: string;
  event?: 'tick' | 'pause' | 'ended' | 'seek' | 'start';
}

/** Сохраняет место остановки и учитывает фактически прослушанное время (не перемотку). */
export async function saveProgress(db: DB, userId: number, input: ProgressInput) {
  const edition = await requireEdition(db);
  const voiceId = input.voiceId ?? (await userVoice(db, userId, edition.id));
  const [track] = await db.select().from(audioTracks).where(and(eq(audioTracks.editionId, edition.id), eq(audioTracks.trackKey, input.trackKey), ...(voiceId ? [eq(audioTracks.voiceId, voiceId)] : []))).limit(1);
  if (!track) throw badRequest('Неизвестный трек');
  const position = Math.max(0, Math.min(Math.round(input.positionMs), track.durationMs));
  // Защита от накруток: за один вызов засчитывается не больше 2 минут прослушивания.
  const delta = Math.max(0, Math.min(Math.round(input.listenedDeltaMs), 120_000));
  const now = new Date();

  await db.insert(listeningProgress).values({ userId, documentId: CONSTITUTION_ID, editionId: edition.id, trackKey: input.trackKey, positionMs: position, updatedAt: now })
    .onConflictDoUpdate({ target: [listeningProgress.userId, listeningProgress.documentId], set: { editionId: edition.id, trackKey: input.trackKey, positionMs: position, updatedAt: now } });

  const [tp] = await db.insert(trackProgress).values({
    userId, editionId: edition.id, trackKey: input.trackKey, listenedMs: delta, maxPositionMs: position,
    playCount: input.event === 'start' ? 1 : 0, lastPlayedAt: now,
  }).onConflictDoUpdate({
    target: [trackProgress.userId, trackProgress.editionId, trackProgress.trackKey],
    set: {
      listenedMs: sql`${trackProgress.listenedMs} + ${delta}`,
      maxPositionMs: sql`greatest(${trackProgress.maxPositionMs}, ${position})`,
      playCount: input.event === 'start' ? sql`${trackProgress.playCount} + 1` : sql`${trackProgress.playCount}`,
      lastPlayedAt: now,
    },
  }).returning();

  let justCompleted = false;
  if (!tp.completedAt && tp.listenedMs >= track.durationMs * COMPLETE_RATIO) {
    await db.update(trackProgress).set({ completedAt: now }).where(and(eq(trackProgress.userId, userId), eq(trackProgress.editionId, edition.id), eq(trackProgress.trackKey, input.trackKey)));
    justCompleted = track.kind === 'article';
  }
  if (delta > 0) {
    await db.insert(dailyActivity).values({ userId, day: dayKey(now), listenedMs: delta })
      .onConflictDoUpdate({ target: [dailyActivity.userId, dailyActivity.day], set: { listenedMs: sql`${dailyActivity.listenedMs} + ${delta}` } });
  }
  return { positionMs: position, completed: !!tp.completedAt || justCompleted, justCompleted, listenedMs: tp.listenedMs };
}

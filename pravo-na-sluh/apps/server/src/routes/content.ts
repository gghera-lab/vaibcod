// Каталог, Конституция (оглавление, статьи, плейлист), прогресс, избранное и закладки.

import type { BookmarkDto, FavoritesDto } from '@pravo/shared';
import { CATEGORIES } from '@pravo/shared';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireUser } from '../auth/plugin.ts';
import type { AppContext } from '../app.ts';
import { audioTracks, bookmarks, documentArticles, favorites } from '../db/schema.ts';
import { CONSTITUTION_ID } from '../db/seed.ts';
import { badRequest, notFound } from '../lib/errors.ts';
import { categoryCounts, getDocument, leaderboard, listDocuments, setAudioRequest, setFavorite, setVote } from '../services/catalog.ts';
import { getArticle, getPlaylist, getProgress, getToc, requireEdition, saveProgress, searchArticles } from '../services/constitution.ts';
import { qualifyReferral } from '../services/referrals.ts';

const DocId = z.object({ id: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/) });
const ArticleKey = z.string().min(1).max(32).regex(/^(preamble|art-\d+(\.\d+)?|final-\d+)$/);

export function registerContentRoutes(ctx: AppContext) {
  const { app, db, config } = ctx;

  app.get('/api/catalog', async (req) => {
    const q = z.object({
      q: z.string().max(100).optional(),
      category: z.enum(CATEGORIES.map((c) => c.id) as [string, ...string[]]).optional(),
      audio: z.enum(['available', 'in_production']).optional(),
      favorites: z.enum(['1', 'true']).optional(),
      sort: z.enum(['popular', 'title', 'date', 'votes']).optional(),
    }).parse(req.query);
    const items = await listDocuments(db, req.user?.id ?? null, { ...q, favorites: !!q.favorites });
    return { items, total: items.length };
  });

  app.get('/api/catalog/categories', async () => {
    const counts = new Map((await categoryCounts(db)).map((c) => [c.category, c.n]));
    return CATEGORIES.map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }));
  });

  app.get('/api/catalog/upcoming', async (req) => leaderboard(db, req.user?.id ?? null));

  app.get('/api/documents/:id', async (req) => getDocument(db, req.user?.id ?? null, DocId.parse(req.params).id));

  app.put('/api/documents/:id/favorite', async (req) => {
    const user = requireUser(req);
    const { id } = DocId.parse(req.params);
    const { on } = z.object({ on: z.boolean() }).parse(req.body);
    await setFavorite(db, user.id, id, '', on);
    return getDocument(db, user.id, id);
  });

  app.put('/api/documents/:id/notify', async (req) => {
    const user = requireUser(req);
    const { id } = DocId.parse(req.params);
    const { on } = z.object({ on: z.boolean() }).parse(req.body);
    await setAudioRequest(db, user.id, id, on);
    return getDocument(db, user.id, id);
  });

  app.put('/api/documents/:id/vote', async (req) => {
    const user = requireUser(req);
    const { id } = DocId.parse(req.params);
    const { on } = z.object({ on: z.boolean() }).parse(req.body);
    await setVote(db, user.id, id, on);
    return getDocument(db, user.id, id);
  });

  // ── Конституция
  app.get('/api/constitution', async (req) => getToc(db, req.user?.id ?? null));

  app.get('/api/constitution/search', async (req) => {
    const { q } = z.object({ q: z.string().max(100) }).parse(req.query);
    return { items: await searchArticles(db, q) };
  });

  app.get('/api/constitution/articles/:key', async (req) => {
    const { key } = z.object({ key: ArticleKey }).parse(req.params);
    return getArticle(db, req.user?.id ?? null, key);
  });

  app.put('/api/constitution/articles/:key/favorite', async (req) => {
    const user = requireUser(req);
    const { key } = z.object({ key: ArticleKey }).parse(req.params);
    const { on } = z.object({ on: z.boolean() }).parse(req.body);
    await getArticle(db, null, key);
    await setFavorite(db, user.id, CONSTITUTION_ID, key, on);
    return { key, favorite: on };
  });

  app.get('/api/constitution/playlist', async (req) => {
    const { voice } = z.object({ voice: z.string().max(64).optional() }).parse(req.query);
    return getPlaylist(db, config, req.user?.id ?? null, voice);
  });

  app.get('/api/progress/constitution', async (req) => ({ progress: await getProgress(db, requireUser(req).id) }));

  app.put('/api/progress/constitution', async (req) => {
    const user = requireUser(req);
    const body = z.object({
      trackKey: z.string().min(1).max(40),
      positionMs: z.number().min(0).max(24 * 3600_000),
      listenedDeltaMs: z.number().min(0).max(3600_000).default(0),
      voiceId: z.string().max(64).optional(),
      event: z.enum(['tick', 'pause', 'ended', 'seek', 'start']).optional(),
    }).parse(req.body);
    const result = await saveProgress(db, user.id, body);
    // Первая дослушанная статья приглашённого открывает бонусы реферальной программы.
    if (result.justCompleted) await qualifyReferral(db, config, user.id);
    return result;
  });

  // ── Избранное и закладки
  app.get('/api/favorites', async (req): Promise<FavoritesDto> => {
    const user = requireUser(req);
    const edition = await requireEdition(db);
    const docs = await listDocuments(db, user.id, { favorites: true });
    const favArticles = await db.select({ f: favorites, title: documentArticles.title, units: documentArticles.units }).from(favorites)
      .innerJoin(documentArticles, and(eq(documentArticles.articleKey, favorites.articleKey), eq(documentArticles.editionId, edition.id)))
      .where(and(eq(favorites.userId, user.id), eq(favorites.documentId, CONSTITUTION_ID))).orderBy(desc(favorites.createdAt));
    return {
      documents: docs,
      articles: favArticles.filter((r) => r.f.articleKey).map((r) => ({
        documentId: CONSTITUTION_ID, articleKey: r.f.articleKey, title: r.title,
        firstLine: ((r.units as { text: string }[])[0]?.text ?? '').slice(0, 120), createdAt: r.f.createdAt.toISOString(),
      })),
      bookmarks: await listBookmarks(user.id),
    };
  });

  async function listBookmarks(userId: number): Promise<BookmarkDto[]> {
    const edition = await requireEdition(db);
    const rows = await db.select().from(bookmarks).where(and(eq(bookmarks.userId, userId), eq(bookmarks.editionId, edition.id))).orderBy(desc(bookmarks.createdAt));
    const titles = new Map((await db.selectDistinct({ key: audioTracks.trackKey, title: audioTracks.title }).from(audioTracks).where(eq(audioTracks.editionId, edition.id))).map((t) => [t.key, t.title]));
    return rows.map((b) => ({ id: b.id, trackKey: b.trackKey, trackTitle: titles.get(b.trackKey) ?? b.trackKey, positionMs: b.positionMs, note: b.note, createdAt: b.createdAt.toISOString() }));
  }

  app.get('/api/bookmarks', async (req) => listBookmarks(requireUser(req).id));

  app.post('/api/bookmarks', async (req) => {
    const user = requireUser(req);
    const body = z.object({ trackKey: z.string().min(1).max(40), positionMs: z.number().int().min(0), note: z.string().max(200).optional() }).parse(req.body);
    const edition = await requireEdition(db);
    const [track] = await db.select().from(audioTracks).where(and(eq(audioTracks.editionId, edition.id), eq(audioTracks.trackKey, body.trackKey))).limit(1);
    if (!track) throw badRequest('Неизвестный трек');
    const existing = await db.select().from(bookmarks).where(eq(bookmarks.userId, user.id));
    if (existing.length >= 200) throw badRequest('Достигнут лимит закладок (200)');
    const [b] = await db.insert(bookmarks).values({ userId: user.id, editionId: edition.id, trackKey: body.trackKey, positionMs: body.positionMs, note: body.note ?? null }).returning();
    return { id: b.id };
  });

  app.delete('/api/bookmarks/:id', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const deleted = await db.delete(bookmarks).where(and(eq(bookmarks.id, id), eq(bookmarks.userId, user.id))).returning();
    if (!deleted.length) throw notFound('Закладка');
    return { deleted: true };
  });
}

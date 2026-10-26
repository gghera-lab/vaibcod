// Каталог нормативных документов: поиск, фильтры, избранное, заявки на озвучку и голосование.

import type { DocumentDto } from '@pravo/shared';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { DB } from '../db/client.ts';
import { audioRequests, favorites, legalDocuments, votes } from '../db/schema.ts';
import { badRequest, notFound } from '../lib/errors.ts';

export const MAX_ACTIVE_VOTES = 3;

export interface CatalogQuery {
  q?: string;
  category?: string;
  audio?: 'available' | 'in_production';
  favorites?: boolean;
  sort?: 'popular' | 'title' | 'date' | 'votes';
}

type DocRow = typeof legalDocuments.$inferSelect;

function toDto(d: DocRow, flags: { fav: Set<string>; voted: Set<string>; notify: Set<string>; votes: Map<string, number> }): DocumentDto {
  return {
    id: d.id, title: d.title, shortTitle: d.shortTitle, category: d.category as DocumentDto['category'], docType: d.docType, number: d.number,
    adoptedAt: d.adoptedAt, publication: d.publication, description: d.description, status: d.status, statusNote: d.statusNote,
    officialUrl: d.officialUrl, sourceName: d.sourceName, verifiedAt: d.verifiedAt, verificationNote: d.verificationNote,
    audioStatus: d.audioStatus as DocumentDto['audioStatus'], hasText: d.hasText,
    isFavorite: flags.fav.has(d.id), votes: flags.votes.get(d.id) ?? 0, voted: flags.voted.has(d.id), notify: flags.notify.has(d.id),
  };
}

async function userFlags(db: DB, userId: number | null) {
  const fav = new Set<string>(), voted = new Set<string>(), notify = new Set<string>();
  if (userId) {
    for (const r of await db.select({ id: favorites.documentId }).from(favorites).where(and(eq(favorites.userId, userId), eq(favorites.articleKey, '')))) fav.add(r.id);
    for (const r of await db.select({ id: votes.documentId }).from(votes).where(eq(votes.userId, userId))) voted.add(r.id);
    for (const r of await db.select({ id: audioRequests.documentId }).from(audioRequests).where(eq(audioRequests.userId, userId))) notify.add(r.id);
  }
  const counts = await db.select({ id: votes.documentId, n: sql<number>`count(*)::int` }).from(votes).groupBy(votes.documentId);
  return { fav, voted, notify, votes: new Map(counts.map((c) => [c.id, c.n])) };
}

/** Нормализация поискового запроса: регистр, «ё», «№», лишние пробелы. */
export function normalizeQuery(q: string): string[] {
  return q.toLowerCase().replace(/ё/g, 'е').replace(/№/g, ' ').replace(/[«»"(),.]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 8);
}

export async function listDocuments(db: DB, userId: number | null, query: CatalogQuery): Promise<DocumentDto[]> {
  const conds = [];
  if (query.category) conds.push(eq(legalDocuments.category, query.category));
  if (query.audio) conds.push(eq(legalDocuments.audioStatus, query.audio));
  for (const term of normalizeQuery(query.q ?? '')) {
    // Параметризованный ILIKE: пользовательский ввод не попадает в SQL как текст запроса.
    conds.push(sql`${legalDocuments.searchText} like ${'%' + term.replace(/[%_\\]/g, '\\$&') + '%'}`);
  }
  const order = query.sort === 'title' ? [asc(legalDocuments.shortTitle)]
    : query.sort === 'date' ? [desc(legalDocuments.adoptedAt)]
    : [desc(legalDocuments.popularity), asc(legalDocuments.sort)];
  const rows = await db.select().from(legalDocuments).where(conds.length ? and(...conds) : undefined).orderBy(...order);
  const flags = await userFlags(db, userId);
  let list = rows.map((d) => toDto(d, flags));
  if (query.favorites) list = list.filter((d) => d.isFavorite);
  if (query.sort === 'votes') list.sort((a, b) => b.votes - a.votes || a.shortTitle.localeCompare(b.shortTitle, 'ru'));
  // Конституция — первая в «популярном» как единственная озвученная книга беты.
  return list;
}

export async function getDocument(db: DB, userId: number | null, id: string): Promise<DocumentDto> {
  const [d] = await db.select().from(legalDocuments).where(eq(legalDocuments.id, id));
  if (!d) throw notFound('Документ');
  return toDto(d, await userFlags(db, userId));
}

export async function categoryCounts(db: DB) {
  return db.select({ category: legalDocuments.category, n: sql<number>`count(*)::int` }).from(legalDocuments).groupBy(legalDocuments.category);
}

export async function setFavorite(db: DB, userId: number, documentId: string, articleKey: string, on: boolean) {
  await getDocument(db, null, documentId);
  if (on) await db.insert(favorites).values({ userId, documentId, articleKey }).onConflictDoNothing();
  else await db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.documentId, documentId), eq(favorites.articleKey, articleKey)));
}

export async function setAudioRequest(db: DB, userId: number, documentId: string, on: boolean) {
  const d = await getDocument(db, null, documentId);
  if (on && d.audioStatus === 'available') throw badRequest('Аудиоверсия этого документа уже доступна');
  if (on) await db.insert(audioRequests).values({ userId, documentId }).onConflictDoNothing();
  else await db.delete(audioRequests).where(and(eq(audioRequests.userId, userId), eq(audioRequests.documentId, documentId)));
}

export async function setVote(db: DB, userId: number, documentId: string, on: boolean) {
  const d = await getDocument(db, null, documentId);
  if (on) {
    if (d.audioStatus === 'available') throw badRequest('Этот документ уже озвучен');
    const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(votes).where(eq(votes.userId, userId));
    const [already] = await db.select().from(votes).where(and(eq(votes.userId, userId), eq(votes.documentId, documentId)));
    if (!already && (c?.n ?? 0) >= MAX_ACTIVE_VOTES) throw badRequest(`Можно отдать голос максимум за ${MAX_ACTIVE_VOTES} документа. Снимите голос с другого документа.`);
    await db.insert(votes).values({ userId, documentId }).onConflictDoNothing();
  } else {
    await db.delete(votes).where(and(eq(votes.userId, userId), eq(votes.documentId, documentId)));
  }
}

export async function leaderboard(db: DB, userId: number | null, limit = 6): Promise<DocumentDto[]> {
  const list = await listDocuments(db, userId, { audio: 'in_production', sort: 'votes' });
  return list.slice(0, limit);
}

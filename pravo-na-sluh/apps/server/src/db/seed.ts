// Наполнение БД справочными данными из проверенных файлов content/ и storage/audio/.
// Идемпотентно: можно запускать при каждом старте. Пользовательские данные не затрагиваются.

import fs from 'node:fs';
import path from 'node:path';
import type { AudioManifest, ConstitutionDocument } from '@pravo/shared';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import type { Config } from '../config.ts';
import { REFERRAL_BONUS_DAYS, REFERRAL_PRODUCT_ID } from '../services/referrals.ts';
import type { DB } from './client.ts';
import {
  audioBooks, audioTracks, documentArticles, documentChapters, documentEditions, legalDocuments, memoryCards, products, voiceProfiles,
} from './schema.ts';

export const CONSTITUTION_ID = 'constitution-rf';

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8'));

export interface SeedReport {
  documents: number;
  editionKey: string;
  articles: number;
  voicesWithAudio: string[];
  tracks: number;
  missingFiles: number;
  products: number;
  cards: number;
}

export async function seed(db: DB, config: Config): Promise<SeedReport> {
  const content = config.CONTENT_DIR;
  const doc = readJson<ConstitutionDocument>(path.join(content, 'constitution/constitution.json'));
  const verification = fs.existsSync(path.join(content, 'constitution/verification.json'))
    ? readJson<{ checkedAt: string; structureOk: boolean; crossCheck: { matched: number; unexplained: string[] } }>(path.join(content, 'constitution/verification.json'))
    : null;

  // ── Голоса и аудио-манифесты
  const allVoices = readJson<{ voices: { id: string; provider: string; title: string; description: string; gender: string; quality: string; license: string; default: boolean; hidden?: boolean }[] }>(path.join(content, 'voices.json')).voices;
  // Скрытые голоса (hidden: true) в приложение не попадают: их треки и профиль удаляются из БД,
  // а пользователь, выбравший такой голос раньше, слушает голос по умолчанию.
  const voices = allVoices.filter((v) => !v.hidden);
  const hiddenIds = allVoices.filter((v) => v.hidden).map((v) => v.id);
  if (hiddenIds.length) {
    await db.delete(audioBooks).where(inArray(audioBooks.voiceId, hiddenIds));
    await db.delete(audioTracks).where(inArray(audioTracks.voiceId, hiddenIds));
    await db.delete(voiceProfiles).where(inArray(voiceProfiles.id, hiddenIds));
  }
  const audioRoot = path.join(config.AUDIO_DIR, 'constitution', doc.editionId);
  const manifests: AudioManifest[] = [];
  for (const v of voices) {
    const file = path.join(audioRoot, v.id, 'manifest.json');
    if (fs.existsSync(file)) manifests.push(readJson<AudioManifest>(file));
  }
  for (const v of voices) {
    await db.insert(voiceProfiles).values({
      id: v.id, provider: v.provider, title: v.title, description: v.description, gender: v.gender, quality: v.quality, license: v.license, isDefault: v.default,
    }).onConflictDoUpdate({ target: voiceProfiles.id, set: { provider: v.provider, title: v.title, description: v.description, gender: v.gender, quality: v.quality, license: v.license, isDefault: v.default } });
  }

  // ── Каталог
  const catalog = readJson<{ documents: Record<string, unknown>[] }>(path.join(content, 'catalog/documents.json')).documents;
  const scriptTracks = (() => {
    const f = path.join(content, 'constitution/speech/script.json');
    return fs.existsSync(f) ? readJson<{ tracks: unknown[] }>(f).tracks.length : 0;
  })();
  const constitutionAudioReady = manifests.some((m) => m.editionId === doc.editionId && m.tracks.length === scriptTracks && scriptTracks > 0);
  for (const d of catalog) {
    const id = String(d.id);
    const row = {
      id,
      title: String(d.title),
      shortTitle: String(d.shortTitle),
      category: String(d.category),
      docType: String(d.docType),
      number: (d.number as string | null) ?? null,
      adoptedAt: (d.adoptedAt as string | null) ?? null,
      publication: (d.publication as string | null) ?? null,
      description: String(d.description),
      status: String(d.status),
      statusNote: (d.statusNote as string | null) ?? null,
      officialUrl: (d.officialUrl as string | null) ?? null,
      sourceName: (d.sourceName as string | null) ?? null,
      verifiedAt: (d.verifiedAt as string | null) ?? null,
      verificationNote: (d.verificationNote as string | null) ?? null,
      audioStatus: id === CONSTITUTION_ID && constitutionAudioReady ? 'available' : 'in_production',
      hasText: id === CONSTITUTION_ID,
      popularity: Number(d.popularity ?? 0),
      sort: Number(d.sort ?? 0),
      searchText: [d.title, d.shortTitle, d.number, d.docType, d.fullRequisites, d.description].filter(Boolean).join(' ').toLowerCase().replace(/ё/g, 'е'),
      updatedAt: new Date(),
    };
    await db.insert(legalDocuments).values(row).onConflictDoUpdate({ target: legalDocuments.id, set: row });
  }

  // ── Редакция Конституции, главы, статьи
  const [edition] = await db.insert(documentEditions).values({
    documentId: CONSTITUTION_ID,
    editionKey: doc.editionId,
    label: doc.editionLabel,
    editionNote: doc.editionNote,
    sourceUrl: doc.primarySource.url,
    sourceSha256: doc.primarySource.sha256,
    retrievedAt: doc.primarySource.retrievedAt,
    verifiedAt: verification ? new Date(verification.checkedAt) : null,
    verificationSummary: verification ? {
      structureOk: verification.structureOk,
      matched: verification.crossCheck.matched,
      total: doc.articles.length,
      unexplained: verification.crossCheck.unexplained.length,
    } : null,
    isCurrent: true,
  }).onConflictDoUpdate({
    target: [documentEditions.documentId, documentEditions.editionKey],
    set: { label: doc.editionLabel, editionNote: doc.editionNote, sourceSha256: doc.primarySource.sha256, isCurrent: true },
  }).returning();
  await db.update(documentEditions).set({ isCurrent: false })
    .where(and(eq(documentEditions.documentId, CONSTITUTION_ID), notInArray(documentEditions.id, [edition.id])));

  await db.delete(documentChapters).where(eq(documentChapters.editionId, edition.id));
  await db.delete(documentArticles).where(eq(documentArticles.editionId, edition.id));
  await db.insert(documentChapters).values(doc.chapters.map((c, i) => ({
    editionId: edition.id,
    chapterKey: c.id,
    sectionTitle: doc.sections.find((s) => s.id === c.sectionId)!.title,
    number: c.number,
    title: c.title,
    order: i,
    notes: c.notes,
  })));
  const articleRows = doc.articles.map((a) => ({
    editionId: edition.id,
    articleKey: a.id,
    chapterKey: a.chapterId,
    kind: a.kind,
    number: a.number,
    title: a.title,
    status: a.status,
    order: a.order,
    units: a.units,
    notes: a.notes,
    plainText: a.units.map((u) => (u.label ? `${u.label} ${u.text}` : u.text)).join(' ').toLowerCase().replace(/ё/g, 'е'),
  }));
  for (let i = 0; i < articleRows.length; i += 50) await db.insert(documentArticles).values(articleRows.slice(i, i + 50));

  // ── Аудиотреки
  let tracks = 0;
  let missingFiles = 0;
  for (const m of manifests) {
    const rows = m.tracks.map((t) => {
      const rel = `constitution/${m.editionId}/${m.voice.id}/${t.file}`;
      const exists = fs.existsSync(path.join(config.AUDIO_DIR, rel));
      if (!exists) missingFiles++;
      return {
        editionId: edition.id, voiceId: m.voice.id, trackKey: t.id, kind: t.kind, articleKey: t.articleId, chapterKey: t.chapterId,
        title: t.title, order: t.order, path: rel, durationMs: t.durationMs, bytes: t.bytes, sha256: t.sha256, segments: t.segments,
        status: exists ? 'ready' : 'unavailable', updatedAt: new Date(),
      };
    });
    await db.delete(audioTracks).where(and(eq(audioTracks.editionId, edition.id), eq(audioTracks.voiceId, m.voice.id)));
    for (let i = 0; i < rows.length; i += 50) await db.insert(audioTracks).values(rows.slice(i, i + 50));
    tracks += rows.length;

    // Непрерывный файл книги (если собран): плеер играет его без смены источника между статьями.
    await db.delete(audioBooks).where(and(eq(audioBooks.editionId, edition.id), eq(audioBooks.voiceId, m.voice.id)));
    if (m.book) {
      const rel = `constitution/${m.editionId}/${m.voice.id}/${m.book.file}`;
      const exists = fs.existsSync(path.join(config.AUDIO_DIR, rel));
      await db.insert(audioBooks).values({
        editionId: edition.id, voiceId: m.voice.id, path: rel, durationMs: m.book.durationMs, bytes: m.book.bytes, sha256: m.book.sha256,
        offsets: m.book.offsets, status: exists ? 'ready' : 'unavailable',
      });
    }
  }

  // ── Тарифы
  const tariffs = readJson<{ products: { id: string; title: string; description: string; priceStars: number; priceRubHint: number; periodDays: number; recurring: boolean; features: string[]; badge: string | null }[] }>(path.join(content, 'tariffs.json')).products;
  for (const [i, p] of tariffs.entries()) {
    const row = { ...p, active: true, sort: i };
    await db.insert(products).values(row).onConflictDoUpdate({ target: products.id, set: row });
  }
  if (tariffs.length) await db.update(products).set({ active: false }).where(notInArray(products.id, tariffs.map((p) => p.id)));
  // Бонусный доступ за приглашение друга: не продаётся (active=false), нужен для ссылки subscriptions.product_id.
  const bonus = {
    id: REFERRAL_PRODUCT_ID, title: 'Pro · бонус за приглашение', description: `${REFERRAL_BONUS_DAYS} дней Pro по реферальной программе.`,
    priceStars: 0, priceRubHint: 0, periodDays: REFERRAL_BONUS_DAYS, recurring: false, features: [], badge: null, active: false, sort: 100,
  };
  await db.insert(products).values(bonus).onConflictDoUpdate({ target: products.id, set: bonus });

  // ── Карточки для запоминания
  let cards = 0;
  const cardsFile = path.join(content, 'constitution/cards.json');
  if (fs.existsSync(cardsFile)) {
    const list = readJson<{ cards: Record<string, unknown>[] }>(cardsFile).cards;
    const ids: string[] = [];
    for (const c of list) {
      const row = {
        id: String(c.id), documentId: CONSTITUTION_ID, editionKey: doc.editionId, articleKey: String(c.articleKey), chapterKey: String(c.chapterKey),
        type: String(c.type), prompt: String(c.prompt), options: (c.options as string[] | null) ?? null, answer: c.answer as never,
        explanation: String(c.explanation), quote: String(c.quote), sourceRef: String(c.sourceRef), difficulty: Number(c.difficulty ?? 2),
        tier: String(c.tier), sort: Number(c.sort ?? 0), active: true,
      };
      await db.insert(memoryCards).values(row).onConflictDoUpdate({ target: memoryCards.id, set: row });
      ids.push(row.id);
    }
    if (ids.length) await db.update(memoryCards).set({ active: false }).where(notInArray(memoryCards.id, ids));
    cards = ids.length;
  }

  return {
    documents: catalog.length,
    editionKey: doc.editionId,
    articles: articleRows.length,
    voicesWithAudio: manifests.map((m) => m.voice.id),
    tracks,
    missingFiles,
    products: tariffs.length,
    cards,
  };
}

export async function currentEdition(db: DB, documentId = CONSTITUTION_ID) {
  const [e] = await db.select().from(documentEditions).where(and(eq(documentEditions.documentId, documentId), eq(documentEditions.isCurrent, true))).limit(1);
  return e ?? null;
}


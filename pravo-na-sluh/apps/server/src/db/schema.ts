// Схема базы данных (PostgreSQL). Миграции генерируются drizzle-kit в apps/server/drizzle.

import { sql } from 'drizzle-orm';
import {
  bigint, bigserial, boolean, date, index, integer, jsonb, pgTable, primaryKey, real, serial, text, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();

// ───────────── Пользователи ─────────────

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  username: text('username'),
  languageCode: text('language_code'),
  isDevUser: boolean('is_dev_user').notNull().default(false),
  onboardedAt: ts('onboarded_at'),
  termsVersion: text('terms_version'),
  termsAcceptedAt: ts('terms_accepted_at'),
  analyticsOptOut: boolean('analytics_opt_out').notNull().default(false),
  /** Код приглашения для ссылки t.me/<бот>?startapp=ref_<код>; создаётся при первом открытии «Пригласить друга». */
  referralCode: text('referral_code'),
  createdAt: createdAt(),
  lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('users_telegram_id_uq').on(t.telegramId), uniqueIndex('users_referral_code_uq').on(t.referralCode)]);

export const userSettings = pgTable('user_settings', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  voiceId: text('voice_id'),
  playbackRate: real('playback_rate').notNull().default(1),
  chapterChime: boolean('chapter_chime').notNull().default(true),
  autoAdvance: boolean('auto_advance').notNull().default(true),
  notifyReviews: boolean('notify_reviews').notNull().default(false),
  notifyAudioReleases: boolean('notify_audio_releases').notNull().default(true),
  /** Напоминание о начатой, но не дослушанной статье (после 2 дней без занятий). */
  notifyContinue: boolean('notify_continue').notNull().default(false),
  theme: text('theme').notNull().default('auto'),
  dailyGoalMin: integer('daily_goal_min').notNull().default(10),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

// ───────────── Каталог и тексты ─────────────

export const legalDocuments = pgTable('legal_documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  shortTitle: text('short_title').notNull(),
  category: text('category').notNull(),
  docType: text('doc_type').notNull(),
  number: text('number'),
  adoptedAt: date('adopted_at'),
  publication: text('publication'),
  description: text('description').notNull(),
  status: text('status').notNull(),
  statusNote: text('status_note'),
  officialUrl: text('official_url'),
  sourceName: text('source_name'),
  verifiedAt: date('verified_at'),
  verificationNote: text('verification_note'),
  /** available — есть аудио; in_production — озвучка в разработке. */
  audioStatus: text('audio_status').notNull().default('in_production'),
  hasText: boolean('has_text').notNull().default(false),
  popularity: integer('popularity').notNull().default(0),
  sort: integer('sort').notNull().default(0),
  searchText: text('search_text').notNull().default(''),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('legal_documents_category_idx').on(t.category)]);

/** Редакция документа: каждая загруженная версия текста хранится отдельно. */
export const documentEditions = pgTable('document_editions', {
  id: serial('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => legalDocuments.id, { onDelete: 'cascade' }),
  editionKey: text('edition_key').notNull(),
  label: text('label').notNull(),
  editionNote: text('edition_note'),
  sourceUrl: text('source_url').notNull(),
  sourceSha256: text('source_sha256').notNull(),
  retrievedAt: date('retrieved_at').notNull(),
  verifiedAt: ts('verified_at'),
  verificationSummary: jsonb('verification_summary'),
  isCurrent: boolean('is_current').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('document_editions_doc_key_uq').on(t.documentId, t.editionKey)]);

export const documentChapters = pgTable('document_chapters', {
  editionId: integer('edition_id').notNull().references(() => documentEditions.id, { onDelete: 'cascade' }),
  chapterKey: text('chapter_key').notNull(),
  sectionTitle: text('section_title').notNull(),
  number: integer('number'),
  title: text('title').notNull(),
  order: integer('order').notNull(),
  notes: jsonb('notes').$type<string[]>().notNull().default([]),
}, (t) => [primaryKey({ columns: [t.editionId, t.chapterKey] })]);

export const documentArticles = pgTable('document_articles', {
  editionId: integer('edition_id').notNull().references(() => documentEditions.id, { onDelete: 'cascade' }),
  articleKey: text('article_key').notNull(),
  chapterKey: text('chapter_key').notNull(),
  kind: text('kind').notNull(),
  number: text('number'),
  title: text('title').notNull(),
  status: text('status').notNull(),
  order: integer('order').notNull(),
  units: jsonb('units').notNull(),
  notes: jsonb('notes').$type<string[]>().notNull().default([]),
  plainText: text('plain_text').notNull(),
}, (t) => [primaryKey({ columns: [t.editionId, t.articleKey] })]);

// ───────────── Аудио ─────────────

export const voiceProfiles = pgTable('voice_profiles', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  gender: text('gender').notNull(),
  quality: text('quality').notNull(),
  license: text('license').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
});

export const audioTracks = pgTable('audio_tracks', {
  id: serial('id').primaryKey(),
  editionId: integer('edition_id').notNull().references(() => documentEditions.id, { onDelete: 'cascade' }),
  voiceId: text('voice_id').notNull().references(() => voiceProfiles.id),
  trackKey: text('track_key').notNull(),
  kind: text('kind').notNull(),
  articleKey: text('article_key'),
  chapterKey: text('chapter_key').notNull(),
  title: text('title').notNull(),
  order: integer('order').notNull(),
  path: text('path').notNull(),
  durationMs: integer('duration_ms').notNull(),
  bytes: integer('bytes').notNull(),
  sha256: text('sha256').notNull(),
  segments: jsonb('segments').notNull(),
  status: text('status').notNull().default('ready'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('audio_tracks_uq').on(t.editionId, t.voiceId, t.trackKey)]);

/** Непрерывный файл всей книги для голоса (склейка треков) — для фонового прослушивания без смены источника. */
export const audioBooks = pgTable('audio_books', {
  editionId: integer('edition_id').notNull().references(() => documentEditions.id, { onDelete: 'cascade' }),
  voiceId: text('voice_id').notNull().references(() => voiceProfiles.id),
  path: text('path').notNull(),
  durationMs: integer('duration_ms').notNull(),
  bytes: integer('bytes').notNull(),
  sha256: text('sha256').notNull(),
  /** Начало каждого трека в файле книги, мс. */
  offsets: jsonb('offsets').$type<Record<string, number>>().notNull(),
  status: text('status').notNull().default('ready'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.editionId, t.voiceId] })]);

// ───────────── Прогресс прослушивания ─────────────

/** Место остановки в документе (одно на пользователя и документ). */
export const listeningProgress = pgTable('listening_progress', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  documentId: text('document_id').notNull().references(() => legalDocuments.id, { onDelete: 'cascade' }),
  editionId: integer('edition_id').notNull().references(() => documentEditions.id, { onDelete: 'cascade' }),
  trackKey: text('track_key').notNull(),
  positionMs: integer('position_ms').notNull().default(0),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.documentId] })]);

/** Прослушанность каждого трека (статьи): для отметок «прослушано» и статистики. */
export const trackProgress = pgTable('track_progress', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  editionId: integer('edition_id').notNull().references(() => documentEditions.id, { onDelete: 'cascade' }),
  trackKey: text('track_key').notNull(),
  listenedMs: integer('listened_ms').notNull().default(0),
  maxPositionMs: integer('max_position_ms').notNull().default(0),
  completedAt: ts('completed_at'),
  playCount: integer('play_count').notNull().default(0),
  lastPlayedAt: ts('last_played_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.editionId, t.trackKey] })]);

/** Активность по дням (для серий занятий и времени прослушивания). */
export const dailyActivity = pgTable('daily_activity', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  listenedMs: integer('listened_ms').notNull().default(0),
  reviews: integer('reviews').notNull().default(0),
  quizAnswers: integer('quiz_answers').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.userId, t.day] })]);

export const favorites = pgTable('favorites', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  documentId: text('document_id').notNull().references(() => legalDocuments.id, { onDelete: 'cascade' }),
  /** Пусто — избранный документ; иначе — статья. */
  articleKey: text('article_key').notNull().default(''),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('favorites_uq').on(t.userId, t.documentId, t.articleKey)]);

export const bookmarks = pgTable('bookmarks', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  editionId: integer('edition_id').notNull().references(() => documentEditions.id, { onDelete: 'cascade' }),
  trackKey: text('track_key').notNull(),
  positionMs: integer('position_ms').notNull(),
  note: text('note'),
  createdAt: createdAt(),
}, (t) => [index('bookmarks_user_idx').on(t.userId)]);

// ───────────── Запоминание ─────────────

export const memoryCards = pgTable('memory_cards', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => legalDocuments.id, { onDelete: 'cascade' }),
  editionKey: text('edition_key').notNull(),
  articleKey: text('article_key').notNull(),
  chapterKey: text('chapter_key').notNull(),
  type: text('type').notNull(),
  prompt: text('prompt').notNull(),
  options: jsonb('options').$type<string[]>(),
  answer: jsonb('answer').notNull(),
  explanation: text('explanation').notNull(),
  quote: text('quote').notNull(),
  sourceRef: text('source_ref').notNull(),
  difficulty: integer('difficulty').notNull().default(2),
  tier: text('tier').notNull().default('free'),
  sort: integer('sort').notNull().default(0),
  active: boolean('active').notNull().default(true),
}, (t) => [index('memory_cards_article_idx').on(t.articleKey)]);

export const quizAttempts = pgTable('quiz_attempts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull(),
  scopeKey: text('scope_key').notNull(),
  editionKey: text('edition_key').notNull(),
  cardIds: jsonb('card_ids').$type<string[]>().notNull(),
  total: integer('total').notNull(),
  correct: integer('correct').notNull().default(0),
  startedAt: ts('started_at').notNull().defaultNow(),
  finishedAt: ts('finished_at'),
}, (t) => [index('quiz_attempts_user_idx').on(t.userId)]);

export const quizAnswers = pgTable('quiz_answers', {
  id: serial('id').primaryKey(),
  attemptId: integer('attempt_id').notNull().references(() => quizAttempts.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  cardId: text('card_id').notNull().references(() => memoryCards.id, { onDelete: 'cascade' }),
  answer: jsonb('answer').notNull(),
  isCorrect: boolean('is_correct').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('quiz_answers_uq').on(t.attemptId, t.cardId)]);

export const reviewStates = pgTable('review_states', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  cardId: text('card_id').notNull().references(() => memoryCards.id, { onDelete: 'cascade' }),
  state: text('state').notNull(),
  dueAt: ts('due_at').notNull(),
  intervalDays: real('interval_days').notNull().default(0),
  ease: real('ease').notNull().default(2.5),
  reps: integer('reps').notNull().default(0),
  lapses: integer('lapses').notNull().default(0),
  lastReviewedAt: ts('last_reviewed_at'),
}, (t) => [primaryKey({ columns: [t.userId, t.cardId] }), index('review_states_due_idx').on(t.userId, t.dueAt)]);

export const reviewLogs = pgTable('review_logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  cardId: text('card_id').notNull().references(() => memoryCards.id, { onDelete: 'cascade' }),
  grade: integer('grade').notNull(),
  isCorrect: boolean('is_correct').notNull(),
  elapsedDays: real('elapsed_days').notNull(),
  prevIntervalDays: real('prev_interval_days').notNull(),
  newIntervalDays: real('new_interval_days').notNull(),
  createdAt: createdAt(),
}, (t) => [index('review_logs_user_idx').on(t.userId, t.createdAt)]);

// ───────────── Монетизация ─────────────

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priceStars: integer('price_stars').notNull(),
  priceRubHint: integer('price_rub_hint').notNull(),
  periodDays: integer('period_days').notNull(),
  recurring: boolean('recurring').notNull().default(false),
  features: jsonb('features').$type<string[]>().notNull(),
  badge: text('badge'),
  active: boolean('active').notNull().default(true),
  sort: integer('sort').notNull().default(0),
});

export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => products.id),
  status: text('status').notNull(),
  source: text('source').notNull(),
  startedAt: ts('started_at').notNull().defaultNow(),
  currentPeriodEnd: ts('current_period_end').notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  telegramChargeId: text('telegram_charge_id'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('subscriptions_user_idx').on(t.userId)]);

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => products.id),
  payload: text('payload').notNull(),
  status: text('status').notNull(),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull(),
  isTest: boolean('is_test').notNull().default(false),
  telegramChargeId: text('telegram_charge_id'),
  providerChargeId: text('provider_charge_id'),
  isRecurring: boolean('is_recurring').notNull().default(false),
  isFirstRecurring: boolean('is_first_recurring').notNull().default(false),
  subscriptionExpiresAt: ts('subscription_expires_at'),
  createdAt: createdAt(),
  paidAt: ts('paid_at'),
  refundedAt: ts('refunded_at'),
}, (t) => [
  uniqueIndex('payments_charge_uq').on(t.telegramChargeId),
  index('payments_payload_idx').on(t.payload),
  index('payments_user_idx').on(t.userId),
]);

/** Журнал входящих платёжных событий (повторная доставка того же update_id игнорируется). */
export const paymentEvents = pgTable('payment_events', {
  id: serial('id').primaryKey(),
  source: text('source').notNull(),
  externalId: text('external_id').notNull(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull(),
  receivedAt: ts('received_at').notNull().defaultNow(),
  processedAt: ts('processed_at'),
  error: text('error'),
}, (t) => [uniqueIndex('payment_events_uq').on(t.source, t.externalId)]);

// ───────────── Реферальная программа ─────────────

/**
 * Приглашения: у приглашённого может быть только один пригласивший.
 * Бонусы (по 7 дней Pro) начисляются, когда приглашённый дослушает первую статью.
 */
export const referrals = pgTable('referrals', {
  id: serial('id').primaryKey(),
  inviterId: integer('inviter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  inviteeId: integer('invitee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** mini_app — start_param в initData; bot — команда /start ref_<код>. */
  channel: text('channel').notNull(),
  createdAt: createdAt(),
  /** Приглашённый дослушал первую статью — его бонус начислен. */
  qualifiedAt: ts('qualified_at'),
  /** Бонус пригласившему начислен (false — приглашённый ещё не дослушал статью или исчерпан лимит бонусов). */
  inviterRewarded: boolean('inviter_rewarded').notNull().default(false),
}, (t) => [uniqueIndex('referrals_invitee_uq').on(t.inviteeId), index('referrals_inviter_idx').on(t.inviterId)]);

// ───────────── Будущие аудиокниги: заявки и голосование ─────────────

export const audioRequests = pgTable('audio_requests', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  documentId: text('document_id').notNull().references(() => legalDocuments.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
  notifiedAt: ts('notified_at'),
}, (t) => [primaryKey({ columns: [t.userId, t.documentId] })]);

export const votes = pgTable('votes', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  documentId: text('document_id').notNull().references(() => legalDocuments.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.userId, t.documentId] }), index('votes_document_idx').on(t.documentId)]);

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: createdAt(),
  sentAt: ts('sent_at'),
  error: text('error'),
}, (t) => [index('notifications_status_idx').on(t.status)]);

// ───────────── Аналитика, обратная связь, аудит ─────────────

export const analyticsEvents = pgTable('analytics_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  props: jsonb('props').notNull().default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
}, (t) => [index('analytics_events_name_idx').on(t.name, t.createdAt), index('analytics_events_user_idx').on(t.userId, t.createdAt)]);

export const feedback = pgTable('feedback', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  message: text('message').notNull(),
  context: jsonb('context'),
  createdAt: createdAt(),
});

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  data: jsonb('data'),
  createdAt: createdAt(),
}, (t) => [index('audit_log_entity_idx').on(t.entity, t.entityId)]);

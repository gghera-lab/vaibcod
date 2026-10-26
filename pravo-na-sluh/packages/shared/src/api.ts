// Типы ответов API, общие для сервера и Mini App.

import type { TextUnit } from './constitution.ts';
import type { ManifestSegment } from './audio.ts';

export type CategoryId = 'constitution' | 'codes' | 'fkz' | 'federal_laws' | 'president' | 'government' | 'agency' | 'other';

export const CATEGORIES: { id: CategoryId; title: string; hint: string }[] = [
  { id: 'constitution', title: 'Конституция', hint: 'Основной закон' },
  { id: 'codes', title: 'Кодексы', hint: 'ГК, УК, ТК, НК и другие' },
  { id: 'fkz', title: 'Федеральные конституционные законы', hint: 'ФКЗ' },
  { id: 'federal_laws', title: 'Федеральные законы', hint: 'ФЗ и законы РФ' },
  { id: 'president', title: 'Акты Президента РФ', hint: 'Указы' },
  { id: 'government', title: 'Акты Правительства РФ', hint: 'Постановления' },
  { id: 'agency', title: 'Ведомственные акты', hint: 'Приказы ФОИВ' },
  { id: 'other', title: 'Другие документы', hint: 'Иные нормативные акты' },
];

export type PaymentsMode = 'stars' | 'sandbox' | 'disabled';

export interface PublicConfig {
  env: string;
  botUsername: string | null;
  paymentsMode: PaymentsMode;
  devAuth: boolean;
  supportContact: string;
  termsVersion: string;
}

export interface SettingsDto {
  voiceId: string | null;
  playbackRate: number;
  chapterChime: boolean;
  autoAdvance: boolean;
  notifyReviews: boolean;
  notifyAudioReleases: boolean;
  notifyContinue: boolean;
  theme: 'auto' | 'light' | 'dark';
  dailyGoalMin: number;
}

export interface EntitlementDto {
  pro: boolean;
  until: string | null;
  productId: string | null;
  source: string | null;
  status: 'none' | 'active' | 'canceled' | 'expired' | 'refunded';
  cancelAtPeriodEnd: boolean;
  isTest: boolean;
}

export interface MeDto {
  user: {
    id: number;
    firstName: string | null;
    username: string | null;
    isDevUser: boolean;
    onboarded: boolean;
    termsAccepted: boolean;
    analyticsOptOut: boolean;
    createdAt: string;
  };
  settings: SettingsDto;
  entitlement: EntitlementDto;
  isAdmin: boolean;
}

export interface DocumentDto {
  id: string;
  title: string;
  shortTitle: string;
  category: CategoryId;
  docType: string;
  number: string | null;
  adoptedAt: string | null;
  publication: string | null;
  description: string;
  status: string;
  statusNote: string | null;
  officialUrl: string | null;
  sourceName: string | null;
  verifiedAt: string | null;
  verificationNote: string | null;
  audioStatus: 'available' | 'in_production';
  hasText: boolean;
  isFavorite: boolean;
  votes: number;
  voted: boolean;
  notify: boolean;
}

export interface EditionDto {
  key: string;
  label: string;
  note: string | null;
  sourceUrl: string;
  retrievedAt: string;
  verifiedAt: string | null;
  verification: { structureOk: boolean; matched: number; total: number; unexplained: number } | null;
}

export interface TocArticleDto {
  key: string;
  number: string | null;
  title: string;
  kind: string;
  status: string;
  firstLine: string;
  completed: boolean;
  listenedPct: number;
  favorite: boolean;
}

export interface TocChapterDto {
  key: string;
  sectionTitle: string;
  number: number | null;
  title: string;
  notes: string[];
  articles: TocArticleDto[];
}

/** Найденное место в тексте статьи: фрагмент вокруг совпадения (before + match + after). */
export interface ArticleSearchHitDto {
  key: string;
  title: string;
  before: string;
  match: string;
  after: string;
}

export interface ConstitutionTocDto {
  documentId: string;
  title: string;
  adoption: string;
  edition: EditionDto;
  chapters: TocChapterDto[];
}

export interface ArticleDto {
  key: string;
  number: string | null;
  title: string;
  kind: string;
  status: string;
  chapterKey: string;
  chapterTitle: string;
  units: TextUnit[];
  notes: string[];
  prevKey: string | null;
  nextKey: string | null;
  favorite: boolean;
  cardsCount: number;
  editionLabel: string;
}

export interface VoiceDto {
  id: string;
  title: string;
  description: string;
  quality: 'beta' | 'production';
  license: string;
  available: boolean;
}

export interface TrackDto {
  key: string;
  kind: 'intro' | 'chapter_intro' | 'article';
  articleKey: string | null;
  chapterKey: string;
  title: string;
  url: string;
  durationMs: number;
  segments: ManifestSegment[];
  /** Начало трека в непрерывном файле книги, мс (null — книги нет). */
  bookOffsetMs: number | null;
}

export interface PlaylistDto {
  documentId: string;
  editionKey: string;
  status: 'ready' | 'partial' | 'unavailable';
  voice: VoiceDto | null;
  voices: VoiceDto[];
  tracks: TrackDto[];
  totalDurationMs: number;
  /** Непрерывный файл книги: плеер играет его без смены источника (фоновое прослушивание). */
  book: { url: string; durationMs: number } | null;
}

export interface ProgressDto {
  trackKey: string;
  positionMs: number;
  updatedAt: string;
  editionKey: string;
}

export interface BookmarkDto {
  id: number;
  trackKey: string;
  trackTitle: string;
  positionMs: number;
  note: string | null;
  createdAt: string;
}

export interface FavoritesDto {
  documents: DocumentDto[];
  articles: { documentId: string; articleKey: string; title: string; firstLine: string; createdAt: string }[];
  bookmarks: BookmarkDto[];
}

export type CardType = 'single' | 'truefalse' | 'cloze' | 'recall';

export interface CardDto {
  id: string;
  type: CardType;
  prompt: string;
  options: string[] | null;
  articleKey: string;
  chapterKey: string;
  sourceRef: string;
  tier: 'free' | 'pro';
  /** Для «recall»: эталон показывается только после ответа. */
  state?: string;
  intervals?: Record<1 | 2 | 3 | 4, number>;
}

export interface AnswerResultDto {
  correct: boolean;
  correctAnswer: string;
  explanation: string;
  quote: string;
  sourceRef: string;
  articleKey: string;
  editionLabel: string;
}

export interface ChapterMasteryDto {
  chapterKey: string;
  title: string;
  cards: number;
  locked: boolean;
  seen: number;
  accuracy: number | null;
}

export interface MemoryOverviewDto {
  dueNow: number;
  newAvailable: number;
  totalCards: number;
  lockedCards: number;
  reviewedToday: number;
  chapters: ChapterMasteryDto[];
  difficult: { articleKey: string; title: string; errors: number; accuracy: number }[];
  history: { id: number; scope: string; scopeKey: string; title: string; total: number; correct: number; finishedAt: string }[];
}

export interface StatsDto {
  listenedMs: number;
  articlesCompleted: number;
  articlesTotal: number;
  streakDays: number;
  activeDays: number;
  quizzes: { finished: number; avgPct: number | null; best: number | null };
  reviews: { total: number; accuracy: number | null; dueNow: number };
  favorites: number;
  /** Расширенная статистика (Pro): точность повторений по интервалам. */
  retention: { bucket: string; answers: number; accuracy: number }[] | null;
  last14Days: { day: string; listenedMs: number; reviews: number; quizAnswers: number }[];
}

export interface ProductDto {
  id: string;
  title: string;
  description: string;
  priceStars: number;
  priceRubHint: number;
  periodDays: number;
  recurring: boolean;
  features: string[];
  badge: string | null;
}

export interface PaymentDto {
  id: number;
  productId: string;
  productTitle: string;
  status: string;
  amount: number;
  currency: string;
  isTest: boolean;
  createdAt: string;
  paidAt: string | null;
}

export interface ReferralDto {
  /** Ссылка-приглашение в Mini App (null — у сервера не задан BOT_USERNAME). */
  link: string | null;
  code: string;
  bonusDays: number;
  /** Друзей, открывших приложение по ссылке. */
  invited: number;
  /** Из них дослушали первую статью (бонус другу начислен). */
  qualified: number;
  /** Бонусов, полученных пригласившим, и их предел. */
  rewarded: number;
  maxRewards: number;
}

export type InvoiceDto =
  | { mode: 'stars'; paymentId: number; invoiceUrl: string }
  | { mode: 'sandbox'; paymentId: number; amount: number; productTitle: string };

export const ANALYTICS_EVENTS = [
  'app_open', 'onboarding_complete', 'listen_start', 'listen_pause', 'listen_resume', 'listen_session', 'article_complete',
  'article_replay', 'quiz_start', 'quiz_finish', 'review_answer', 'favorite_add', 'favorite_remove', 'audio_notify_request',
  'vote_cast', 'paywall_view', 'purchase_start', 'purchase_complete', 'purchase_cancel', 'purchase_failed', 'playback_error',
  'document_open', 'document_listen_unavailable', 'search', 'bookmark_add', 'sleep_timer_set', 'speed_change', 'voice_change',
  'referral_share',
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

// Формат сценария озвучивания (content/constitution/speech/script.json).
// Сценарий не зависит от TTS-провайдера: паузы и ударения задаются нейтрально,
// адаптеры превращают их в SSML / разметку конкретного сервиса.

export interface SpeechPiece {
  /** Произносимый текст (с «ё» и знаками ударения U+0301). */
  text: string;
  /** Пауза после фрагмента внутри сегмента, мс. */
  pauseMs: number;
}

export type SegmentRole = 'heading' | 'title' | 'unit' | 'notice';

export interface SpeechSegment {
  /** Стабильный id сегмента: art-1/title, art-1/u1. */
  id: string;
  role: SegmentRole;
  /** Единица текста Конституции, которую озвучивает сегмент (для подсветки текста). */
  unitId: string | null;
  /** Что показываем пользователю (исходный текст). */
  display: string;
  pieces: SpeechPiece[];
  /** Пауза после сегмента, мс (тишина вставляется при сборке трека). */
  pauseAfterMs: number;
  /** Темп относительно нормального (1 = как задано голосом). */
  rate: number;
}

export type TrackKind = 'intro' | 'chapter_intro' | 'article';

export interface SpeechTrack {
  /** intro, chapter-1, art-67.1, preamble, final-3 */
  id: string;
  kind: TrackKind;
  articleId: string | null;
  chapterId: string;
  title: string;
  order: number;
  leadInMs: number;
  tailMs: number;
  segments: SpeechSegment[];
}

export interface SpeechScript {
  documentId: string;
  editionId: string;
  generatedAt: string;
  lexiconVersion: string;
  tracks: SpeechTrack[];
}

/** Хэш-ключ сегмента для кеша синтеза: меняется только при изменении произносимого содержимого. */
export function segmentCacheKey(seg: SpeechSegment): string {
  return JSON.stringify({ p: seg.pieces, r: seg.rate });
}

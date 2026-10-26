// Манифест аудиокниги: связывает треки (файлы) с редакцией текста и единицами текста (таймкоды).

export interface ManifestSegment {
  id: string;
  unitId: string | null;
  role: string;
  startMs: number;
  endMs: number;
}

export interface ManifestTrack {
  id: string;
  kind: 'intro' | 'chapter_intro' | 'article';
  articleId: string | null;
  chapterId: string;
  title: string;
  order: number;
  /** Путь относительно каталога манифеста. */
  file: string;
  durationMs: number;
  bytes: number;
  sha256: string;
  segments: ManifestSegment[];
  loudness: { activeRmsDb: number; peakDb: number; gainDb: number };
}

export interface AudioManifest {
  documentId: string;
  editionId: string;
  voice: { id: string; title: string; provider: string; quality: 'beta' | 'production'; license: string };
  generatedAt: string;
  lexiconVersion: string;
  format: { codec: 'mp3'; sampleRate: number; bitrateKbps: number; channels: 1 };
  totals: { tracks: number; durationMs: number; bytes: number };
  tracks: ManifestTrack[];
  /** Непрерывный файл всей книги (склейка треков) и начало каждого трека в нём, мс. */
  book?: { file: string; bytes: number; sha256: string; durationMs: number; offsets: Record<string, number> };
}

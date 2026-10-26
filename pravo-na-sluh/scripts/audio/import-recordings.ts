// npm run audio:import -- --voice narrator-ivanov --dir ./recordings
//
// Импорт записей профессионального диктора: в папке лежат файлы по трекам сценария
// (intro.wav, chapter-ch-1.wav, preamble.wav, art-1.wav … final-9.wav; допускается .mp3).
// WAV (PCM 16 бит) нормализуется и кодируется в MP3; MP3 копируется как есть.
// Таймкоды фрагментов для подсветки текста оцениваются пропорционально длине текста
// (точную разметку можно загрузить позже). Голос должен быть описан в content/voices.json
// с provider "recorded" и лицензией на использование записи.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AudioManifest, ManifestTrack, SpeechScript } from '@pravo/shared';
import { buildBook } from './lib/book.ts';
import { analyze, normalize } from './lib/dsp.ts';
import { bitrateFor, encodeMp3, parseMp3 } from './lib/mp3.ts';
import { readWav } from './lib/wav.ts';
import { audioDir, loadVoices } from './synthesize.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

const voiceId = arg('voice');
const src = arg('dir');
if (!voiceId || !src) {
  console.error('Использование: npm run audio:import -- --voice <id из voices.json> --dir <папка с записями>');
  process.exit(1);
}
const voice = loadVoices().find((v) => v.id === voiceId);
if (!voice || voice.provider !== 'recorded') {
  console.error(`Голос ${voiceId} не найден в content/voices.json или его provider не "recorded"`);
  process.exit(1);
}
const script: SpeechScript = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/constitution/speech/script.json'), 'utf8'));
const outDir = audioDir(script.editionId, voice.id);
fs.mkdirSync(outDir, { recursive: true });
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

const tracks: ManifestTrack[] = [];
const missing: string[] = [];
let sampleRate = 0;
for (const t of script.tracks) {
  const wav = path.join(src, `${t.id}.wav`);
  const mp3 = path.join(src, `${t.id}.mp3`);
  let data: Buffer;
  let durationMs: number;
  let loud = { activeRmsDb: 0, peakDb: 0, gainDb: 0 };
  if (fs.existsSync(wav)) {
    const pcm = readWav(fs.readFileSync(wav));
    sampleRate ||= pcm.sampleRate;
    const { samples, gainDb } = normalize(pcm.samples, pcm.sampleRate);
    const l = analyze(samples, pcm.sampleRate);
    loud = { activeRmsDb: +l.activeRmsDb.toFixed(2), peakDb: +l.peakDb.toFixed(2), gainDb: +gainDb.toFixed(2) };
    data = encodeMp3(samples, pcm.sampleRate);
    durationMs = Math.round((samples.length / pcm.sampleRate) * 1000);
  } else if (fs.existsSync(mp3)) {
    data = fs.readFileSync(mp3);
    const info = parseMp3(data);
    sampleRate ||= info.sampleRate;
    durationMs = info.durationMs;
  } else {
    missing.push(t.id);
    continue;
  }
  // Оценка таймкодов: пропорционально числу символов (без учёта пауз) — помечается как приблизительная.
  const lens = t.segments.map((s) => s.pieces.reduce((x, p) => x + p.text.length, 0));
  const total = lens.reduce((s, x) => s + x, 0) || 1;
  let cursor = 0;
  const segments = t.segments.map((s, i) => {
    const len = Math.round((lens[i] / total) * durationMs);
    const seg = { id: s.id, unitId: s.unitId, role: s.role, startMs: cursor, endMs: cursor + len };
    cursor += len;
    return seg;
  });
  const file = `${t.id}.mp3`;
  fs.writeFileSync(path.join(outDir, file), data);
  tracks.push({ id: t.id, kind: t.kind, articleId: t.articleId, chapterId: t.chapterId, title: t.title, order: t.order, file, durationMs, bytes: data.length, sha256: sha(data), segments, loudness: loud });
}

const manifest: AudioManifest = {
  documentId: script.documentId, editionId: script.editionId,
  voice: { id: voice.id, title: voice.title, provider: voice.provider, quality: voice.quality, license: voice.license },
  generatedAt: new Date().toISOString(), lexiconVersion: `recorded:${script.lexiconVersion}`,
  format: { codec: 'mp3', sampleRate: sampleRate || 44100, bitrateKbps: bitrateFor(sampleRate || 44100), channels: 1 },
  totals: { tracks: tracks.length, durationMs: tracks.reduce((s, t) => s + t.durationMs, 0), bytes: tracks.reduce((s, t) => s + t.bytes, 0) },
  tracks,
};
if (!missing.length) manifest.book = buildBook(outDir, manifest);
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Импортировано треков: ${tracks.length}/${script.tracks.length}${missing.length ? `; нет записей: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? '…' : ''}` : '; файл книги собран'}`);
console.log('Дальше: npm run audio:qc и перезапуск сервера (данные загрузятся автоматически).');

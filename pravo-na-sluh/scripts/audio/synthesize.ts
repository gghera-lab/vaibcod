// npm run audio:synthesize -- [--voice onecore-pavel] [--tracks art-1,art-2] [--dry-run]
//
// Конвейер: сценарий → синтез сегментов (с кешем) → обрезка тишины и паузы по сценарию →
// нормализация громкости → MP3 → манифест с таймкодами сегментов.
// Изменился текст или словарь → пересинтезируются только изменённые сегменты (ключ кеша = хэш содержимого).

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AudioManifest, ManifestTrack, SpeechScript, SpeechTrack } from '@pravo/shared';
import { segmentCacheKey } from '@pravo/shared';
import { buildBook } from './lib/book.ts';
import { analyze, fade, normalize, silence, trimSilence } from './lib/dsp.ts';
import { bitrateFor, encodeMp3 } from './lib/mp3.ts';
import { readWav, resample } from './lib/wav.ts';
import type { SynthesisJob, TtsProvider, VoiceProfile } from './providers/types.ts';
import { windowsOneCore } from './providers/windows-onecore.ts';
import { yandexSpeechKit } from './providers/yandex-speechkit.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PROVIDERS: Record<string, TtsProvider> = { 'windows-onecore': windowsOneCore, 'yandex-speechkit': yandexSpeechKit };

export function loadVoices(): VoiceProfile[] {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'content/voices.json'), 'utf8')).voices;
}

export function audioDir(editionId: string, voiceId: string) {
  return path.join(ROOT, 'storage/audio/constitution', editionId, voiceId);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

async function main() {
  if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));
  const voices = loadVoices();
  const voice = voices.find((v) => v.id === (arg('voice') ?? voices.find((x) => x.default)!.id));
  if (!voice) throw new Error(`Голос не найден. Доступны: ${voices.map((v) => v.id).join(', ')}`);
  const provider = PROVIDERS[voice.provider];
  if (!provider) throw new Error(`Провайдер ${voice.provider} не поддерживает синтез (для записей диктора используйте audio:import)`);

  const script: SpeechScript = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/constitution/speech/script.json'), 'utf8'));
  const only = arg('tracks')?.split(',');
  const tracks = script.tracks.filter((t) => !only || only.includes(t.id));
  const cacheDir = path.join(ROOT, 'storage/cache/tts', voice.id);
  fs.mkdirSync(cacheDir, { recursive: true });

  const keyOf = (seg: SpeechTrack['segments'][number]) =>
    sha256(`${provider.renderVersion}|${voice.provider}|${voice.providerVoice}|${voice.role ?? ''}|${segmentCacheKey(seg)}`).slice(0, 32);

  const jobs: SynthesisJob[] = [];
  const seen = new Set<string>();
  for (const t of tracks) for (const seg of t.segments) {
    const key = keyOf(seg);
    const outWav = path.join(cacheDir, `${key}.wav`);
    if (!fs.existsSync(outWav) && !seen.has(key)) { jobs.push({ key, segment: seg, outWav }); seen.add(key); }
  }
  const total = tracks.reduce((s, t) => s + t.segments.length, 0);
  console.log(`Голос: ${voice.title} (${voice.provider}). Треков: ${tracks.length}, сегментов: ${total}, к синтезу: ${jobs.length}, из кеша: ${total - jobs.length}`);
  console.log(`Оценка стоимости синтеза: ${provider.estimateCostRub(jobs).toFixed(2)} ₽`);
  if (process.argv.includes('--dry-run')) return;

  const t0 = Date.now();
  if (jobs.length) await provider.synthesize(jobs, voice, (s) => console.log(s));
  console.log(`Синтез: ${((Date.now() - t0) / 1000).toFixed(1)} с`);

  // Сборка треков
  const outDir = audioDir(script.editionId, voice.id);
  fs.mkdirSync(outDir, { recursive: true });
  const manifestPath = path.join(outDir, 'manifest.json');
  const prev: AudioManifest | null = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
  const built = new Map<string, ManifestTrack>((prev?.tracks ?? []).map((t) => [t.id, t]));
  let sampleRate = 0;

  for (const t of tracks) {
    const parts: Int16Array[] = [];
    const segs: ManifestTrack['segments'] = [];
    let cursor = 0;
    const push = (a: Int16Array) => { parts.push(a); cursor += a.length; };
    for (const seg of t.segments) {
      let pcm = readWav(fs.readFileSync(path.join(cacheDir, `${keyOf(seg)}.wav`)));
      if (!sampleRate) sampleRate = pcm.sampleRate;
      pcm = fade(trimSilence(resample(pcm, sampleRate)));
      if (!parts.length) push(silence(sampleRate, t.leadInMs));
      const start = cursor;
      push(pcm.samples);
      segs.push({ id: seg.id, unitId: seg.unitId, role: seg.role, startMs: Math.round((start / sampleRate) * 1000), endMs: Math.round((cursor / sampleRate) * 1000) });
      if (seg.pauseAfterMs) push(silence(sampleRate, seg.pauseAfterMs));
    }
    push(silence(sampleRate, t.tailMs));
    const joined = new Int16Array(cursor);
    let o = 0;
    for (const p of parts) { joined.set(p, o); o += p.length; }
    const { samples, gainDb } = normalize(joined, sampleRate);
    const l = analyze(samples, sampleRate);
    const mp3 = encodeMp3(samples, sampleRate);
    const file = `${t.id}.mp3`;
    fs.writeFileSync(path.join(outDir, file), mp3);
    built.set(t.id, {
      id: t.id, kind: t.kind, articleId: t.articleId, chapterId: t.chapterId, title: t.title, order: t.order, file,
      durationMs: Math.round((samples.length / sampleRate) * 1000), bytes: mp3.length, sha256: sha256(mp3), segments: segs,
      loudness: { activeRmsDb: +l.activeRmsDb.toFixed(2), peakDb: +l.peakDb.toFixed(2), gainDb: +gainDb.toFixed(2) },
    });
  }

  const all = [...built.values()].filter((t) => script.tracks.some((s) => s.id === t.id)).sort((a, b) => a.order - b.order);
  const manifest: AudioManifest = {
    documentId: script.documentId,
    editionId: script.editionId,
    voice: { id: voice.id, title: voice.title, provider: voice.provider, quality: voice.quality, license: voice.license },
    generatedAt: new Date().toISOString(),
    lexiconVersion: script.lexiconVersion,
    format: { codec: 'mp3', sampleRate: sampleRate || prev?.format.sampleRate || 16000, bitrateKbps: bitrateFor(sampleRate || 16000), channels: 1 },
    totals: { tracks: all.length, durationMs: all.reduce((s, t) => s + t.durationMs, 0), bytes: all.reduce((s, t) => s + t.bytes, 0) },
    tracks: all,
  };
  if (all.length === script.tracks.length) {
    manifest.book = buildBook(outDir, manifest);
    console.log(`Книга одним файлом: ${(manifest.book.bytes / 1e6).toFixed(1)} МБ, ${Math.round(manifest.book.durationMs / 60000)} мин`);
  } else {
    console.log('Файл книги не собран: синтезированы не все треки (запустите без --tracks)');
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  const min = Math.round(manifest.totals.durationMs / 60000);
  console.log(`Готово: ${all.length}/${script.tracks.length} треков в манифесте, ${min} мин, ${(manifest.totals.bytes / 1e6).toFixed(1)} МБ → ${path.relative(ROOT, outDir)}`);
}

if (process.argv[1]?.endsWith('synthesize.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

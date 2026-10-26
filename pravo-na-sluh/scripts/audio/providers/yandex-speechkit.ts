// Адаптер Yandex SpeechKit API v3 (REST). Ключ: YANDEX_API_KEY (Api-Key сервисного аккаунта
// с ролью ai.speechkit-tts.user) или YANDEX_IAM_TOKEN + YANDEX_FOLDER_ID.
//
// Документация: https://yandex.cloud/ru/docs/speechkit/tts/api/tts-v3-rest
// Лимит запроса — 250 символов, оплата — за запрос. Поэтому короткие фрагменты сегмента
// («Часть первая.» + текст части) склеиваются в один запрос, а паузы сценария передаются
// разметкой sil<[мс]>. Длинные фрагменты делятся по границам предложений (затем — по «;», «:»,
// запятым, пробелам) на запросы до 240 символов; между запросами вставляется своя пауза.
// Ударение — «+» перед гласной. Звук — сырой PCM 16 бит 22 050 Гц (без контейнера, WAV собираем сами).

import fs from 'node:fs';
import type { SpeechSegment } from '@pravo/shared';
import { silence, trimSilence } from '../lib/dsp.ts';
import { writeWav } from '../lib/wav.ts';
import { stressToPlus, type SynthesisJob, type TtsProvider } from './types.ts';

const ENDPOINT = process.env.YANDEX_TTS_ENDPOINT ?? 'https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis';
const PRICE_PER_REQUEST_RUB = 0.1626; // API v3, модель general, с НДС (aistudio.yandex.ru/docs/ru/speechkit/pricing, проверено 2026-10-14)
export const SAMPLE_RATE = 22050;
const MAX_CHARS = 240;

export interface TtsChunk {
  text: string;
  /** Пауза после фрагмента, мс. */
  pauseMs: number;
  /** Пауза задана сценарием (а не появилась от деления длинного фрагмента). */
  scripted?: boolean;
}

const pauseFor = (s: string) => (/[.!?…]["»)]?$/.test(s) ? 280 : /[;:]$/.test(s) ? 220 : /[,—–-]$/.test(s) ? 130 : 80);

/** Делит текст на части ≤ max символов, стараясь резать по концу предложения. */
export function splitForTts(text: string, max = MAX_CHARS): string[] {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return [t];
  const levels = [/(?<=[.!?…]["»)]?)\s+/, /(?<=[;:])\s+/, /(?<=,)\s+|\s+(?=[—–]\s)/, /\s+/];
  const pack = (parts: string[], level: number): string[] => {
    const out: string[] = [];
    let cur = '';
    for (const p of parts) {
      if (p.length > max) {
        if (cur) { out.push(cur); cur = ''; }
        out.push(...pack(p.split(levels[Math.min(level + 1, levels.length - 1)]).filter(Boolean), level + 1));
        continue;
      }
      if (!cur) cur = p;
      else if (cur.length + 1 + p.length <= max) cur += ' ' + p;
      else { out.push(cur); cur = p; }
    }
    if (cur) out.push(cur);
    return out;
  };
  return pack(t.split(levels[0]).filter(Boolean), 0);
}

/** Запросы сегмента: фрагменты, упакованные в запросы ≤ 240 символов, и пауза после каждого запроса. */
export function segmentChunks(seg: SpeechSegment): TtsChunk[] {
  const units: TtsChunk[] = [];
  for (const piece of seg.pieces) {
    const parts = splitForTts(stressToPlus(piece.text));
    parts.forEach((text, i) => units.push(i === parts.length - 1 ? { text, pauseMs: piece.pauseMs, scripted: true } : { text, pauseMs: pauseFor(text) }));
  }
  const out: TtsChunk[] = [];
  let cur: TtsChunk | null = null;
  for (const u of units) {
    if (cur) {
      const joined: string = cur.text + (cur.scripted && cur.pauseMs ? ` sil<[${cur.pauseMs}]> ` : ' ') + u.text;
      if (joined.length <= MAX_CHARS) { cur = { ...u, text: joined }; continue; }
      out.push(cur);
    }
    cur = { ...u };
  }
  if (cur) out.push(cur);
  return out;
}

export function buildRequest(text: string, rate: number, voice: string, role?: string) {
  const hints: Record<string, unknown>[] = [{ voice }];
  if (role) hints.push({ role });
  if (rate !== 1) hints.push({ speed: rate });
  return {
    text,
    hints,
    outputAudioSpec: { rawAudio: { audioEncoding: 'LINEAR16_PCM', sampleRateHertz: SAMPLE_RATE } },
    loudnessNormalizationType: 'LUFS',
  };
}

function authHeaders(): Record<string, string> {
  if (process.env.YANDEX_API_KEY) return { Authorization: `Api-Key ${process.env.YANDEX_API_KEY}` };
  if (process.env.YANDEX_IAM_TOKEN && process.env.YANDEX_FOLDER_ID) {
    return { Authorization: `Bearer ${process.env.YANDEX_IAM_TOKEN}`, 'x-folder-id': process.env.YANDEX_FOLDER_ID };
  }
  throw new Error('Требуется подключение SpeechKit: задайте YANDEX_API_KEY или YANDEX_IAM_TOKEN + YANDEX_FOLDER_ID в .env');
}

/** Разбор ответа: поток JSON-объектов {"result":{"audioChunk":{"data":"<base64>"}}} (по строкам или массивом). */
export function parseAudioResponse(raw: string): Buffer {
  const objects: unknown[] = [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) objects.push(...(JSON.parse(trimmed) as unknown[]));
  else for (const line of trimmed.split(/\r?\n/)) if (line.trim()) objects.push(JSON.parse(line));
  const parts: Buffer[] = [];
  for (const o of objects) {
    const data = (o as { result?: { audioChunk?: { data?: string } } })?.result?.audioChunk?.data;
    if (data) parts.push(Buffer.from(data, 'base64'));
  }
  return Buffer.concat(parts);
}

let requestsMade = 0;

async function synthChunk(text: string, rate: number, voice: string, role: string | undefined, attempt = 1): Promise<Int16Array> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(buildRequest(text, rate, voice, role)),
  });
  requestsMade++;
  if (!res.ok) {
    const body = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1000 * attempt * attempt));
      return synthChunk(text, rate, voice, role, attempt + 1);
    }
    throw new Error(`SpeechKit ${res.status}: ${body.slice(0, 400)}`);
  }
  const pcm = parseAudioResponse(await res.text());
  if (pcm.length < 200) throw new Error(`SpeechKit вернул пустой звук для «${text.slice(0, 40)}…»`);
  return new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2)).slice();
}

async function synthesizeOne(job: SynthesisJob, voice: string, role: string | undefined) {
  const parts: Int16Array[] = [];
  const chunks = segmentChunks(job.segment);
  for (const [i, c] of chunks.entries()) {
    const pcm = await synthChunk(c.text, job.segment.rate, voice, role);
    // Собственные поля тишины SpeechKit на стыках запросов убираем, чтобы паузы были ровно по сценарию.
    parts.push(chunks.length > 1 ? trimSilence({ sampleRate: SAMPLE_RATE, samples: pcm }, -48, 30).samples : pcm);
    if (i < chunks.length - 1 && c.pauseMs) parts.push(silence(SAMPLE_RATE, c.pauseMs));
  }
  const total = parts.reduce((s, p) => s + p.length, 0);
  const samples = new Int16Array(total);
  let o = 0;
  for (const p of parts) { samples.set(p, o); o += p.length; }
  fs.writeFileSync(job.outWav, writeWav({ sampleRate: SAMPLE_RATE, samples }));
}

export const yandexSpeechKit: TtsProvider = {
  id: 'yandex-speechkit',
  renderVersion: 'speechkit-v3-pcm22k-pack240-v3',
  estimateCostRub: (jobs) => jobs.reduce((s, j) => s + segmentChunks(j.segment).length, 0) * PRICE_PER_REQUEST_RUB,
  async synthesize(jobs, voice, log) {
    authHeaders();
    const concurrency = Number(process.env.YANDEX_TTS_CONCURRENCY ?? 4);
    let done = 0;
    const queue = [...jobs];
    const before = requestsMade;
    await Promise.all(Array.from({ length: concurrency }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        await synthesizeOne(job, voice.providerVoice, voice.role);
        if (++done % 25 === 0 || done === jobs.length) log(`  синтезировано ${done}/${jobs.length} сегментов, запросов: ${requestsMade - before}`);
      }
    }));
    log(`  запросов к SpeechKit: ${requestsMade - before} (≈ ${((requestsMade - before) * PRICE_PER_REQUEST_RUB).toFixed(2)} ₽)`);
  },
};

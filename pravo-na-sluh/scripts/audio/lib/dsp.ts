// Простая обработка речи: обрезка тишины, плавные края, анализ громкости, усиление.

import type { Pcm } from './wav.ts';

export const dbfs = (v: number) => (v <= 0 ? -120 : 20 * Math.log10(v / 32768));

/** Обрезает тишину в начале и конце (порог в dBFS), оставляя небольшой запас. */
export function trimSilence(pcm: Pcm, thresholdDb = -48, marginMs = 40): Pcm {
  const thr = 32768 * Math.pow(10, thresholdDb / 20);
  const win = Math.max(1, Math.round(pcm.sampleRate * 0.01));
  const s = pcm.samples;
  const loud = (i: number) => {
    let acc = 0;
    const end = Math.min(s.length, i + win);
    for (let k = i; k < end; k++) acc += s[k] * s[k];
    return Math.sqrt(acc / Math.max(1, end - i)) > thr;
  };
  let start = 0;
  while (start < s.length && !loud(start)) start += win;
  let end = s.length - win;
  while (end > start && !loud(end)) end -= win;
  end += win;
  const margin = Math.round((pcm.sampleRate * marginMs) / 1000);
  start = Math.max(0, start - margin);
  end = Math.min(s.length, end + margin);
  if (end <= start) return { sampleRate: pcm.sampleRate, samples: new Int16Array(0) };
  return { sampleRate: pcm.sampleRate, samples: s.slice(start, end) };
}

export function fade(pcm: Pcm, ms = 6): Pcm {
  const n = Math.min(Math.round((pcm.sampleRate * ms) / 1000), Math.floor(pcm.samples.length / 2));
  const out = pcm.samples.slice();
  for (let i = 0; i < n; i++) {
    const g = i / n;
    out[i] = Math.round(out[i] * g);
    out[out.length - 1 - i] = Math.round(out[out.length - 1 - i] * g);
  }
  return { sampleRate: pcm.sampleRate, samples: out };
}

export function silence(sampleRate: number, ms: number): Int16Array {
  return new Int16Array(Math.max(0, Math.round((sampleRate * ms) / 1000)));
}

export interface Loudness {
  /** Пиковый уровень, dBFS. */
  peakDb: number;
  /** RMS по фрагментам речи (без пауз), dBFS — приближение к громкости речи. */
  activeRmsDb: number;
  /** Доля «тихих» 20-мс окон. */
  silenceRatio: number;
  /** Количество сэмплов на пределе (клиппинг). */
  clipped: number;
}

export function analyze(samples: Int16Array, sampleRate: number): Loudness {
  const win = Math.round(sampleRate * 0.02);
  let peak = 0, clipped = 0, activeSum = 0, activeN = 0, windows = 0, quiet = 0;
  const gate = 32768 * Math.pow(10, -45 / 20);
  for (let i = 0; i < samples.length; i += win) {
    let acc = 0;
    const end = Math.min(samples.length, i + win);
    for (let k = i; k < end; k++) {
      const v = samples[k];
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 32767) clipped++;
      acc += v * v;
    }
    const rms = Math.sqrt(acc / Math.max(1, end - i));
    windows++;
    if (rms > gate) { activeSum += acc; activeN += end - i; } else quiet++;
  }
  return {
    peakDb: dbfs(peak),
    activeRmsDb: activeN ? dbfs(Math.sqrt(activeSum / activeN)) : -120,
    silenceRatio: windows ? quiet / windows : 1,
    clipped,
  };
}

/**
 * Нормализация к целевой громкости речи: общий коэффициент усиления + пиковый лимитер
 * с упреждением (lookahead) и плавным восстановлением. Короткие пики приглушаются,
 * поэтому громкость речи поднимается без клиппинга.
 * Максимальное усиление ограничено, чтобы не поднимать шум в тихих фрагментах.
 */
export function normalize(
  samples: Int16Array,
  sampleRate: number,
  targetRmsDb = -19,
  peakCeilingDb = -1.5,
  maxGainDb = 12,
): { samples: Int16Array; gainDb: number } {
  const l = analyze(samples, sampleRate);
  if (l.activeRmsDb <= -100) return { samples, gainDb: 0 };
  const gainDb = Math.min(maxGainDb, targetRmsDb - l.activeRmsDb);
  const g = Math.pow(10, gainDb / 20);
  const ceiling = 32768 * Math.pow(10, peakCeilingDb / 20);
  const n = samples.length;

  // Требуемое ослабление в каждой точке после общего усиления.
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.abs(samples[i] * g);
    need[i] = a > ceiling ? ceiling / a : 1;
  }
  // Упреждение: минимум по окну вперёд (скользящий минимум через дек).
  const look = Math.max(1, Math.round(sampleRate * 0.003));
  const ahead = new Float32Array(n);
  const dq: number[] = [];
  let head = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (dq.length > head && need[dq[dq.length - 1]] >= need[i]) dq.pop();
    dq.push(i);
    while (dq[head] > i + look) head++;
    ahead[i] = need[dq[head]];
  }
  // Атака мгновенная (за счёт упреждения), восстановление ~80 мс.
  const releaseStep = 1 / (sampleRate * 0.08);
  const out = new Int16Array(n);
  let env = 1;
  for (let i = 0; i < n; i++) {
    env = ahead[i] < env ? ahead[i] : Math.min(ahead[i], env + releaseStep);
    out[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * g * env)));
  }
  return { samples: out, gainDb };
}

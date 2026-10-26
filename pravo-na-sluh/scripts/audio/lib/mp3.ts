// Кодирование MP3 (чистый JS, @breezystack/lamejs) и разбор кадров MP3 для контроля целостности.

import { Mp3Encoder } from '@breezystack/lamejs';

export function bitrateFor(sampleRate: number): number {
  if (sampleRate <= 16000) return 48;
  if (sampleRate <= 24000) return 64;
  return 96;
}

export function encodeMp3(samples: Int16Array, sampleRate: number, kbps = bitrateFor(sampleRate)): Buffer {
  const enc = new Mp3Encoder(1, sampleRate, kbps);
  const chunks: Uint8Array[] = [];
  const block = 1152 * 16;
  for (let i = 0; i < samples.length; i += block) {
    const out = enc.encodeBuffer(samples.subarray(i, i + block));
    if (out.length) chunks.push(Uint8Array.from(out));
  }
  const end = enc.flush();
  if (end.length) chunks.push(Uint8Array.from(end));
  return Buffer.concat(chunks);
}

const BITRATES: Record<string, number[]> = {
  // MPEG-1 Layer III, MPEG-2/2.5 Layer III
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

export interface Mp3Info {
  frames: number;
  durationMs: number;
  sampleRate: number;
  bitrateKbps: number;
  badBytes: number;
}

/** Проходит по кадрам MPEG Audio Layer III: проверяет синхрослова и считает длительность. */
export function parseMp3(buf: Buffer): Mp3Info {
  let pos = 0, frames = 0, samplesTotal = 0, badBytes = 0, sampleRate = 0, bitrate = 0;
  if (buf.toString('ascii', 0, 3) === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    pos = 10 + size;
  }
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) { pos++; badBytes++; continue; }
    const version = (buf[pos + 1] >> 3) & 0x03; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer = (buf[pos + 1] >> 1) & 0x03; // 1 = Layer III
    const brIdx = (buf[pos + 2] >> 4) & 0x0f;
    const srIdx = (buf[pos + 2] >> 2) & 0x03;
    const padding = (buf[pos + 2] >> 1) & 0x01;
    if (version === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) { pos++; badBytes++; continue; }
    const br = (version === 3 ? BITRATES.v1 : BITRATES.v2)[brIdx] * 1000;
    const sr = RATES[version][srIdx];
    const spf = version === 3 ? 1152 : 576;
    const len = Math.floor((spf / 8) * br / sr) + padding;
    if (len <= 4) { pos++; badBytes++; continue; }
    frames++;
    samplesTotal += spf;
    sampleRate = sr;
    bitrate = br / 1000;
    pos += len;
  }
  return { frames, durationMs: sampleRate ? Math.round((samplesTotal / sampleRate) * 1000) : 0, sampleRate, bitrateKbps: bitrate, badBytes };
}

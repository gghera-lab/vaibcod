// Чтение/запись WAV (PCM 16 бит, моно) без внешних зависимостей.

export interface Pcm {
  sampleRate: number;
  samples: Int16Array;
}

export function readWav(buf: Buffer): Pcm {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Не WAV-файл');
  let pos = 12;
  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | null = null;
  let data: Buffer | null = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = buf.subarray(pos + 8, Math.min(buf.length, pos + 8 + size));
    if (id === 'fmt ') {
      fmt = { format: body.readUInt16LE(0), channels: body.readUInt16LE(2), sampleRate: body.readUInt32LE(4), bits: body.readUInt16LE(14) };
    } else if (id === 'data') {
      data = body;
    }
    pos += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV без fmt/data');
  if (fmt.format !== 1 || fmt.bits !== 16) throw new Error(`Ожидался PCM 16 бит, получено format=${fmt.format} bits=${fmt.bits}`);
  const frames = Math.floor(data.length / 2 / fmt.channels);
  const samples = new Int16Array(frames);
  for (let i = 0; i < frames; i++) {
    if (fmt.channels === 1) samples[i] = data.readInt16LE(i * 2);
    else {
      let acc = 0;
      for (let c = 0; c < fmt.channels; c++) acc += data.readInt16LE((i * fmt.channels + c) * 2);
      samples[i] = Math.round(acc / fmt.channels);
    }
  }
  return { sampleRate: fmt.sampleRate, samples };
}

export function writeWav(pcm: Pcm): Buffer {
  const dataSize = pcm.samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(pcm.sampleRate, 24);
  buf.writeUInt32LE(pcm.sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < pcm.samples.length; i++) buf.writeInt16LE(pcm.samples[i], 44 + i * 2);
  return buf;
}

/** Линейная передискретизация (для выравнивания частоты фрагментов от разных провайдеров). */
export function resample(pcm: Pcm, rate: number): Pcm {
  if (pcm.sampleRate === rate) return pcm;
  const ratio = pcm.sampleRate / rate;
  const n = Math.floor(pcm.samples.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, pcm.samples.length - 1);
    const f = x - i0;
    out[i] = Math.round(pcm.samples[i0] * (1 - f) + pcm.samples[i1] * f);
  }
  return { sampleRate: rate, samples: out };
}

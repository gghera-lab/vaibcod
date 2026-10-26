// Сборка непрерывного файла всей книги из MP3 отдельных треков (без перекодирования).
// Нужен для фонового прослушивания: плеер не меняет источник между статьями, поэтому
// WebView не прерывает воспроизведение при заблокированном экране.
// Отдельные файлы статей остаются источником истины: заменили статью — пересоберите книгу (секунды).

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AudioManifest } from '@pravo/shared';
import { parseMp3 } from './mp3.ts';

export function buildBook(outDir: string, manifest: AudioManifest): NonNullable<AudioManifest['book']> {
  const parts: Buffer[] = [];
  const offsets: Record<string, number> = {};
  let cursorMs = 0;
  let sampleRate = 0;
  for (const t of [...manifest.tracks].sort((a, b) => a.order - b.order)) {
    const buf = fs.readFileSync(path.join(outDir, t.file));
    const info = parseMp3(buf);
    if (info.badBytes > 16) throw new Error(`${t.file}: повреждённые кадры MP3 (${info.badBytes} байт)`);
    if (sampleRate && info.sampleRate !== sampleRate) throw new Error(`${t.file}: другая частота дискретизации — склейка без перекодирования невозможна`);
    sampleRate = info.sampleRate;
    offsets[t.id] = cursorMs;
    cursorMs += info.durationMs;
    parts.push(buf);
  }
  const book = Buffer.concat(parts);
  const file = 'book.mp3';
  fs.writeFileSync(path.join(outDir, file), book);
  const check = parseMp3(book);
  return {
    file,
    bytes: book.length,
    sha256: createHash('sha256').update(book).digest('hex'),
    durationMs: check.durationMs,
    offsets,
  };
}

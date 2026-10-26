// npm run audio:book — пересобрать непрерывный файл книги из готовых MP3 статей
// (например, после замены отдельной статьи или импорта записи диктора). Перекодирования нет.

import fs from 'node:fs';
import path from 'node:path';
import type { AudioManifest } from '@pravo/shared';
import { buildBook } from './lib/book.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const base = path.join(ROOT, 'storage/audio/constitution');
if (!fs.existsSync(base)) {
  console.error('Аудио не найдено: storage/audio/constitution');
  process.exit(1);
}
for (const edition of fs.readdirSync(base)) {
  for (const voice of fs.readdirSync(path.join(base, edition))) {
    const dir = path.join(base, edition, voice);
    const mf = path.join(dir, 'manifest.json');
    if (!fs.existsSync(mf)) continue;
    const manifest: AudioManifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
    manifest.book = buildBook(dir, manifest);
    fs.writeFileSync(mf, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`${edition}/${voice}: book.mp3 ${(manifest.book.bytes / 1e6).toFixed(1)} МБ, ${Math.round(manifest.book.durationMs / 60000)} мин, треков ${Object.keys(manifest.book.offsets).length}`);
  }
}

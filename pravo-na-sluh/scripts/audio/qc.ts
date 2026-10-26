// npm run audio:qc — автоматический контроль качества аудиокниги + план ручного прослушивания.
// Проверяет: полноту (все треки сценария), целостность MP3, длительность против объёма текста,
// громкость и пики, монотонность таймкодов, соответствие файла книги трекам.
// Пишет content/constitution/audio-qc-<голос>.md.

import fs from 'node:fs';
import path from 'node:path';
import type { AudioManifest, SpeechScript } from '@pravo/shared';
import { parseMp3 } from './lib/mp3.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const script: SpeechScript = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/constitution/speech/script.json'), 'utf8'));
const base = path.join(ROOT, 'storage/audio/constitution', script.editionId);
const voices = fs.existsSync(base) ? fs.readdirSync(base).filter((v) => fs.existsSync(path.join(base, v, 'manifest.json'))) : [];
if (!voices.length) {
  console.error('Нет аудио для проверки: сначала npm run audio:synthesize');
  process.exit(1);
}

let failed = false;
for (const voice of voices) {
  const dir = path.join(base, voice);
  const m: AudioManifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const errors: string[] = [];
  const warnings: string[] = [];
  const byId = new Map(m.tracks.map((t) => [t.id, t]));

  // 1. Полнота
  const missing = script.tracks.filter((t) => !byId.has(t.id)).map((t) => t.id);
  if (missing.length) errors.push(`Нет треков: ${missing.join(', ')}`);
  const articleTracks = m.tracks.filter((t) => t.kind === 'article');
  if (articleTracks.length !== 152) errors.push(`Треков статей/преамбулы/пунктов: ${articleTracks.length} (ожидалось 152)`);

  // 2–5. Файлы, длительность, громкость, таймкоды
  const rows: string[] = [];
  const cps: number[] = [];
  for (const st of script.tracks) {
    const t = byId.get(st.id);
    if (!t) continue;
    const file = path.join(dir, t.file);
    if (!fs.existsSync(file)) { errors.push(`${t.id}: файл не найден`); continue; }
    const info = parseMp3(fs.readFileSync(file));
    if (info.badBytes > 16) errors.push(`${t.id}: повреждённые кадры MP3 (${info.badBytes} байт)`);
    if (Math.abs(info.durationMs - t.durationMs) > 200) warnings.push(`${t.id}: длительность файла ${info.durationMs} мс ≠ манифест ${t.durationMs} мс`);
    const chars = st.segments.reduce((s, g) => s + g.pieces.reduce((x, p) => x + p.text.length, 0), 0);
    const speechMs = t.segments.reduce((s, g) => s + (g.endMs - g.startMs), 0);
    const rate = chars / Math.max(1, speechMs / 1000);
    cps.push(rate);
    if (rate < 8 || rate > 20) warnings.push(`${t.id}: темп ${rate.toFixed(1)} симв/с вне диапазона 8–20 (возможен пропуск или «зажёванный» фрагмент)`);
    if (t.loudness.peakDb > -1) errors.push(`${t.id}: пик ${t.loudness.peakDb} dBFS (риск клиппинга)`);
    if (t.loudness.activeRmsDb < -24 || t.loudness.activeRmsDb > -16) warnings.push(`${t.id}: громкость речи ${t.loudness.activeRmsDb} dBFS вне −24…−16`);
    let prev = 0;
    for (const s of t.segments) {
      if (s.startMs < prev || s.endMs < s.startMs || s.endMs > t.durationMs) errors.push(`${t.id}: неверные таймкоды сегмента ${s.id}`);
      if (s.endMs - s.startMs < 300) warnings.push(`${t.id}: очень короткий сегмент ${s.id} (${s.endMs - s.startMs} мс)`);
      prev = s.endMs;
    }
    const segsScript = st.segments.map((s) => s.id).join(',');
    const segsFile = t.segments.map((s) => s.id).join(',');
    if (segsScript !== segsFile) errors.push(`${t.id}: состав сегментов не совпадает со сценарием — пересоберите аудио`);
    rows.push(`| ${t.id} | ${(t.durationMs / 1000).toFixed(1)} | ${rate.toFixed(1)} | ${t.loudness.activeRmsDb} | ${t.loudness.peakDb} |`);
  }

  // 6. Файл книги
  if (!m.book) warnings.push('Файл книги (book.mp3) не собран — фоновое прослушивание будет прерываться между статьями');
  else {
    const bookFile = path.join(dir, m.book.file);
    if (!fs.existsSync(bookFile)) errors.push('book.mp3 указан в манифесте, но файла нет');
    else {
      const info = parseMp3(fs.readFileSync(bookFile));
      if (info.badBytes > 64) errors.push(`book.mp3: повреждённые кадры (${info.badBytes} байт)`);
      const offs = script.tracks.map((t) => m.book!.offsets[t.id]);
      if (offs.some((o, i) => o == null || (i > 0 && o <= offs[i - 1]))) errors.push('book.mp3: смещения треков отсутствуют или не возрастают');
    }
  }

  // 7. План ручного прослушивания: случайная выборка + места с числами, буквами пунктов и омографами
  const seeded = (n: number) => { let x = n; return () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31; };
  const rnd = seeded(20261015);
  const sample = [...script.tracks].filter((t) => t.kind === 'article').sort(() => rnd() - 0.5).slice(0, 10).map((t) => t.id);
  const risky = ['art-22', 'art-56', 'art-67.1', 'art-71', 'art-81', 'art-95', 'art-103', 'art-112', 'art-125', 'final-1'];

  const avg = cps.reduce((s, x) => s + x, 0) / cps.length;
  const md = [
    `# Контроль качества аудио — ${m.voice.title} (${voice})`, '',
    `- Редакция текста: ${m.editionId}; версия словаря произношения: ${m.lexiconVersion}`,
    `- Голос: ${m.voice.provider}, качество: ${m.voice.quality === 'beta' ? 'бета (системный синтез, не для коммерческого распространения)' : 'продакшн'}`,
    `- Треков: ${m.tracks.length}, длительность: ${(m.totals.durationMs / 3600000).toFixed(2)} ч, объём: ${(m.totals.bytes / 1e6).toFixed(1)} МБ`,
    `- Формат: MP3 ${m.format.sampleRate} Гц, ${m.format.bitrateKbps} кбит/с, моно; файл книги: ${m.book ? `${(m.book.bytes / 1e6).toFixed(1)} МБ` : 'нет'}`,
    `- Средний темп речи: ${avg.toFixed(1)} символов/с`, '',
    `## Автоматические проверки: ${errors.length ? `❌ ошибок ${errors.length}` : '✅ ошибок нет'}, предупреждений: ${warnings.length}`, '',
    ...errors.map((e) => `- ❌ ${e}`), ...warnings.map((w) => `- ⚠️ ${w}`), '',
    '## Ручная проверка (обязательна перед публикацией)', '',
    'Прослушать на телефоне в наушниках и через динамик. Отмечать: ударения, числа, буквы пунктов, паузы между частями, щелчки на стыках, громкость.', '',
    `**Случайная выборка:** ${sample.join(', ')}`, '',
    `**Места повышенного риска (числа, «д¹», перечни, омографы):** ${risky.join(', ')}`, '',
    '- [ ] Номера статей и частей читаются верно («статья шестьдесят семь точка один», «часть первая»)',
    '- [ ] Числа в тексте склонены правильно («из четырёхсот пятидесяти депутатов», «более сорока восьми часов»)',
    '- [ ] Омографы: «права́ и свободы», «международного пра́ва», «де́ла», «о́рганы»',
    '- [ ] Буквы пунктов («пункт „бэ“») не путаются с союзами',
    '- [ ] Между статьями нет обрывов и щелчков; паузы после «Статья N.» заметны, но не затянуты',
    '- [ ] Громкость ровная, нет клиппинга; комфортно на скорости 1,5×',
    '- [ ] Подсветка текста в плеере совпадает с читаемым фрагментом', '',
    '## Треки', '', '| Трек | Длительность, с | Темп, симв/с | Громкость речи, dBFS | Пик, dBFS |', '|---|---|---|---|---|', ...rows, '',
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, `content/constitution/audio-qc-${voice}.md`), md);
  console.log(`${voice}: ошибок ${errors.length}, предупреждений ${warnings.length}, средний темп ${avg.toFixed(1)} симв/с → content/constitution/audio-qc-${voice}.md`);
  errors.slice(0, 10).forEach((e) => console.log('  ✗ ' + e));
  warnings.slice(0, 10).forEach((w) => console.log('  ! ' + w));
  if (errors.length) failed = true;
}
if (failed) process.exit(1);

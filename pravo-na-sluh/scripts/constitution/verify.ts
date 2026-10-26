// npm run constitution:verify
// 1) Структурная проверка полноты (главы, статьи, части, пункты).
// 2) Сверка текста каждой статьи с независимым источником (kremlin.ru) после типографской нормализации.
// Результат: content/constitution/verification-report.md и verification.json. Код выхода 1 при ошибках.

import fs from 'node:fs';
import path from 'node:path';
import type { Article, ConstitutionDocument } from '@pravo/shared';
import { checkStructure } from './lib/checks.ts';
import { canonical } from './lib/html.ts';
import { parseKremlin } from './lib/parse-kremlin.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'content/constitution');

export function articleCanonical(a: Article): string {
  return canonical(a.units.map((u) => {
    const sup = (s: string) => s.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, (m) => '^' + [...m].map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).join(''));
    const label = u.label ? sup(u.label.replace(/\.(\d+)$/, '^$1')) : '';
    const prefix = u.type === 'part' || u.type === 'point' ? `${label}.` : u.type === 'item' ? `${label})` : '';
    return prefix + sup(u.text);
  }).join(' '));
}

export function crossCheck(doc: ConstitutionDocument, kremlinHtml: string) {
  const kremlin = parseKremlin(kremlinHtml);
  const matched: string[] = [];
  const mismatched: { id: string; title: string; at: number; ours: string; theirs: string }[] = [];
  const missing: string[] = [];
  for (const a of doc.articles) {
    const k = kremlin.get(a.id);
    if (!k) { missing.push(a.title); continue; }
    const ours = articleCanonical(a);
    const theirs = canonical(k.paragraphs.join(' '));
    if (ours === theirs) { matched.push(a.id); continue; }
    let i = 0;
    while (i < ours.length && ours[i] === theirs[i]) i++;
    mismatched.push({ id: a.id, title: a.title, at: i, ours: ours.slice(Math.max(0, i - 40), i + 60), theirs: theirs.slice(Math.max(0, i - 40), i + 60) });
  }
  const extra = [...kremlin.keys()].filter((id) => !doc.articles.some((a) => a.id === id));
  return { matched, mismatched, missing, extra, kremlinCount: kremlin.size };
}

if (process.argv[1]?.endsWith('verify.ts')) {
  const doc: ConstitutionDocument = JSON.parse(fs.readFileSync(path.join(DIR, 'constitution.json'), 'utf8'));
  const structure = checkStructure(doc);
  const kremlinHtml = fs.readFileSync(path.join(ROOT, doc.crossCheckSource!.file), 'utf8');
  const cc = crossCheck(doc, kremlinHtml);
  const known: Record<string, string> = JSON.parse(fs.readFileSync(path.join(DIR, 'known-differences.json'), 'utf8'));
  const unexplained = cc.mismatched.filter((m) => !known[m.id]);

  const lines: string[] = [];
  lines.push('# Отчёт о проверке текста Конституции РФ', '');
  lines.push(`- Дата проверки: ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`- Основной источник: ${doc.primarySource.name}`);
  lines.push(`  - URL: ${doc.primarySource.url}`);
  lines.push(`  - Получен: ${doc.primarySource.retrievedAt}, SHA-256: \`${doc.primarySource.sha256}\``);
  lines.push(`- Источник для сверки: ${doc.crossCheckSource!.name}`);
  lines.push(`  - URL: ${doc.crossCheckSource!.url}`);
  lines.push(`  - Получен: ${doc.crossCheckSource!.retrievedAt}, SHA-256: \`${doc.crossCheckSource!.sha256}\``);
  lines.push(`- Редакция: **${doc.editionLabel}**`);
  lines.push(`- Перечень изменений (по ИПС): ${doc.editionNote}`, '');
  lines.push('## 1. Структурная полнота', '');
  lines.push(`Результат: **${structure.ok ? 'пройдена' : 'ОШИБКИ'}**`, '');
  lines.push(`- Статей: ${doc.stats.articleCount} (1–137 и 67¹, 75¹, 79¹, 92¹, 103¹), исключённых: ${doc.stats.excludedArticleCount} (ст. 127)`);
  lines.push(`- Глав: 9, пунктов раздела второго: ${doc.stats.finalPointCount}`);
  for (const i of structure.info) lines.push(`- ${i}`);
  for (const e of structure.errors) lines.push(`- ❌ ${e}`);
  lines.push('', '## 2. Сверка с kremlin.ru (по каждой статье)', '');
  lines.push('Сравнение после нормализации типографики (кавычки, тире, пробелы, «ё», сноски сайта «*»).', '');
  lines.push(`- Совпали полностью: **${cc.matched.length}** из ${doc.articles.length} (преамбула, статьи, пункты раздела второго)`);
  lines.push(`- Расхождения: **${cc.mismatched.length}**, из них объяснённых (не меняют текст нормы): ${cc.mismatched.length - unexplained.length}, необъяснённых: **${unexplained.length}**`);
  lines.push(`- Не найдены во втором источнике: ${cc.missing.length ? cc.missing.join(', ') : 'нет'}`);
  lines.push(`- Лишние во втором источнике: ${cc.extra.length ? cc.extra.join(', ') : 'нет'}`);
  for (const m of cc.mismatched) {
    lines.push('', `### ${m.title}`, '', '```', `pravo.gov.ru: …${m.ours}…`, `kremlin.ru:   …${m.theirs}…`, '```', '', known[m.id] ? `Пояснение: ${known[m.id]}` : '**Не объяснено — требуется ручная проверка.**');
  }
  lines.push('', '## 3. Что не проверяется автоматически', '');
  lines.push('- Юридическая актуальность редакции на дату публикации приложения: перед релизом повторно получить текст из ИПС и сравнить SHA-256 / перечень изменений.');
  lines.push('- Соответствие аудио тексту: проверяется по сценарию произношения (speech-script) и выборочным прослушиванием (см. docs/04-audio-production.md).');
  fs.writeFileSync(path.join(DIR, 'verification-report.md'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(DIR, 'verification.json'), JSON.stringify({
    checkedAt: new Date().toISOString(), editionId: doc.editionId, structureOk: structure.ok, structureErrors: structure.errors,
    crossCheck: { matched: cc.matched.length, mismatched: cc.mismatched.map((m) => m.id), unexplained: unexplained.map((m) => m.id), missing: cc.missing, extra: cc.extra },
  }, null, 2) + '\n');
  console.log(`Структура: ${structure.ok ? 'OK' : 'ОШИБКИ'} (${structure.errors.length})`);
  structure.errors.forEach((e) => console.log('  ✗ ' + e));
  console.log(`Сверка с kremlin.ru: совпало ${cc.matched.length}/${doc.articles.length}, расхождений ${cc.mismatched.length}, нет во 2-м источнике ${cc.missing.length}, лишних ${cc.extra.length}`);
  for (const m of cc.mismatched.slice(0, 40)) console.log(`  ≠ ${m.title}\n     IPS: …${m.ours}…\n     KRM: …${m.theirs}…`);
  if (unexplained.length) console.log(`Необъяснённые расхождения: ${unexplained.map((m) => m.id).join(', ')}`);
  if (!structure.ok || unexplained.length || cc.missing.length) process.exit(1);
}

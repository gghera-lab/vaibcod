// npm run constitution:parse
// Читает сохранённую страницу ИПС «Законодательство России» и строит content/constitution/constitution.json.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ConstitutionDocument, SourceInfo } from '@pravo/shared';
import { parseIps } from './lib/parse-ips.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'content/constitution');
const sources = JSON.parse(fs.readFileSync(path.join(DIR, 'source/sources.json'), 'utf8'));

function sourceInfo(s: { name: string; url: string; file: string; retrievedAt: string }): SourceInfo {
  const buf = fs.readFileSync(path.join(DIR, 'source', s.file));
  return { name: s.name, url: s.url, file: `content/constitution/source/${s.file}`, retrievedAt: s.retrievedAt, sha256: createHash('sha256').update(buf).digest('hex') };
}

export function buildConstitution(): { doc: ConstitutionDocument; warnings: string[] } {
  const primary = sources.primary;
  const html = new TextDecoder(primary.encoding).decode(fs.readFileSync(path.join(DIR, 'source', primary.file)));
  const parsed = parseIps(html);

  // Последнее изменение по перечню редакций ИПС — идентификатор редакции.
  const dates = [...parsed.editionNote.matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)].map((m) => `${m[3]}-${m[2]}-${m[1]}`).sort();
  const last = dates.at(-1) ?? 'unknown';
  const [y, mo, d] = last.split('-');
  const lastActs = [...parsed.editionNote.matchAll(new RegExp(`от ${d}\\.${mo}\\.${y} № ([\\d-]+ФКЗ)`, 'g'))].map((m) => m[1]);

  const articles = parsed.articles;
  const units = articles.flatMap((a) => a.units);
  const doc: ConstitutionDocument = {
    documentId: 'constitution-rf',
    title: 'Конституция Российской Федерации',
    adoption: parsed.adoption,
    editionNote: parsed.editionNote,
    editionId: last,
    editionLabel: `Редакция с изменениями от ${d}.${mo}.${y}${lastActs.length ? ` (${lastActs.map((a) => `№ ${a}`).join(', ')})` : ''}`,
    primarySource: sourceInfo(primary),
    crossCheckSource: sourceInfo(sources.crossCheck),
    parsedAt: new Date().toISOString(),
    sections: parsed.sections,
    chapters: parsed.chapters,
    articles,
    stats: {
      articleCount: articles.filter((a) => a.kind === 'article').length,
      excludedArticleCount: articles.filter((a) => a.status === 'excluded').length,
      finalPointCount: articles.filter((a) => a.kind === 'final_point').length,
      unitCount: units.length,
      charCount: units.reduce((s, u) => s + u.text.length, 0),
    },
  };
  return { doc, warnings: parsed.warnings };
}

if (import.meta.main ?? process.argv[1]?.endsWith('parse.ts')) {
  const { doc, warnings } = buildConstitution();
  fs.writeFileSync(path.join(DIR, 'constitution.json'), JSON.stringify(doc, null, 2) + '\n');
  console.log(`Редакция: ${doc.editionLabel}`);
  console.log(`Статей: ${doc.stats.articleCount} (исключённых: ${doc.stats.excludedArticleCount}), пунктов раздела второго: ${doc.stats.finalPointCount}`);
  console.log(`Единиц текста: ${doc.stats.unitCount}, символов: ${doc.stats.charCount}`);
  if (warnings.length) {
    console.log(`Предупреждения (${warnings.length}):`);
    for (const w of warnings) console.log('  - ' + w);
  }
}

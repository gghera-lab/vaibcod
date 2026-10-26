// npm run constitution:script
// Строит сценарий озвучивания content/constitution/speech/script.json и человекочитаемый
// speech-script.md для редактора. Ошибки сверки сценария с текстом нормы прерывают сборку.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ConstitutionDocument, Lexicon } from '@pravo/shared';
import { plainForCompare, STRESS } from '@pravo/shared';
import { buildScript, type BuildContext } from './lib/speech-builder.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'content/constitution');

export function loadBuildInputs() {
  const doc: ConstitutionDocument = JSON.parse(fs.readFileSync(path.join(DIR, 'constitution.json'), 'utf8'));
  const lexRaw = fs.readFileSync(path.join(DIR, 'pronunciation/lexicon.json'), 'utf8');
  const ovRaw = fs.readFileSync(path.join(DIR, 'pronunciation/overrides.json'), 'utf8');
  const lexicon: Lexicon = JSON.parse(lexRaw);
  const overrides = JSON.parse(ovRaw).overrides;
  const lexiconVersion = createHash('sha256').update(lexRaw + ovRaw).digest('hex').slice(0, 12);
  return { doc, lexicon, overrides, lexiconVersion };
}

if (process.argv[1]?.endsWith('build-script.ts')) {
  const { doc, lexicon, overrides, lexiconVersion } = loadBuildInputs();
  const ctx: BuildContext = { lexicon, overrides, used: new Map(), issues: [] };
  const script = buildScript(doc, ctx, lexiconVersion);
  const errors = ctx.issues.filter((i) => i.level === 'error');
  for (const i of ctx.issues) console.log(`${i.level === 'error' ? '✗' : '!'} ${i.where}: ${i.message}`);
  if (errors.length) {
    console.error(`Сценарий не собран: ${errors.length} ошибок`);
    process.exit(1);
  }
  fs.mkdirSync(path.join(DIR, 'speech'), { recursive: true });
  fs.writeFileSync(path.join(DIR, 'speech/script.json'), JSON.stringify(script, null, 2) + '\n');

  // Человекочитаемый сценарий для редактора: только места, где речь отличается от текста.
  const md: string[] = ['# Сценарий произношения — Конституция РФ', '',
    `Редакция: ${doc.editionLabel}. Версия словаря: ${lexiconVersion}. Ударение отмечено знаком «´» после ударной гласной.`, '',
    'В таблице — только фрагменты, где произносимый текст отличается от отображаемого (числа, «ё», ударения, сокращения, подписи частей и пунктов). Остальной текст читается дословно.', ''];
  let changed = 0;
  for (const t of script.tracks) {
    const rows: string[] = [];
    for (const s of t.segments) {
      const spoken = s.pieces.map((p) => p.text).join(' ');
      const plainSpoken = plainForCompare(spoken);
      if (s.role === 'unit' && plainSpoken.endsWith(plainForCompare(s.pieces.at(-1)!.text)) && s.pieces.length === 1 && plainSpoken === s.display.replace(/ё/g, 'е') && !spoken.includes(STRESS)) continue;
      rows.push(`| ${s.id} | ${s.display.replace(/\|/g, '/')} | ${spoken.replace(/\|/g, '/')} |`);
    }
    if (!rows.length) continue;
    changed += rows.length;
    md.push(`## ${t.title}`, '', '| Сегмент | Текст | Произношение |', '|---|---|---|', ...rows, '');
  }
  fs.writeFileSync(path.join(DIR, 'speech/speech-script.md'), md.join('\n'));
  const segs = script.tracks.reduce((s, t) => s + t.segments.length, 0);
  const chars = script.tracks.reduce((s, t) => s + t.segments.reduce((x, g) => x + g.pieces.reduce((y, p) => y + p.text.length, 0), 0), 0);
  console.log(`Сценарий: ${script.tracks.length} треков, ${segments(segs)}, ${chars} символов речи; отличающихся сегментов: ${changed}`);
  console.log(`Предупреждений: ${ctx.issues.length}`);
}

function segments(n: number) { return `${n} сегментов`; }

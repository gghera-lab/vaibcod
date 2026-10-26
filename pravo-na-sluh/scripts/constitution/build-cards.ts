// npm run constitution:cards — проверяет авторские вопросы по тексту и пишет content/constitution/cards.json.

import fs from 'node:fs';
import path from 'node:path';
import type { ConstitutionDocument } from '@pravo/shared';
import { buildCards, type CardSource } from './lib/cards.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'content/constitution');

const doc: ConstitutionDocument = JSON.parse(fs.readFileSync(path.join(DIR, 'constitution.json'), 'utf8'));
const sources: CardSource[] = JSON.parse(fs.readFileSync(path.join(DIR, 'cards-source.json'), 'utf8')).cards;
const { cards, errors } = buildCards(doc, sources);
for (const e of errors) console.log('✗ ' + e);
if (errors.length) {
  console.error(`Карточки не собраны: ${errors.length} ошибок`);
  process.exit(1);
}
fs.writeFileSync(path.join(DIR, 'cards.json'), JSON.stringify({ editionId: doc.editionId, generatedAt: new Date().toISOString(), cards }, null, 2) + '\n');
const by = (t: string) => cards.filter((c) => c.type === t).length;
console.log(`Карточек: ${cards.length} (выбор: ${by('single')}, верно/неверно: ${by('truefalse')}, пропуск: ${by('cloze')}, вспомнить статью: ${by('recall')}); бесплатных: ${cards.filter((c) => c.tier === 'free').length}`);

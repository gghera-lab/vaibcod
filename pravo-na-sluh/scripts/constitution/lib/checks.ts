// Структурные проверки полноты разобранного текста Конституции РФ.

import type { Article, ConstitutionDocument } from '@pravo/shared';

/** Диапазоны статей по главам (по оглавлению официального текста). */
export const EXPECTED_CHAPTERS: Record<string, { from: number; to: number; extra: string[] }> = {
  'ch-1': { from: 1, to: 16, extra: [] },
  'ch-2': { from: 17, to: 64, extra: [] },
  'ch-3': { from: 65, to: 79, extra: ['67.1', '75.1', '79.1'] },
  'ch-4': { from: 80, to: 93, extra: ['92.1'] },
  'ch-5': { from: 94, to: 109, extra: ['103.1'] },
  'ch-6': { from: 110, to: 117, extra: [] },
  'ch-7': { from: 118, to: 129, extra: [] },
  'ch-8': { from: 130, to: 133, extra: [] },
  'ch-9': { from: 134, to: 137, extra: [] },
};

const ALPHABET = 'абвгдежзиклмнопрстуфхцчшщэюя';

function compareLabel(a: string, b: string, isLetter: boolean): number {
  const [ab, as = '0'] = a.split('.');
  const [bb, bs = '0'] = b.split('.');
  const ka = isLetter ? ALPHABET.indexOf(ab) : Number(ab);
  const kb = isLetter ? ALPHABET.indexOf(bb) : Number(bb);
  return ka !== kb ? ka - kb : Number(as) - Number(bs);
}

export interface CheckResult {
  ok: boolean;
  errors: string[];
  info: string[];
}

export function checkStructure(doc: ConstitutionDocument): CheckResult {
  const errors: string[] = [];
  const info: string[] = [];
  const byId = new Map(doc.articles.map((a) => [a.id, a]));

  for (const [chId, exp] of Object.entries(EXPECTED_CHAPTERS)) {
    const ch = doc.chapters.find((c) => c.id === chId);
    if (!ch) { errors.push(`Нет главы ${chId}`); continue; }
    const expected: string[] = [];
    for (let n = exp.from; n <= exp.to; n++) {
      expected.push(String(n));
      for (const e of exp.extra) if (e.startsWith(`${n}.`)) expected.push(e);
    }
    const actual = ch.articleIds.map((id) => byId.get(id)!.number);
    if (expected.join(',') !== actual.join(',')) errors.push(`Глава ${ch.number}: ожидались статьи ${expected.join(',')}, получены ${actual.join(',')}`);
  }

  const articles = doc.articles.filter((a) => a.kind === 'article');
  if (articles.length !== 142) errors.push(`Ожидалось 142 статьи (137 + 5 со знаком «¹»), получено ${articles.length}`);
  const finals = doc.articles.filter((a) => a.kind === 'final_point').map((a) => a.number);
  if (finals.join(',') !== '1,2,3,4,5,6,7,8,9') errors.push(`Пункты раздела второго: ${finals.join(',')}`);
  const excluded = doc.articles.filter((a) => a.status === 'excluded').map((a) => a.number);
  if (excluded.join(',') !== '127') errors.push(`Исключённые статьи: ${excluded.join(',')} (ожидалась только 127)`);

  for (const a of doc.articles) {
    if (a.units.length === 0) errors.push(`${a.title}: нет текста`);
    checkUnits(a, errors);
    for (const u of a.units) {
      if (/[<>^]|&[a-z]+;|\(В редакции|\(Дополнение|\(Часть в редакции/.test(u.text)) errors.push(`${a.title} ${u.id}: служебные символы или пометки в тексте: ${u.text.slice(0, 60)}`);
      if (!/[.;:,»)]$/.test(u.text)) info.push(`${a.title} ${u.id}: единица заканчивается без знака препинания: «…${u.text.slice(-30)}»`);
    }
  }
  info.push(`Всего единиц текста: ${doc.stats.unitCount}, символов: ${doc.stats.charCount}`);
  return { ok: errors.length === 0, errors, info };
}

function checkUnits(a: Article, errors: string[]) {
  const parts = a.units.filter((u) => u.type === 'part').map((u) => u.label!);
  for (let i = 1; i < parts.length; i++) {
    if (compareLabel(parts[i - 1], parts[i], false) >= 0) errors.push(`${a.title}: нарушен порядок частей ${parts[i - 1]} → ${parts[i]}`);
  }
  if (parts.length && parts[0] !== '1') errors.push(`${a.title}: первая часть имеет номер ${parts[0]}`);
  // Пункты (буквы) — последовательность внутри каждой части.
  const groups = new Map<string, string[]>();
  for (const u of a.units) if (u.type === 'item') {
    const key = u.part ?? '-';
    groups.set(key, [...(groups.get(key) ?? []), u.label!]);
  }
  for (const [key, labels] of groups) {
    if (labels[0] !== 'а') errors.push(`${a.title} (часть ${key}): перечень начинается с «${labels[0]}»`);
    for (let i = 1; i < labels.length; i++) {
      const prev = labels[i - 1], cur = labels[i];
      const ok = compareLabel(prev, cur, true) < 0 &&
        (cur.includes('.') || ALPHABET.indexOf(cur) - ALPHABET.indexOf(prev.split('.')[0]) === 1);
      if (!ok) errors.push(`${a.title} (часть ${key}): после «${prev}» идёт «${cur}»`);
    }
  }
}

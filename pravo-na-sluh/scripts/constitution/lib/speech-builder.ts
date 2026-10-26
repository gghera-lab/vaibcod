// Построение сценария озвучивания Конституции РФ из проверенного текста + словаря произношения.

import type { Article, ConstitutionDocument, Lexicon, Override, SpeechSegment, SpeechScript, SpeechTrack, TextUnit } from '@pravo/shared';
import { applyLexicon, applyOverrides, cardinal, dateGenitive, escapeRe, labelNumber, letterName, ordinal, plainForCompare } from '@pravo/shared';

export const PAUSES = {
  afterTitle: 700,
  afterLabel: 300,
  part: 650,
  item: 400,
  para: 500,
  preambleLine: 250,
  headingInner: 600,
  leadIn: 300,
  articleTail: 900,
  chapterTail: 1400,
};

export const RATE = { text: 1.0, heading: 0.95 };

export interface BuildIssue {
  level: 'error' | 'warning';
  where: string;
  message: string;
}

export interface BuildContext {
  lexicon: Lexicon;
  overrides: Override[];
  used: Map<number, number>;
  issues: BuildIssue[];
}

function spokenText(text: string, scope: string[], ctx: BuildContext): string {
  const withOverrides = applyOverrides(text, scope, ctx.overrides, { overridesUsed: ctx.used });
  return applyLexicon(withOverrides, ctx.lexicon);
}

/** Проверка: сценарий отличается от исходного текста только зарегистрированными заменами. */
export function checkFidelity(display: string, spoken: string, scope: string[], ctx: BuildContext, where: string) {
  let d = display;
  let s = plainForCompare(spoken);
  ctx.overrides.forEach((o, i) => {
    if (o.scope && !scope.includes(o.scope)) return;
    d = d.split(o.from).join(`⟦${i}⟧`);
    s = s.split(plainForCompare(o.to)).join(`⟦${i}⟧`);
  });
  for (const [abbr, sp] of Object.entries(ctx.lexicon.abbreviations)) {
    d = d.replace(new RegExp(`(?<![а-яёА-ЯЁ])${escapeRe(abbr)}(?![а-яёА-ЯЁ])`, 'g'), '⟦abbr⟧');
    s = s.split(plainForCompare(sp)).join('⟦abbr⟧');
  }
  const norm = (x: string) => x.replace(/ё/g, 'е').replace(/Ё/g, 'Е').replace(/\s+/g, ' ').trim();
  if (norm(d) !== norm(s)) {
    let i = 0;
    const a = norm(d), b = norm(s);
    while (i < a.length && a[i] === b[i]) i++;
    ctx.issues.push({ level: 'error', where, message: `Сценарий расходится с текстом нормы: «…${a.slice(Math.max(0, i - 30), i + 40)}» ≠ «…${b.slice(Math.max(0, i - 30), i + 40)}»` });
  }
  if (/\d/.test(spoken)) ctx.issues.push({ level: 'error', where, message: `В сценарии остались цифры: «${spoken.match(/.{0,20}\d.{0,20}/)?.[0]}» — добавьте замену в overrides.json` });
  if (/[A-Za-z]/.test(spoken)) ctx.issues.push({ level: 'warning', where, message: 'Латиница в произносимом тексте' });
  if (/[¹²³⁴⁵⁶⁷⁸⁹]/.test(spoken)) ctx.issues.push({ level: 'error', where, message: 'Надстрочный индекс не преобразован в речь' });
}

function unitSegment(a: Article, u: TextUnit, ctx: BuildContext, isLast: boolean): SpeechSegment {
  const scope = [u.id, a.id];
  const text = spokenText(u.text, scope, ctx);
  checkFidelity(u.text, text, scope, ctx, u.id);
  const pieces: SpeechSegment['pieces'] = [];
  let labelDisplay = '';
  if (u.type === 'part' && u.label) {
    const spokenLabel = u.label.includes('.') ? labelNumber(u.label) : ordinal(Number(u.label), 'f');
    pieces.push({ text: `Часть ${spokenLabel}.`, pauseMs: PAUSES.afterLabel });
    labelDisplay = `${u.label}. `;
  } else if (u.type === 'point' && u.label) {
    pieces.push({ text: `Пункт ${ordinal(Number(u.label), 'm')}.`, pauseMs: PAUSES.afterLabel });
    labelDisplay = `${u.label}. `;
  } else if (u.type === 'item' && u.label) {
    pieces.push({ text: `Пункт «${letterName(u.label, (n) => cardinal(n))}».`, pauseMs: PAUSES.afterLabel });
    labelDisplay = `${u.label}) `;
  }
  pieces.push({ text, pauseMs: 0 });
  const pauseAfter = a.kind === 'preamble' ? PAUSES.preambleLine
    : u.type === 'item' ? PAUSES.item : u.type === 'para' ? PAUSES.para : PAUSES.part;
  return {
    id: u.id, role: 'unit', unitId: u.id, display: labelDisplay + u.text, pieces,
    pauseAfterMs: isLast ? 0 : pauseAfter, rate: RATE.text,
  };
}

function articleTrack(a: Article, ctx: BuildContext): SpeechTrack {
  const titleSpoken = a.kind === 'preamble' ? 'Преамбула.'
    : a.kind === 'final_point' ? null
    : `Статья ${labelNumber(a.number!)}.`;
  const segments: SpeechSegment[] = [];
  if (titleSpoken) {
    segments.push({ id: `${a.id}/title`, role: 'title', unitId: null, display: a.title, pieces: [{ text: titleSpoken, pauseMs: 0 }], pauseAfterMs: PAUSES.afterTitle, rate: RATE.heading });
  }
  a.units.forEach((u, i) => segments.push(unitSegment(a, u, ctx, i === a.units.length - 1)));
  return {
    id: a.id, kind: 'article', articleId: a.id, chapterId: a.chapterId, title: a.title, order: 0,
    leadInMs: PAUSES.leadIn, tailMs: PAUSES.articleTail, segments,
  };
}

function headingTrack(id: string, chapterId: string, title: string, lines: { display: string; spoken: string }[]): SpeechTrack {
  return {
    id, kind: id === 'intro' ? 'intro' : 'chapter_intro', articleId: null, chapterId, title, order: 0,
    leadInMs: PAUSES.leadIn, tailMs: PAUSES.chapterTail,
    segments: lines.map((l, i) => ({
      id: `${id}/h${i + 1}`, role: id === 'intro' && i > 0 ? 'notice' : 'heading', unitId: null, display: l.display,
      pieces: [{ text: l.spoken, pauseMs: 0 }], pauseAfterMs: i === lines.length - 1 ? 0 : PAUSES.headingInner, rate: RATE.heading,
    })),
  };
}

export function buildScript(doc: ConstitutionDocument, ctx: BuildContext, lexiconVersion: string): SpeechScript {
  const tracks: SpeechTrack[] = [];
  const [ey, em, ed] = doc.editionId.split('-').map(Number);
  const adoptionSpoken = 'Принята всенародным голосованием ' + dateGenitive(12, 12, 1993) +
    ' с изменениями, одобренными в ходе общероссийского голосования ' + dateGenitive(1, 7, 2020) + '.';
  tracks.push(headingTrack('intro', 'preamble', 'Вступление', [
    { display: 'Конституция Российской Федерации', spoken: 'Конституция Российской Федерации.' },
    { display: doc.adoption, spoken: adoptionSpoken },
    {
      display: `Текст по Официальному интернет-порталу правовой информации, ${doc.editionLabel.toLowerCase()}. Аудиоверсия не является официальным опубликованием.`,
      spoken: `Текст приводится по Официальному интернет-порталу правовой информации, в редакции с изменениями от ${dateGenitive(ed, em, ey).replace(/ года$/, ' года')}. Аудиоверсия не является официальным опубликованием.`,
    },
  ]));

  for (const chapter of doc.chapters) {
    if (chapter.id !== 'preamble') {
      const lines: { display: string; spoken: string }[] = [];
      const section = doc.sections.find((s) => s.id === chapter.sectionId)!;
      if (section.chapterIds[0] === chapter.id) lines.push({ display: section.title, spoken: `${section.title}.` });
      if (chapter.number) lines.push({ display: `Глава ${chapter.number}`, spoken: `Глава ${ordinal(chapter.number, 'f')}.` });
      lines.push({ display: chapter.title, spoken: applyLexicon(`${chapter.title}.`, ctx.lexicon) });
      tracks.push(headingTrack(`chapter-${chapter.id}`, chapter.id, chapter.number ? `Глава ${chapter.number}. ${chapter.title}` : chapter.title, lines));
    }
    for (const id of chapter.articleIds) {
      tracks.push(articleTrack(doc.articles.find((a) => a.id === id)!, ctx));
    }
  }
  tracks.forEach((t, i) => (t.order = i));

  ctx.overrides.forEach((o, i) => {
    if (!ctx.used.get(i)) ctx.issues.push({ level: 'error', where: 'overrides.json', message: `Замена №${i + 1} «${o.from}» не сработала ни разу (устарела?)` });
  });
  return { documentId: doc.documentId, editionId: doc.editionId, generatedAt: new Date().toISOString(), lexiconVersion, tracks };
}

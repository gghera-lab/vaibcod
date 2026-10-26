// Разбор HTML-текста Конституции РФ из ИПС «Законодательство России» (pravo.gov.ru, nd=102027595).
// Редакционные пометки ИПС (<span class="mark">) отделяются от текста норм и сохраняются как notes.

import type { Article, Chapter, Section, TextUnit } from '../../../packages/shared/src/constitution.ts';
import { articleTitle } from '../../../packages/shared/src/constitution.ts';
import { cleanText, extractSpansByClass, typography } from './html.ts';

export const CHAPTER_TITLES: Record<number, string> = {
  1: 'Основы конституционного строя',
  2: 'Права и свободы человека и гражданина',
  3: 'Федеративное устройство',
  4: 'Президент Российской Федерации',
  5: 'Федеральное Собрание',
  6: 'Правительство Российской Федерации',
  7: 'Судебная власть и прокуратура',
  8: 'Местное самоуправление',
  9: 'Конституционные поправки и пересмотр Конституции',
};

const SUP_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const supToUnicode = (s: string) => s.replace(/\^(\d+)/g, (_, d: string) => d.split('').map((c) => SUP_DIGITS[Number(c)]).join(''));
const supToDot = (s: string) => s.replace(/\^(\d+)/g, '.$1');

export interface ParsedConstitution {
  adoption: string;
  editionNote: string;
  sections: Section[];
  chapters: Chapter[];
  articles: Article[];
  warnings: string[];
}

interface RawParagraph {
  cls: string;
  text: string;
  notes: string[];
}

export function readIpsParagraphs(html: string): RawParagraph[] {
  const out: RawParagraph[] = [];
  const re = /<p([^>]*)>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const cls = /class="([^"]*)"/i.exec(m[1])?.[1] ?? '';
    const first = extractSpansByClass(m[2], 'mark');
    const second = extractSpansByClass(first.html, 'markx');
    const withoutMarks = second.html;
    const removed = [...first.removed, ...second.removed];
    const sup = withoutMarks.replace(/<span[^>]*class="W9"[^>]*>\s*(\d+)\s*<\/span>/gi, '^$1');
    const text = cleanText(sup);
    const notes = removed
      .map((r) => cleanText(r).replace(/^\(\s*/, '').replace(/\s*\)$/, ''))
      .filter(Boolean);
    if (!text && notes.length === 0) continue;
    out.push({ cls, text, notes });
  }
  return out;
}

export function parseIps(html: string): ParsedConstitution {
  const paras = readIpsParagraphs(html);
  const warnings: string[] = [];
  const sections: Section[] = [{ id: 'preamble', number: null, title: 'Преамбула', chapterIds: ['preamble'] }];
  const chapters: Chapter[] = [{ id: 'preamble', sectionId: 'preamble', number: null, title: 'Преамбула', articleIds: ['preamble'], notes: [] }];
  const preamble: Article = {
    id: 'preamble', kind: 'preamble', number: null, title: 'Преамбула', chapterId: 'preamble',
    status: 'in_force', units: [], notes: [], order: 0,
  };
  const articles: Article[] = [preamble];

  let adoption = '';
  let editionNote = '';
  let stage: 'header' | 'preamble' | 'body' = 'header';
  let section: Section | null = null;
  let chapter: Chapter | null = null;
  let article: Article | null = null;
  let currentPart: string | null = null;
  let expectChapterTitle = false;
  let expectFinalTitle = false;

  const pushUnit = (a: Article, unit: Omit<TextUnit, 'id'>) => {
    a.units.push({ ...unit, id: `${a.id}/u${a.units.length + 1}` });
  };
  const startArticle = (a: Article) => {
    articles.push(a);
    chapter!.articleIds.push(a.id);
    article = a;
    currentPart = null;
  };

  for (const p of paras) {
    const t = p.text;

    if (stage === 'header') {
      if (/^Принята всенародным голосованием/.test(t)) { adoption = typography(t); continue; }
      if (/^КОНСТИТУЦИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ$/.test(t)) { continue; }
      if (/^\(В редакции/.test(t)) { editionNote = t.replace(/^\(/, '').replace(/\)$/, ''); continue; }
      if (!t && p.notes.length) { editionNote = p.notes.join(' '); continue; }
      if (/^Мы, многонациональный народ/.test(t)) stage = 'preamble';
      else { if (t) warnings.push(`Пропущена строка заголовка: ${t.slice(0, 80)}`); continue; }
    }

    if (/^РАЗДЕЛ (ПЕРВЫЙ|ВТОРОЙ)$/.test(t)) {
      stage = 'body';
      const n = t.endsWith('ПЕРВЫЙ') ? 1 : 2;
      section = { id: `s${n}`, number: n, title: n === 1 ? 'Раздел первый' : 'Раздел второй', chapterIds: [] };
      sections.push(section);
      article = null;
      if (n === 2) {
        chapter = { id: 'final', sectionId: section.id, number: null, title: 'Заключительные и переходные положения', articleIds: [], notes: [] };
        chapters.push(chapter);
        section.chapterIds.push(chapter.id);
        expectFinalTitle = true;
      }
      continue;
    }

    if (stage === 'preamble') {
      pushUnit(preamble, { type: 'para', label: null, text: typography(t), part: null, notes: p.notes });
      continue;
    }

    if (expectFinalTitle) {
      expectFinalTitle = false;
      if (t !== 'Заключительные и переходные положения') warnings.push(`Неожиданный заголовок раздела второго: ${t}`);
      continue;
    }

    const ch = /^ГЛАВА (\d+)$/.exec(t);
    if (ch) {
      const n = Number(ch[1]);
      chapter = { id: `ch-${n}`, sectionId: section!.id, number: n, title: CHAPTER_TITLES[n], articleIds: [], notes: [] };
      chapters.push(chapter);
      section!.chapterIds.push(chapter.id);
      article = null;
      expectChapterTitle = true;
      continue;
    }
    if (expectChapterTitle) {
      expectChapterTitle = false;
      if (t.toUpperCase() !== chapter!.title.toUpperCase()) warnings.push(`Заголовок главы ${chapter!.number} не совпал: «${t}»`);
      chapter!.notes.push(...p.notes);
      continue;
    }

    const art = /^Статья (\d+)(\^\d+)?$/.exec(t);
    if (art) {
      const number = supToDot(art[1] + (art[2] ?? ''));
      const a: Article = {
        id: `art-${number}`, kind: 'article', number, title: '', chapterId: chapter!.id,
        status: 'in_force', units: [], notes: [...p.notes], order: articles.length,
      };
      a.title = articleTitle(a);
      startArticle(a);
      continue;
    }

    if (!t && p.notes.length) {
      // Пометка отдельной строкой («Статья в редакции …»): относится к текущей статье или главе.
      if (article) (article as Article).notes.push(...p.notes);
      else if (chapter) chapter.notes.push(...p.notes);
      continue;
    }

    if (chapter?.id === 'final') {
      const pt = /^(\d+)\.\s+(.*)$/.exec(t);
      if (pt) {
        const a: Article = {
          id: `final-${pt[1]}`, kind: 'final_point', number: pt[1], title: '', chapterId: 'final',
          status: 'in_force', units: [], notes: [], order: articles.length,
        };
        a.title = articleTitle(a);
        startArticle(a);
        pushUnit(a, { type: 'point', label: pt[1], text: typography(supToUnicode(pt[2])), part: pt[1], notes: p.notes });
        currentPart = pt[1];
        continue;
      }
      if (!article) { warnings.push(`Текст раздела второго вне пункта: ${t.slice(0, 80)}`); continue; }
      pushUnit(article, { type: 'para', label: null, text: typography(supToUnicode(t)), part: currentPart, notes: p.notes });
      continue;
    }

    if (!article) { warnings.push(`Текст вне статьи: ${t.slice(0, 80)}`); continue; }
    const a = article as Article;

    const part = /^(\d+)(\^\d+)?\.\s+(.*)$/.exec(t);
    if (part) {
      currentPart = supToDot(part[1] + (part[2] ?? ''));
      pushUnit(a, { type: 'part', label: currentPart, text: typography(supToUnicode(part[3])), part: currentPart, notes: p.notes });
      continue;
    }
    const item = /^([а-я])(\^\d+)?\)\s+(.*)$/.exec(t);
    if (item) {
      pushUnit(a, { type: 'item', label: supToDot(item[1] + (item[2] ?? '')), text: typography(supToUnicode(item[3])), part: currentPart, notes: p.notes });
      continue;
    }
    if (/^Исключена поправкой/.test(t)) a.status = 'excluded';
    pushUnit(a, { type: 'para', label: null, text: typography(supToUnicode(t)), part: currentPart, notes: p.notes });
  }

  return { adoption, editionNote, sections, chapters, articles, warnings };
}

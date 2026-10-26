// Сборка и проверка карточек по Конституции РФ. Ни один вопрос не попадает в приложение,
// если его цитата не найдена дословно в тексте статьи текущей редакции.

import type { Article, ConstitutionDocument, TextUnit } from '@pravo/shared';
import { displayNumber } from '@pravo/shared';

export interface CardSource {
  id: string;
  article: string;
  type: 'single' | 'truefalse' | 'cloze';
  prompt?: string;
  statement?: string;
  options?: string[];
  correct?: number;
  value?: boolean;
  quote?: string[];
  unit?: number;
  blank?: string;
  explanation: string;
  difficulty?: number;
}

export interface BuiltCard {
  id: string;
  articleKey: string;
  chapterKey: string;
  type: 'single' | 'truefalse' | 'cloze' | 'recall';
  prompt: string;
  options: string[] | null;
  answer: Record<string, unknown>;
  explanation: string;
  quote: string;
  sourceRef: string;
  difficulty: number;
  tier: 'free' | 'pro';
  sort: number;
}

export const FREE_CHAPTERS = ['preamble', 'ch-1', 'ch-2'];

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[«»"'.,;:!?()\-—–]/g, ' ').replace(/\s+/g, ' ').trim();

export function sourceRefFor(a: Article, u: TextUnit | null): string {
  if (a.kind === 'preamble') return 'Преамбула Конституции РФ';
  if (a.kind === 'final_point') return `п. ${a.number} раздела второго Конституции РФ`;
  const art = `ст. ${displayNumber(a.number!)}`;
  if (!u) return `${art} Конституции РФ`;
  const part = u.part ? `ч. ${displayNumber(u.part)} ` : '';
  if (u.type === 'item') return `п. «${displayNumber(u.label!)}» ${part}${art} Конституции РФ`;
  return `${part}${art} Конституции РФ`;
}

export interface BuildResult {
  cards: BuiltCard[];
  errors: string[];
}

export function buildCards(doc: ConstitutionDocument, sources: CardSource[]): BuildResult {
  const errors: string[] = [];
  const cards: BuiltCard[] = [];
  const ids = new Set<string>();
  const byId = new Map(doc.articles.map((a) => [a.id, a]));

  sources.forEach((s, i) => {
    const err = (m: string) => errors.push(`${s.id} (${s.article}): ${m}`);
    if (ids.has(s.id)) return err('повторяющийся id');
    ids.add(s.id);
    const a = byId.get(s.article);
    if (!a) return err('статья не найдена');
    const tier = FREE_CHAPTERS.includes(a.chapterId) ? 'free' : 'pro';
    const base = { id: s.id, articleKey: a.id, chapterKey: a.chapterId, explanation: s.explanation, difficulty: s.difficulty ?? 2, tier, sort: a.order * 100 + i } as const;

    if (s.type === 'cloze') {
      const u = a.units[(s.unit ?? 0) - 1];
      if (!u) return err(`нет единицы текста №${s.unit}`);
      if (!s.blank) return err('не указано скрываемое слово');
      const re = new RegExp(`(?<![а-яёА-ЯЁ])${s.blank}(?![а-яёА-ЯЁ])`);
      if (!re.test(u.text)) return err(`слово «${s.blank}» не найдено в тексте: ${u.text.slice(0, 120)}`);
      cards.push({
        ...base, type: 'cloze', prompt: u.text.replace(re, '_____'), options: null,
        answer: { text: s.blank, accept: [] }, quote: u.text, sourceRef: sourceRefFor(a, u),
      });
      return;
    }

    if (!s.quote?.length) return err('нет цитаты');
    const units: TextUnit[] = [];
    for (const q of s.quote) {
      const u = a.units.find((x) => x.text.includes(q));
      if (!u) return err(`цитата не найдена дословно: «${q.slice(0, 100)}»`);
      units.push(u);
    }
    const quote = s.quote.join(' … ');
    const refUnit = units[units.length - 1];

    if (s.type === 'single') {
      if (!s.prompt || !s.options || s.options.length < 2 || s.correct == null) return err('неполный вопрос');
      if (new Set(s.options.map(norm)).size !== s.options.length) return err('повторяющиеся варианты');
      const correct = s.options[s.correct];
      if (!norm(quote).includes(norm(correct))) return err(`правильный вариант «${correct}» не подтверждается цитатой`);
      // Варианты перемешиваются детерминированно, чтобы правильный ответ не был всегда первым.
      const order = s.options.map((_, k) => k).sort((x, y) => hash(`${s.id}:${x}`) - hash(`${s.id}:${y}`));
      const options = order.map((k) => s.options![k]);
      cards.push({ ...base, type: 'single', prompt: s.prompt, options, answer: { index: order.indexOf(s.correct) }, quote, sourceRef: sourceRefFor(a, refUnit) });
      return;
    }
    if (s.type === 'truefalse') {
      if (!s.statement || typeof s.value !== 'boolean') return err('нет утверждения или значения');
      cards.push({ ...base, type: 'truefalse', prompt: s.statement, options: ['Верно', 'Неверно'], answer: { value: s.value }, quote, sourceRef: sourceRefFor(a, refUnit) });
      return;
    }
    err(`неизвестный тип ${s.type}`);
  });

  // «Вспомни статью» — для каждой статьи (кроме исключённой): эталон — сам текст статьи.
  for (const a of doc.articles) {
    if (a.status === 'excluded') continue;
    const chapter = doc.chapters.find((c) => c.id === a.chapterId)!;
    const full = a.units.map((u) => (u.type === 'part' || u.type === 'point' ? `${u.label}. ` : u.type === 'item' ? `${u.label}) ` : '') + u.text).join('\n');
    const where = chapter.number ? `глава ${chapter.number} «${chapter.title}»` : chapter.title;
    cards.push({
      id: `recall-${a.id}`, articleKey: a.id, chapterKey: a.chapterId, type: 'recall',
      prompt: `${a.title} (${where}). Вспомните и сформулируйте своими словами, что она устанавливает. Затем откройте текст и оцените себя честно.`,
      options: null, answer: { text: full }, explanation: 'Активное воспроизведение: попытка вспомнить до подсказки закрепляет материал сильнее, чем повторное чтение.',
      quote: a.units[0].text, sourceRef: sourceRefFor(a, null), difficulty: Math.min(4, 1 + Math.floor(full.length / 700)),
      tier: FREE_CHAPTERS.includes(a.chapterId) ? 'free' : 'pro', sort: a.order * 100 + 99,
    });
  }
  return { cards, errors };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

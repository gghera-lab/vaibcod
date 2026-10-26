// Структура разобранного текста Конституции РФ (content/constitution/constitution.json).
// Отображаемый юридический текст хранится отдельно от сценария произношения (speech-script.json).

export type UnitType = 'part' | 'item' | 'para' | 'point';

/** Минимальная единица текста: часть статьи, пункт перечня или абзац. */
export interface TextUnit {
  /** Стабильный идентификатор: art-71/u3 */
  id: string;
  type: UnitType;
  /** Номер части («1», «1.1»), буква пункта («а», «ж.1») или null для абзаца. */
  label: string | null;
  /** Текст в типографской нормализации (кавычки «», тире —), без номера в начале. */
  text: string;
  /** Номер части, к которой относится пункт/абзац (если есть). */
  part: string | null;
  /** Редакционные пометки источника («В редакции …»), не являются текстом нормы. */
  notes: string[];
}

export type ArticleStatus = 'in_force' | 'excluded';

export interface Article {
  /** art-67.1, preamble, final-3 */
  id: string;
  kind: 'preamble' | 'article' | 'final_point';
  /** «67.1», «3» (пункт раздела второго) или null для преамбулы. */
  number: string | null;
  /** Заголовок для интерфейса: «Статья 67.1», «Преамбула», «Пункт 3». */
  title: string;
  chapterId: string;
  status: ArticleStatus;
  units: TextUnit[];
  /** Пометки уровня статьи («Статья в редакции …», «Дополнение статьей …»). */
  notes: string[];
  /** Порядковый номер в документе (для плейлиста). */
  order: number;
}

export interface Chapter {
  /** ch-1 … ch-9, preamble, final */
  id: string;
  sectionId: string;
  number: number | null;
  title: string;
  articleIds: string[];
  notes: string[];
}

export interface Section {
  id: string;
  number: number | null;
  title: string;
  chapterIds: string[];
}

export interface SourceInfo {
  name: string;
  url: string;
  file: string;
  retrievedAt: string;
  sha256: string;
}

export interface ConstitutionDocument {
  documentId: 'constitution-rf';
  title: string;
  adoption: string;
  /** Перечень актов, которыми вносились изменения (по данным ИПС «Законодательство России»). */
  editionNote: string;
  /** Идентификатор редакции: дата последнего изменения. */
  editionId: string;
  editionLabel: string;
  primarySource: SourceInfo;
  crossCheckSource: SourceInfo | null;
  parsedAt: string;
  sections: Section[];
  chapters: Chapter[];
  articles: Article[];
  stats: {
    articleCount: number;
    excludedArticleCount: number;
    finalPointCount: number;
    unitCount: number;
    charCount: number;
  };
}

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

/** «67.1» → «67¹» — так номер выглядит в официальном тексте. */
export function displayNumber(n: string): string {
  const m = /^([^.]+)\.(\d+)$/.exec(n);
  if (!m) return n;
  return m[1] + m[2].split('').map((d) => SUPERSCRIPT[d] ?? d).join('');
}

export function articleTitle(a: Pick<Article, 'kind' | 'number'>): string {
  if (a.kind === 'preamble') return 'Преамбула';
  if (a.kind === 'final_point') return `Пункт ${a.number}`;
  return `Статья ${displayNumber(a.number ?? '')}`;
}

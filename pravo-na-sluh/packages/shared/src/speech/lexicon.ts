// Применение словаря произношения к тексту нормы.
// Отображаемый текст НЕ меняется — результат используется только для синтеза речи.
//
// Ударение обозначается знаком U+0301 (комбинирующее ударение) ПОСЛЕ ударной гласной: «права́».
// Адаптеры TTS переводят его в свой формат (SSML phoneme / «+» для SpeechKit).

export const STRESS = '́';

export interface Override {
  /** Ограничение области действия: id единицы текста («art-22/u2») или трека («intro»). */
  scope?: string;
  from: string;
  to: string;
  /** Пояснение для редактора. */
  note?: string;
}

export interface HomographRule {
  /** Слово в нижнем регистре, как в тексте. */
  word: string;
  /** Произношение по умолчанию (с ударением). */
  default: string;
  /** Альтернативное произношение и контексты (регулярные выражения по фрагменту «…до 30 символов|слово|30 символов после…»). */
  alt?: { spoken: string; contexts: string[] };
  note?: string;
}

export interface Lexicon {
  /** Восстановление «ё»: слово → форма с «ё». */
  yo: Record<string, string>;
  /** Подсказки ударения: регулярное выражение от начала слова → замена с ударением. */
  stress: { pattern: string; replace: string; note?: string }[];
  homographs: HomographRule[];
  /** Аббревиатуры, читаемые особым образом. */
  abbreviations: Record<string, string>;
}

const CYR = 'а-яёА-ЯЁ';
const wordRe = (w: string, flags = 'g') => new RegExp(`(?<![${CYR}])${escapeRe(w)}(?![${CYR}])`, flags);

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchCase(source: string, target: string): string {
  if (source[0] && source[0] === source[0].toUpperCase() && source[0] !== source[0].toLowerCase()) {
    return target[0].toUpperCase() + target.slice(1);
  }
  return target;
}

export interface ApplyReport {
  overridesUsed: Map<number, number>;
}

/** Применяет ручные замены (overrides) — каждая обязана сработать хотя бы раз (проверяется отдельно). */
export function applyOverrides(text: string, scopeIds: string[], overrides: Override[], report?: ApplyReport): string {
  let out = text;
  overrides.forEach((o, i) => {
    if (o.scope && !scopeIds.includes(o.scope)) return;
    let count = 0;
    out = out.split(o.from).join('\u0000');
    count = (out.match(/\u0000/g) ?? []).length;
    out = out.replace(/\u0000/g, o.to);
    if (report && count) report.overridesUsed.set(i, (report.overridesUsed.get(i) ?? 0) + count);
  });
  return out;
}

/** Ё, ударения в омографах и по основам, аббревиатуры. */
export function applyLexicon(text: string, lex: Lexicon): string {
  let out = text;
  for (const [abbr, spoken] of Object.entries(lex.abbreviations)) {
    out = out.replace(wordRe(abbr), spoken);
  }
  for (const [w, yo] of Object.entries(lex.yo)) {
    out = out.replace(wordRe(w, 'gi'), (m) => matchCase(m, yo));
  }
  for (const h of lex.homographs) {
    out = out.replace(wordRe(h.word, 'gi'), (m, offset: number, whole: string) => {
      const before = whole.slice(Math.max(0, offset - 40), offset);
      const after = whole.slice(offset + m.length, offset + m.length + 40);
      const window = `${before}|${m.toLowerCase()}|${after}`;
      const useAlt = h.alt?.contexts.some((c) => new RegExp(c, 'i').test(window));
      return matchCase(m, useAlt ? h.alt!.spoken : h.default);
    });
  }
  for (const rule of lex.stress) {
    const re = new RegExp(`(?<![${CYR}])${rule.pattern}`, 'gi');
    out = out.replace(re, (m) => matchCase(m, rule.replace));
  }
  return out;
}

/** Убирает знаки ударения и «ё» — для сверки сценария с исходным текстом. */
export function plainForCompare(s: string): string {
  return s.replace(new RegExp(STRESS, 'g'), '').replace(/ё/g, 'е').replace(/Ё/g, 'Е');
}

const LETTER_NAMES: Record<string, string> = {
  а: 'а', б: 'бэ', в: 'вэ', г: 'гэ', д: 'дэ', е: 'е', ж: 'жэ', з: 'зэ', и: 'и', к: 'ка', л: 'эль', м: 'эм',
  н: 'эн', о: 'о', п: 'пэ', р: 'эр', с: 'эс', т: 'тэ', у: 'у', ф: 'эф', х: 'ха', ц: 'цэ', ч: 'че', ш: 'ша',
  щ: 'ща', э: 'э', ю: 'ю', я: 'я',
};

/** Буква пункта перечня: «д.1» → «дэ точка один». */
export function letterName(label: string, numberWords: (n: number) => string): string {
  const [letter, sub] = label.split('.');
  const name = LETTER_NAMES[letter] ?? letter;
  return sub ? `${name} точка ${numberWords(Number(sub))}` : name;
}

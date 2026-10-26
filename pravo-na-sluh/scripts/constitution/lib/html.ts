// Небольшие утилиты для разбора HTML официальных источников без внешних зависимостей.

const ENTITIES: Record<string, string> = {
  nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', quot: '"', amp: '&', lt: '<', gt: '>',
  apos: "'", hellip: '…', bdquo: '„', ldquo: '“', rdquo: '”', sect: '§', numero: '№',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

export function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

export function cleanText(s: string): string {
  return decodeEntities(stripTags(s))
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Удаляет из HTML все элементы <span class="cls"> вместе с вложенными span и возвращает
 * удалённое содержимое (как текст). Учитывает вложенность span.
 */
export function extractSpansByClass(html: string, cls: string): { html: string; removed: string[] } {
  const removed: string[] = [];
  const opener = new RegExp(`<span[^>]*class="${cls}"[^>]*>`, 'i');
  let out = html;
  for (;;) {
    const m = opener.exec(out);
    if (!m) break;
    const start = m.index;
    let pos = start + m[0].length;
    let depth = 1;
    const tag = /<(\/?)span\b[^>]*>/gi;
    tag.lastIndex = pos;
    let end = -1;
    for (;;) {
      const t = tag.exec(out);
      if (!t) break;
      depth += t[1] ? -1 : 1;
      if (depth === 0) {
        end = t.index + t[0].length;
        break;
      }
    }
    if (end < 0) throw new Error(`Незакрытый <span class="${cls}"> на позиции ${start}`);
    removed.push(out.slice(start, end));
    out = out.slice(0, start) + out.slice(end);
    pos = start;
  }
  return { html: out, removed };
}

/** Типографская нормализация без изменения смысла: «ёлочки», длинное тире, пробелы. */
export function typography(s: string): string {
  let t = s.replace(/\s+-\s+/g, ' — ').replace(/^-\s+/, '— ');
  // Прямые кавычки → «» (по очереди открывающая/закрывающая).
  let open = true;
  t = t.replace(/"/g, () => {
    const q = open ? '«' : '»';
    open = !open;
    return q;
  });
  return t.replace(/\s+([,.;:)])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

/** Каноническая форма для сверки двух источников: игнорирует типографику и пробелы. */
export function canonical(s: string): string {
  return s
    .replace(/[«»„“”"]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/ё/g, 'е')
    .replace(/Ё/g, 'Е')
    .replace(/\*/g, '')
    .replace(/\s+/g, '')
    .trim();
}

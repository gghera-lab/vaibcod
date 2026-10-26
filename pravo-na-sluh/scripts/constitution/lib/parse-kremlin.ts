// Разбор текста Конституции с kremlin.ru/acts/constitution/item — используется только для сверки
// с основным источником (pravo.gov.ru). Сноски сайта («*») и блоки справок отбрасываются.

import { cleanText } from './html.ts';

export interface KremlinArticle {
  id: string;
  paragraphs: string[];
}

export function parseKremlin(html: string): Map<string, KremlinArticle> {
  const result = new Map<string, KremlinArticle>();
  // Справочные блоки сайта о внесённых изменениях не являются текстом Конституции.
  let body = html.replace(/<!--[\s\S]*?-->/g, '');
  body = body.replace(/<div class="reference_block">[\s\S]*?<\/div>\s*<\/div>/g, '');
  body = body.replace(/<sup>\s*(\d*)\s*\*?\s*<\/sup>/g, (_, d: string) => (d ? `^${d}` : ''));

  const start = body.indexOf('<h1 class="title_main">');
  const end = body.indexOf('class="constitution__contents');
  if (start < 0) throw new Error('kremlin: не найден заголовок документа');
  body = body.slice(start, end > start ? end : undefined);

  const preamble: KremlinArticle = { id: 'preamble', paragraphs: [] };
  result.set('preamble', preamble);
  let current: KremlinArticle | null = preamble;
  let inFinal = false;

  const token = /<(h2|h3|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = token.exec(body))) {
    const tag = m[1].toLowerCase();
    const text = cleanText(m[2]).replace(/\*/g, '').trim();
    if (!text) continue;
    if (tag === 'h2') {
      if (/^Раздел второй/i.test(text)) inFinal = true;
      if (/^Раздел|^Глава/i.test(text)) current = null;
      continue;
    }
    if (tag === 'h3') {
      const a = /^Статья\s+(\d+)(\^\d+)?$/.exec(text);
      if (a) {
        const id = `art-${a[1]}${a[2] ? '.' + a[2].slice(1) : ''}`;
        current = { id, paragraphs: [] };
        result.set(id, current);
      }
      continue;
    }
    if (/^Заключительные и переходные положения$/.test(text)) { inFinal = true; current = null; continue; }
    if (inFinal) {
      const pt = /^(\d+)\.\s/.exec(text);
      if (pt) {
        current = { id: `final-${pt[1]}`, paragraphs: [] };
        result.set(current.id, current);
      }
    }
    if (current) current.paragraphs.push(text);
  }
  return result;
}

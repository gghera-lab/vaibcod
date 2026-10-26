// Числа прописью для сценариев озвучивания (именительный падеж).
// Падежные формы в юридическом тексте задаются редактором через overrides — так надёжнее,
// чем автоматическое согласование.

const UNITS_M = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const UNITS_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

function triad(n: number, feminine: boolean): string[] {
  const out: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) out.push(HUNDREDS[h]);
  if (rest >= 10 && rest < 20) out.push(TEENS[rest - 10]);
  else {
    const t = Math.floor(rest / 10);
    const u = rest % 10;
    if (t) out.push(TENS[t]);
    if (u) out.push((feminine ? UNITS_F : UNITS_M)[u]);
  }
  return out;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Количественное числительное в именительном падеже (0 … 999 999). */
export function cardinal(n: number, gender: 'm' | 'f' = 'm'): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999) throw new RangeError(`cardinal: ${n}`);
  if (n === 0) return 'ноль';
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const words: string[] = [];
  if (thousands === 1) words.push('тысяча');
  else if (thousands) {
    words.push(...triad(thousands, true), plural(thousands, 'тысяча', 'тысячи', 'тысяч'));
  }
  words.push(...triad(rest, gender === 'f'));
  return words.join(' ');
}

const ORD_UNITS = ['', 'перв', 'втор', 'трет', 'четвёрт', 'пят', 'шест', 'седьм', 'восьм', 'девят'];
const ORD_TEENS = ['десят', 'одиннадцат', 'двенадцат', 'тринадцат', 'четырнадцат', 'пятнадцат', 'шестнадцат', 'семнадцат', 'восемнадцат', 'девятнадцат'];
const ORD_TENS = ['', '', 'двадцат', 'тридцат', 'сороков', 'пятидесят', 'шестидесят', 'семидесят', 'восьмидесят', 'девяност'];
const ORD_HUNDREDS = ['', 'сот', 'двухсот', 'трёхсот', 'четырёхсот', 'пятисот', 'шестисот', 'семисот', 'восьмисот', 'девятисот'];

type OrdCase = 'nom' | 'gen';

function ending(stem: string, gender: 'm' | 'f', c: OrdCase): string {
  // «второй», «шестой», «седьмой», «восьмой», «сороковой» — ударное окончание.
  const stressed = /^(втор|шест|седьм|восьм|сороков)$/.test(stem) || stem.endsWith('сороков');
  if (stem === 'трет') {
    if (gender === 'f') return c === 'nom' ? 'третья' : 'третьей';
    return c === 'nom' ? 'третий' : 'третьего';
  }
  if (gender === 'f') return stem + (c === 'nom' ? 'ая' : 'ой');
  if (c === 'gen') return stem + 'ого';
  return stem + (stressed ? 'ой' : 'ый');
}

/**
 * Порядковое числительное: «первая», «двадцать пятого», «тысяча девятьсот девяносто третьего».
 * Склоняется только последнее слово.
 */
export function ordinal(n: number, gender: 'm' | 'f' = 'm', c: OrdCase = 'nom'): string {
  if (!Number.isInteger(n) || n <= 0 || n > 9999) throw new RangeError(`ordinal: ${n}`);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const words: string[] = [];
  if (rest === 0) {
    // 1000, 2000 …: «тысячный», «двухтысячного»
    const prefix = thousands === 1 ? '' : ['', '', 'двух', 'трёх', 'четырёх', 'пяти', 'шести', 'семи', 'восьми', 'девяти'][thousands];
    return ending(prefix + 'тысячн', gender, c);
  }
  if (thousands) words.push(cardinal(thousands * 1000));
  const h = Math.floor(rest / 100);
  const r = rest % 100;
  if (r === 0) {
    words.push(ending(ORD_HUNDREDS[h], gender, c));
    return words.join(' ');
  }
  if (h) words.push(HUNDREDS[h]);
  if (r >= 10 && r < 20) words.push(ending(ORD_TEENS[r - 10], gender, c));
  else {
    const t = Math.floor(r / 10);
    const u = r % 10;
    if (u === 0) words.push(ending(ORD_TENS[t], gender, c));
    else {
      if (t) words.push(TENS[t]);
      words.push(ending(ORD_UNITS[u], gender, c));
    }
  }
  return words.join(' ');
}

/** Номер статьи/части как подпись: «67.1» → «шестьдесят семь точка один». */
export function labelNumber(label: string): string {
  return label.split('.').map((p) => cardinal(Number(p))).join(' точка ');
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** Дата в родительном падеже: (12, 12, 1993) → «двенадцатого декабря тысяча девятьсот девяносто третьего года». */
export function dateGenitive(day: number, month: number, year: number): string {
  return `${ordinal(day, 'm', 'gen')} ${MONTHS_GEN[month - 1]} ${ordinal(year, 'm', 'gen')} года`;
}

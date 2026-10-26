// Форматирование для интерфейса на русском языке.

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function duration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return ms > 0 ? 'меньше минуты' : '0 мин';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function dateRu(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function greeting(name: string | null): string {
  const h = new Date().getHours();
  const part = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
  return name ? `${part}, ${name}` : part;
}

export function interval(days: number): string {
  const minutes = Math.round(days * 24 * 60);
  if (minutes < 60) return `${Math.max(1, minutes)} мин`;
  const hours = Math.round(days * 24);
  if (hours < 24) return `${hours} ч`;
  const d = Math.round(days);
  if (d < 31) return `${d} ${plural(d, 'день', 'дня', 'дней')}`;
  const m = Math.round(days / 30);
  return `${m} мес`;
}

/** Номер статьи для показа: «79.1» → «79¹». */
export function artNumber(n: string): string {
  return n.replace(/\.(\d+)$/, (_, d: string) => d.split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]).join(''));
}

/** Строка поиска без регистра и «ё». */
export const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

// Локальное хранилище для удобств конкретного устройства (недавние документы, последняя позиция
// для мгновенного продолжения). Основные данные хранятся на сервере.

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`pns:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(`pns:${key}`, JSON.stringify(value));
  } catch {
    /* хранилище недоступно (приватный режим) — не критично */
  }
}

export function pushRecent(docId: string) {
  const list = load<string[]>('recent-docs', []).filter((x) => x !== docId);
  list.unshift(docId);
  save('recent-docs', list.slice(0, 8));
}

// Работа с датами: «день» активности считается по московскому времени (основная аудитория).

const TZ_OFFSET_MIN = 180; // Europe/Moscow, UTC+3 без перехода на летнее время

export function dayKey(d: Date = new Date()): string {
  const shifted = new Date(d.getTime() + TZ_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** Час по московскому времени (0–23). */
export function moscowHour(d: Date = new Date()): number {
  return new Date(d.getTime() + TZ_OFFSET_MIN * 60_000).getUTCHours();
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

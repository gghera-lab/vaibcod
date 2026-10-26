// Продуктовые события: копятся в очереди и отправляются пачкой. Персональные данные не передаются.

import type { AnalyticsEventName } from '@pravo/shared';
import { api } from './api.ts';

type Props = Record<string, string | number | boolean | null>;
const queue: { name: AnalyticsEventName; props?: Props }[] = [];
let timer: number | null = null;
let enabled = true;

export function setAnalyticsEnabled(on: boolean) {
  enabled = on;
  if (!on) queue.length = 0;
}

export function track(name: AnalyticsEventName, props?: Props) {
  if (!enabled) return;
  queue.push({ name, props });
  if (queue.length >= 20) void flush();
  else if (timer == null) timer = window.setTimeout(() => void flush(), 5000);
}

export async function flush(keepalive = false) {
  if (timer != null) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const events = queue.splice(0, 50);
  try {
    await api('/api/analytics', { method: 'POST', body: { events }, keepalive });
  } catch {
    /* аналитика не должна мешать работе приложения */
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush(true);
  });
}

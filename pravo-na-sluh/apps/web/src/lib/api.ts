// HTTP-клиент API: подпись Telegram initData в каждом запросе, единый формат ошибок.

import type { PublicConfig } from '@pravo/shared';
import { inTelegram, tg } from './telegram.ts';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

let initData: string | null = inTelegram ? tg!.initData : null;
let initPromise: Promise<string | null> | null = null;
const DEV_KEY = 'pns_dev_init_data';

/** Получить initData: из Telegram или (в режиме разработки) тестовые подписанные данные с сервера. */
export function ensureAuth(config: PublicConfig): Promise<string | null> {
  if (initData) return Promise.resolve(initData);
  if (!config.devAuth) return Promise.resolve(null);
  initPromise ??= (async () => {
    try {
      const cached = sessionStorage.getItem(DEV_KEY);
      if (cached) return (initData = cached);
    } catch { /* приватный режим */ }
    const res = await fetch('/api/dev/init-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot: 1, firstName: 'Тестовый пользователь' }) });
    if (!res.ok) return null;
    const data = (await res.json()) as { initData: string };
    try { sessionStorage.setItem(DEV_KEY, data.initData); } catch { /* ignore */ }
    return (initData = data.initData);
  })();
  return initPromise;
}

export function resetDevAuth() {
  try { sessionStorage.removeItem(DEV_KEY); } catch { /* ignore */ }
  initData = inTelegram ? tg!.initData : null;
  initPromise = null;
}

export function authHeader(): Record<string, string> {
  return initData ? { Authorization: `tma ${initData}` } : {};
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; keepalive?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? 'GET',
      headers: { ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...authHeader() },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      keepalive: opts.keepalive,
      signal: opts.signal,
    });
  } catch {
    throw new ApiError(0, 'network', navigator.onLine ? 'Не удалось связаться с сервером. Проверьте подключение.' : 'Нет подключения к интернету');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? `Ошибка ${res.status}`);
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });
export const put = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body: body ?? {} });
export const patch = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: body ?? {} });
export const del = <T>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });

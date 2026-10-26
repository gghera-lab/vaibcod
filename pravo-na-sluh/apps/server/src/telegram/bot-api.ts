// Минимальный клиент Telegram Bot API (без сторонних библиотек).
// Документация: https://core.telegram.org/bots/api

export interface BotClient {
  readonly enabled: boolean;
  call<T = unknown>(method: string, params: Record<string, unknown>): Promise<T>;
}

export class TelegramApiError extends Error {
  constructor(public method: string, public description: string, public errorCode?: number) {
    super(`Telegram API ${method}: ${description}`);
  }
}

export class BotApi implements BotClient {
  readonly enabled = true;
  constructor(private token: string, private baseUrl = 'https://api.telegram.org') {}

  async call<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseUrl}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = (await res.json().catch(() => null)) as { ok: boolean; result?: T; description?: string; error_code?: number } | null;
    if (!data?.ok) throw new TelegramApiError(method, data?.description ?? `HTTP ${res.status}`, data?.error_code);
    return data.result as T;
  }
}

/** Заглушка для режима без бота: явно сообщает, что Telegram не подключён. Ничего не отправляет. */
export class DisabledBot implements BotClient {
  readonly enabled = false;
  readonly calls: { method: string; params: Record<string, unknown> }[] = [];
  async call<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
    this.calls.push({ method, params });
    return true as T;
  }
}

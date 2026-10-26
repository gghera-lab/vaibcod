// Проверка подлинности Telegram Mini App initData на сервере.
// Алгоритм: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//   secret_key = HMAC_SHA256(key = "WebAppData", data = bot_token)
//   hash       = hex(HMAC_SHA256(key = secret_key, data = data_check_string))
//   data_check_string — все поля, кроме hash, отсортированные по ключу, «key=value» через \n.

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export class InitDataError extends Error {
  constructor(public code: 'missing' | 'bad_hash' | 'expired' | 'malformed', message: string) {
    super(message);
  }
}

function dataCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

function secretKey(botToken: string): Buffer {
  return createHmac('sha256', 'WebAppData').update(botToken).digest();
}

export function validateInitData(initData: string, botToken: string, maxAgeSec: number, nowSec = Math.floor(Date.now() / 1000)): {
  user: TelegramUser;
  authDate: number;
  startParam: string | null;
} {
  if (!initData) throw new InitDataError('missing', 'initData отсутствует');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) throw new InitDataError('malformed', 'Нет корректного hash');
  const expected = createHmac('sha256', secretKey(botToken)).update(dataCheckString(params)).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new InitDataError('bad_hash', 'Подпись initData не прошла проверку');
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || authDate <= 0) throw new InitDataError('malformed', 'Нет auth_date');
  if (nowSec - authDate > maxAgeSec) throw new InitDataError('expired', 'initData устарели — перезапустите Mini App');
  if (authDate - nowSec > 300) throw new InitDataError('malformed', 'auth_date в будущем');
  let user: TelegramUser;
  try {
    user = JSON.parse(params.get('user') ?? '');
  } catch {
    throw new InitDataError('malformed', 'Нет данных пользователя');
  }
  if (!user || typeof user.id !== 'number') throw new InitDataError('malformed', 'Нет id пользователя');
  return { user, authDate, startParam: params.get('start_param') };
}

/** Подписывает initData (используется в тестах и в режиме разработки DEV_AUTH). */
export function signInitData(user: TelegramUser, botToken: string, authDate = Math.floor(Date.now() / 1000), extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: 'dev', user: JSON.stringify(user), ...extra });
  const hash = createHmac('sha256', secretKey(botToken)).update(dataCheckString(params)).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

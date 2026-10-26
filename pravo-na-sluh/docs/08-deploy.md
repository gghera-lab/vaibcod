# Запуск и эксплуатация

## 1. Telegram-бот

1. @BotFather → `/newbot` → получить токен (`BOT_TOKEN`) и имя (`BOT_USERNAME`).
2. @BotFather → `/mybots` → бот → **Payments**: для Telegram Stars провайдер не нужен (валюта XTR); убедиться, что продажа цифровых товаров за Stars доступна боту.
3. @BotFather → **Bot Settings → Configure Mini App** (или Menu Button) — URL `PUBLIC_URL` (HTTPS). Команда `npm run bot:setup -w @pravo/server` сама ставит webhook с секретом, команды (`/start`, `/support`, `/paysupport`, `/terms`) и кнопку меню «Слушать».
4. Для проверки оплаты без реальных Stars — тестовая среда Telegram (отдельный тестовый аккаунт и бот в test DC, см. core.telegram.org/bots/webapps#testing-mini-apps) или `PAYMENTS_MODE=sandbox` локально.

## 2. Сервер, домен и HTTPS

- Сервер в РФ (требование локализации баз данных с персональными данными граждан РФ — ч. 5 ст. 18 152-ФЗ; уточнить с юристом), например VPS 2 vCPU / 4 ГБ + управляемый PostgreSQL 15+.
- Домен → A-запись на сервер. HTTPS обязателен для Mini App и webhook: Caddy (автосертификаты Let's Encrypt) или nginx + certbot.

Пример Caddyfile:

```
pravo.example.ru {
  encode gzip
  reverse_proxy 127.0.0.1:8080
}
```

## 3. Конфигурация

Скопировать `.env.example` в `.env` и заполнить: `NODE_ENV=production`, `PUBLIC_URL`, `DATABASE_URL`, `BOT_TOKEN`, `BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` (случайные 32+ символов), `PAYMENTS_MODE=stars`, `DEV_AUTH=false`, `ADMIN_TELEGRAM_IDS`, `SUPPORT_CONTACT`. В production сервер не запустится без обязательных переменных и с `DEV_AUTH`/`sandbox`/PGlite.

## 4. Запуск

Docker:

```bash
docker compose up -d --build
```

Без Docker:

```bash
npm ci
```

```bash
npm run build
```

```bash
npm start
```

Миграции и загрузка справочных данных выполняются при старте (`AUTO_MIGRATE`, `AUTO_SEED`); вручную — `npm run db:migrate`, `npm run db:seed`.

## 5. Аудио

- Файлы лежат в `storage/audio/constitution/<редакция>/<голос>/` (`*.mp3`, `book.mp3`, `manifest.json`).
- Вариант А: сервер раздаёт их сам (`/media/audio`, Range-запросы, кеш 1 день).
- Вариант Б (рекомендуется): загрузить каталог в S3-совместимое хранилище с CDN (Yandex Object Storage, Selectel) и указать `AUDIO_BASE_URL=https://cdn…/audio`; `manifest.json` остаётся на сервере (`AUDIO_DIR`) — по нему строится плейлист.
- После загрузки нового голоса или замены статьи — перезапустить сервер (seed обновит треки); недостающие файлы помечаются «недоступно», плеер показывает это состояние честно.

## 6. Синтез речи

См. docs/04-audio-production.md. Кратко: `YANDEX_API_KEY` в `.env` → `npm run audio:synthesize -- --voice speechkit-ermil --dry-run` (оценка стоимости) → синтез → `npm run audio:qc` → ручная проверка → `default: true` в `content/voices.json`.

## 7. Платежи

`PAYMENTS_MODE=stars`, бот с webhook. Проверка: купить тариф в тестовой среде → в БД `payments.status = paid`, `subscriptions` активна; отмена автопродления — кнопка в приложении; возврат — `npm run billing:refund -w @pravo/server -- --payment <id>`. Цены — `content/tariffs.json` (новые цены действуют для новых покупок; уже оформленные подписки Stars продлеваются по прежней цене).

## 8. Обновление законодательства

1. Скачать новую версию страницы ИПС в `content/constitution/source/` (обновить дату в `sources.json`).
2. `npm run constitution:parse` → `npm run constitution:verify` (ошибки структуры и необъяснённые расхождения останавливают процесс).
3. `npm run constitution:script` — сломавшиеся замены покажут, какие фрагменты изменились.
4. `npm run constitution:cards` — карточки с цитатами, которых больше нет в тексте, не соберутся (их нужно исправить).
5. `npm run audio:synthesize` (пересинтезируются только изменённые фрагменты) → `audio:book` → `audio:qc` → вычитка.
6. Перезапуск: новая редакция станет текущей, прогресс пользователей сохранится (по ключам статей), статьи показывают метку редакции.
7. Каталог: обновить `ips-verification.json` поиском ИПС и выполнить `npm run catalog:build`.
8. Проверка актуальности — не реже раза в месяц и при каждом изменении Конституции (по перечню изменений в шапке документа ИПС).

## 9. Первый администратор

Добавить свой Telegram ID в `ADMIN_TELEGRAM_IDS` → в Профиле появится «Метрики продукта» (`/admin`).

## 10. Резервное копирование

- PostgreSQL: ежедневный `pg_dump` с хранением 14 дней + еженедельный за 3 месяца (или встроенные бэкапы управляемой БД).
- Аудио и `content/` — версия в git (кроме mp3) + копия хранилища.
- Проверка восстановления раз в квартал на тестовом стенде.

## 11. Обновление приложения

`git pull` → `npm ci` → `npm test` → `npm run build` → перезапуск (`docker compose up -d --build`). Миграции применяются автоматически при старте; перед миграцией — бэкап БД.

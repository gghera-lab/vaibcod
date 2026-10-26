# Архитектура

## Стек и почему

| Слой | Выбор | Обоснование |
|---|---|---|
| Mini App | React 19 + TypeScript + Vite 6, React Router, TanStack Query | быстрый мобильный SPA, кеш запросов и повторные попытки |
| Стили | собственная дизайн-система на CSS-переменных (вместо Tailwind) | прямое сопоставление с темой Telegram `--tg-theme-*`, безопасными зонами и тёмной темой; без лишних зависимостей |
| Telegram | официальный `telegram-web-app.js` | initData, тема, BackButton, HapticFeedback, openInvoice |
| API | Node.js + Fastify 5 + Zod | быстрый, строгая валидация входных данных |
| БД | PostgreSQL + Drizzle ORM (миграции drizzle-kit) | локально и в тестах — PGlite (тот же PostgreSQL в WASM), без установки |
| Аудио | MP3 (CBR) в объектном хранилище/CDN; сервер умеет раздавать сам с Range-запросами | перемотка и кеширование |
| Платежи | Telegram Stars (XTR) через Bot API + sandbox | правила Telegram для цифровых товаров |
| TTS | интерфейс провайдера: Windows OneCore (бета), Yandex SpeechKit v3 (продакшн), импорт записей диктора | без привязки к одному поставщику |

Монолит без микросервисов: один процесс раздаёт API и собранный Mini App.

## Структура

```
apps/server     API, миграции (drizzle/), seed, бот, платежи, тесты (test/)
apps/web        Mini App (src/screens, src/components, src/player)
packages/shared типы API, структура Конституции, SRS, числа прописью, словарь произношения
content/        официальные источники, разобранный текст, сценарий озвучки, карточки, каталог, тарифы, голоса
scripts/        разбор и сверка текста, сценарий, карточки, синтез/QC/импорт аудио, каталог, финмодель
storage/audio   аудио по редакциям и голосам + manifest.json (в git не хранится)
docs/           документация и юридические проекты
```

## Модель данных (29 таблиц)

- **Пользователи:** `users` (Telegram ID, имя, согласие с условиями, отказ от аналитики), `user_settings`.
- **Каталог и тексты:** `legal_documents` (реквизиты, статус, источник, дата сверки, статус аудио), `document_editions` (редакция: ключ, перечень изменений, источник, SHA-256 исходника, итоги сверки, текущая ли), `document_chapters`, `document_articles` (единицы текста JSON, пометки редакции).
- **Аудио:** `voice_profiles`, `audio_tracks` (трек на статью: файл, длительность, SHA-256, таймкоды сегментов → единицы текста), `audio_books` (непрерывный файл книги и смещения треков).
- **Прослушивание:** `listening_progress` (место остановки), `track_progress` (прослушано мс, завершено), `daily_activity` (минуты, ответы — для серий), `favorites`, `bookmarks`.
- **Запоминание:** `memory_cards` (вопрос, ответ, цитата, источник, уровень), `quiz_attempts`, `quiz_answers`, `review_states` (SM-2), `review_logs`.
- **Монетизация:** `products`, `subscriptions`, `payments` (уникальный `telegram_charge_id`), `payment_events` (журнал обновлений, уникальный `update_id`).
- **Спрос:** `audio_requests` (сообщить о выходе), `votes`, `notifications` (очередь бота).
- **Служебные:** `analytics_events`, `feedback`, `audit_log`.

Версионность: прогресс и аудио привязаны к `document_editions`; при новой редакции создаётся новая запись, старая перестаёт быть текущей, пользователю показывается, какую редакцию он слушал (метка в статье и плеере). Удаление пользователя каскадно удаляет его данные; платёжные записи обезличиваются в журнале аудита.

## API (основное)

| Метод | Путь | Доступ |
|---|---|---|
| GET | `/api/config`, `/api/health` | публично |
| POST | `/api/dev/init-data` | только `DEV_AUTH` и не production |
| GET/POST/PATCH/DELETE | `/api/me`, `/api/me/onboarding`, `/api/me/settings`, `/api/me/privacy`, `/api/me/stats`, `/api/me/export` | пользователь |
| GET | `/api/catalog?q&category&audio&favorites&sort`, `/api/catalog/categories`, `/api/catalog/upcoming`, `/api/documents/:id` | публично (флаги — для пользователя) |
| PUT | `/api/documents/:id/favorite|notify|vote` | пользователь |
| GET | `/api/constitution`, `/api/constitution/articles/:key`, `/api/constitution/playlist?voice`, `/api/constitution/search?q` (поиск по тексту статей, фрагмент с совпадением) | публично |
| PUT | `/api/constitution/articles/:key/favorite` | пользователь |
| GET/PUT | `/api/progress/constitution` | пользователь |
| GET/POST/DELETE | `/api/favorites`, `/api/bookmarks` | пользователь (только свои) |
| GET/POST | `/api/memory/overview`, `/api/memory/queue`, `/api/memory/cards/:id/answer`, `/api/quiz`, `/api/quiz/:id/answer`, `/api/quiz/:id/finish` | пользователь; Pro-карточки → 402 |
| GET/POST | `/api/billing/products`, `/subscription`, `/payments`, `/payments/:id`, `/invoice`, `/auto-renew`, `/restore`, `/sandbox/:id/complete` | пользователь; sandbox — только в режиме sandbox |
| POST | `/api/analytics`, `/api/feedback` | с ограничением частоты |
| GET | `/api/legal/:doc` | публично |
| GET | `/api/admin/metrics` | администратор (`ADMIN_TELEGRAM_IDS`) |
| POST | `/telegram/webhook` | секрет `X-Telegram-Bot-Api-Secret-Token` |
| GET | `/media/audio/**.mp3` | Range-запросы, кеш |

Ошибки: `{ error: { code, message, details? } }`; 400 validation, 401 auth_*, 402 pro_required, 403 forbidden, 404, 409 payments_disabled/sandbox_disabled, 429, 500 без подробностей.

## Безопасность

- `initData` проверяется на каждом запросе (HMAC, свежесть `auth_date`); Telegram ID берётся только из подписи.
- Доступ Pro вычисляется на сервере; клиентский статус оплаты не учитывается — после `openInvoice` клиент опрашивает сервер.
- Webhook защищён секретом (сравнение постоянного времени); повторные обновления и повторные `charge_id` не обрабатываются дважды.
- Zod-валидация всех входных данных; SQL — только параметризованные запросы Drizzle.
- Ограничение частоты (по пользователю/IP), лимиты на закладки и голоса, ограничение засчитываемого времени прослушивания.
- Секреты только в переменных окружения сервера; проверено, что в клиентской сборке их нет.
- Заголовки `nosniff`, `Referrer-Policy`, `Permissions-Policy`; `X-Frame-Options` не ставится (Mini App открывается во фрейме Telegram Web).
- Журнал аудита: согласия, счета, платежи, возвраты, отмены, удаление аккаунтов.
- Конфигурация production запрещает `DEV_AUTH`, `sandbox`, PGlite и требует токен, секрет webhook и HTTPS-адрес.
- Платные аудио пока отсутствуют (Конституция бесплатна). Для будущих платных файлов — подписанные временные ссылки (S3 presigned / HMAC) после проверки доступа.

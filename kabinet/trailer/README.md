# Трейлер и графика Steam — «Кабинет · три срока»

## Готовое
- `out/Кабинет_трейлер_1080p.mp4` — трейлер 75 с, 1920×1080, 30 к/с, H.264 + AAC.
- `steam/` — графика для Steamworks (PNG):
  | Файл | Куда в Steamworks |
  |---|---|
  | Header-920x430 | Капсула-заголовок (header capsule) |
  | Header-460x215 | Старый размер заголовка (на всякий случай) |
  | Small-462x174 | Маленькая капсула |
  | Main-1232x706 | Главная капсула (616×353 — уменьшенная копия) |
  | Vertical-748x896 | Вертикальная капсула |
  | Library-600x900 | Капсула библиотеки |
  | LibraryHero-3840x1240 | Герой библиотеки (без текста — так требует Steam) |
  | LibraryLogo-1280x720 | Логотип библиотеки (прозрачный фон) |
  | PageBg-1438x810 | Фон страницы |
  | Poster-A4-2480x3508 | Афиша для печати (A4, 300 dpi) |
  | Story-1080x1920 | Афиша для сторис / вертикальных соцсетей |
- `Steam_описание.md` — короткое и полное описание, особенности, слоганы, теги.
- `Сценарий_трейлера.md` — сценарий по секундам.

## Как пересобрать
1. Кадры из игры: `node ../test/tr_cap.js start,ballot,cards,votes,modals,bunker` (Playwright, ~10 мин), звук: `node ../test/tr_audio.js themes,sfx,voice`, арт: `node ../test/tr_art.js`, `tr_art2.js`, `tr_shadow.js`.
2. `node tools/clips.js` → `node tools/norm.js` → `node tools/normseg.js` (кадры и звук в `public/`).
3. `node tools/render.js all` (или `stills` / `trailer` / `preview 100 500 …`). Просмотр в студии: `npm run studio`.

## Голос диктора (необязательно)
`tools/tts.js` озвучивает реплики через Gemini TTS; ключ берётся только из переменной `GEMINI_API_KEY`.
Сейчас Google отвечает «регион не поддерживается» — нужен VPN. Получившиеся `public/audio/vo_*.wav` потом добавляются в `src/Trailer.tsx`.

Шрифты (PT Serif, PT Sans, Balsamiq Sans, Press Start 2P) — из игры, лицензия OFL. Музыка и звуки — синтез движка игры.

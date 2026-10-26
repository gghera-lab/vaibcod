# Звук «Кабинета» · Пакет 21

Весь звук игры синтезируется в коде (Web Audio), без внешних файлов и лицензий: эффекты, «кошачья речь», музыка и эмбиент. Движок — блок `<script id="p21-sound">` в конце `kabinet.html`. Живая озвучка через Gemini необязательна: это только дополнение к ключевым фразам.

## Файлы

| Путь | Что это |
|---|---|
| `kabinet.html` | Рабочая копия: движок + 9 однострочных хуков `/* ПАКЕТ 21 · ЗВУК */` |
| `sound.patch` | `git diff --no-index` от базы `base/kabinet_hd_5.html` |
| `changes.md` | Карта «событие → звук → место в коде», голоса котов, музыкальные состояния |
| `test/sound.test.js` | Проверка в Playwright: `node work\sound\test\sound.test.js` |
| `gemini/generate.mjs` | Генератор живой озвучки ключевых фраз (Gemini TTS) |

## Быстрые команды в консоли браузера

```js
SFX.play('paper.stamp')                       // любой звук из SFX.list().sfx
SFX.say('kogtev', 'Господин президент, подпишите.')   // кошачья речь
SFX.scene('night', 60)                        // тема на 60 с (пролог 4:09 / ночь 4:12); SFX.scene(null) — сброс
SFX.setVolume('music', .4); SFX.mute(true)    // громкость шины / выключить звук
SFX.state()                                   // контекст, тема, напряжение, эмбиент
```

## Живая озвучка через Gemini (по желанию)

1. Получите ключ в Google AI Studio: https://aistudio.google.com/apikey
2. Задайте его **только в переменной окружения** (в файлы ключ не записывается) и запустите генератор:
   ```powershell
   $env:GEMINI_API_KEY = "ваш_ключ"
   node work\sound\gemini\generate.mjs           # всё
   node work\sound\gemini\generate.mjs --dry     # только план, без запросов
   node work\sound\gemini\generate.mjs --only=prolog_409_a,clock_410 --force
   ```
   Без переменной скрипт сразу выходит и объясняет, что делать.
   Модель по умолчанию — `gemini-3.8-flash-tts`, запрос идёт в `POST https://generativelanguage.googleapis.com/v1beta/interactions`. Другую модель можно задать через `GEMINI_TTS_MODEL`. Если Interactions API недоступен, скрипт пробует старый путь `models/gemini-2.5-flash-preview-tts:generateContent`.
3. Результат:
   - `gemini/out/*.wav`: 24 кГц, моно, 16 бит;
   - `gemini/out/manifest.json`;
   - `gemini/voice-pack.js`: те же WAV в base64, в `window.KAB_VOICE_PACK`.

### Как подключить к игре

**Вариант А: один файл (Telegram, просто открыть HTML).** Вставьте содержимое `voice-pack.js` в `kabinet.html` отдельным `<script>` **перед** `<script id="p21-sound">`. Либо положите `voice-pack.js` рядом с игрой и подключите так: `<script src="voice-pack.js"></script>`. Тег `<script src>` работает и по `file://`, в отличие от `fetch`. Движок сам вызовет `SFX.loadPack(window.KAB_VOICE_PACK)`.

**Вариант Б: сборка для Steam (Electron / NW.js).** Положите `out/*.wav` в папку `audio/` рядом с игрой и загрузите их списком:
```js
SFX.loadPack({ items: [{ id: 'clock_410', who: 'narr', text: 'На столе указ…', src: 'audio/clock_410.wav' }] });
```

### Как фразы попадают в игру

- **Реплики персонажей.** Если текст реплики совпадает с `text` из пакета (без учёта регистра и знаков препинания), `SFX.say` проигрывает живой голос вместо «мяу». Это касается реплик в карточках, в телефоне и у Депутата. В меню появляется переключатель «Живая озвучка ключевых фраз».
- **Сцены** (пролог «4:09», часы 4:10 и 4:11, ночь 4:12): вызов `SFX.playClip('prolog_409_a')` в коде сцены, рядом с `SFX.scene('night')`. Сюжет трёх сроков ещё не внедрён, поэтому эти вызовы нужно добавить, когда появятся сцены.
- Список фраз и голосов лежит в массивах `LINES` и `CAST` в начале `generate.mjs`. Чтобы добавить фразу, допишите строку в `LINES` и перезапустите генератор: готовые WAV не перезаписываются, если не передать `--force`.

Перед релизом проверьте условия использования Gemini API для коммерческого распространения сгенерированного аудио. Синтезированный в коде звук ограничений не имеет.

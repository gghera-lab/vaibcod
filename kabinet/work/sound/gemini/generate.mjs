#!/usr/bin/env node
/* ПАКЕТ 21 · ЗВУК — генерация живой озвучки ключевых фраз «Кабинета» через Gemini TTS.
 *
 * Ключ берётся ТОЛЬКО из переменной окружения GEMINI_API_KEY (в файлы не пишется).
 *   PowerShell:  $env:GEMINI_API_KEY = "…";  node work\sound\gemini\generate.mjs
 *   bash:        GEMINI_API_KEY=… node work/sound/gemini/generate.mjs
 *
 * Параметры (необязательно):
 *   --only=id1,id2     сгенерировать только эти фразы
 *   --force            перезаписать уже готовые WAV
 *   --dry              ничего не отправлять, только показать план
 *   GEMINI_TTS_MODEL   модель (по умолчанию gemini-3.8-flash-tts; запасной путь — gemini-2.5-flash-preview-tts через generateContent)
 *
 * Результат: gemini/out/<id>.wav (24 кГц, моно, 16 бит), gemini/out/manifest.json
 * и gemini/voice-pack.js (window.KAB_VOICE_PACK с WAV в base64) — его подключают к игре, см. README.md.
 * Эндпоинты сверены с https://ai.google.dev/gemini-api/docs/speech-generation (октябрь 2026):
 *   POST https://generativelanguage.googleapis.com/v1beta/interactions, заголовок x-goog-api-key,
 *   ответ: steps[].content[] с type "audio" (data — base64 WAV).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const KEY = process.env.GEMINI_API_KEY;
const ARGS = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts';
const LEGACY_MODEL = process.env.GEMINI_TTS_LEGACY_MODEL || 'gemini-2.5-flash-preview-tts';
const API = 'https://generativelanguage.googleapis.com/v1beta';

if (!KEY && !ARGS.dry) {
  console.error('\n[generate] Не задана переменная окружения GEMINI_API_KEY — генерация не запускается.\n' +
    '  PowerShell:  $env:GEMINI_API_KEY = "ваш_ключ"; node work\\sound\\gemini\\generate.mjs\n' +
    '  bash:        GEMINI_API_KEY=ваш_ключ node work/sound/gemini/generate.mjs\n' +
    '  Ключ: https://aistudio.google.com/apikey . В файлы ключ не записывается.\n' +
    '  Без ключа можно посмотреть план:  node work/sound/gemini/generate.mjs --dry\n');
  process.exit(1);
}

/* Голоса Gemini (готовые) под персонажей. Кошачий характер задаётся стилем. */
const CAST = {
  narr:    { voice: 'Charon',     style: 'низкий спокойный голос рассказчика, неторопливо, с паузами, как в старом документальном кино' },
  kogtev:  { voice: 'Algenib',    style: 'вкрадчиво, бархатно, чуть насмешливо, как сытый кот, который всё решил заранее' },
  ten:     { voice: 'Enceladus',  style: 'почти шёпотом, медленно, холодно' },
  asya:    { voice: 'Leda',       style: 'быстро, живо, напористо, журналистка с диктофоном' },
  gen:     { voice: 'Fenrir',     style: 'рублено, по-военному, хрипловато' },
  baba:    { voice: 'Vindemiatrix', style: 'по-доброму, с бабушкиной интонацией, немного дрожащим голосом' },
  boss:    { voice: 'Orus',       style: 'низко, медленно, с ленцой и угрозой, как дон' },
  adviser: { voice: 'Schedar',    style: 'гладко, вежливо, без эмоций' },
  hero9:   { voice: 'Iapetus',    style: 'прямо, честно, твёрдо' },
  voter:   { voice: 'Sulafat',    style: 'тихо, но непреклонно, пожилая учительница' },
  ks:      { voice: 'Rasalgethi', style: 'торжественно и медленно, председатель суда' },
  d_tvs:   { voice: 'Alnilam',    style: 'дикторская подача новостей, ровно и официально' },
  me:      { voice: 'Achird',     style: 'сдержанно, устало, президент в три часа ночи' }
};
/* Ключевые фразы. text совпадает с репликой в игре (так её находит SFX.say) или звучит как сцена (SFX.playClip(id)). */
const LINES = [
  { id: 'prolog_409_a', who: 'narr', text: 'Четыре часа девять минут. Темно. За стеной что-то гудит.', scene: 'Пролог «4:09»' },
  { id: 'prolog_409_b', who: 'narr', text: 'На столе лист с вашей подписью. Тот же нажим, та же завитушка. Но текст закрыт чужой лапой.', scene: 'Пролог «4:09»' },
  { id: 'prolog_409_c', who: 'narr', text: 'Восемнадцать лет назад.', scene: 'Пролог — титр' },
  { id: 'oath_ks', who: 'ks', text: 'Прошу вас. Текст на пюпитре. Лапу — на Конституцию.', scene: 'Присяга' },
  { id: 'cands_kogtev', who: 'kogtev', text: 'Трое. Технократ, друг и оппозиционерка. Дума любит второго, рынки — первого, улица — третью.', scene: 'Выбор премьера' },
  { id: 'gen_situation', who: 'gen', text: 'Обстановка сложная. Я её знаю. Остальные — читали о ней.', scene: 'Совбез' },
  { id: 'facsimile_kogtev', who: 'kogtev', text: 'Пока вы были на дамбе, мы не стали вас дёргать.', scene: 'I срок · «Факсимиле»' },
  { id: 'p1408_voter', who: 'voter', text: 'Я этот протокол не подпишу. Цифры не мои.', scene: 'I срок · «Протокол 1408»' },
  { id: 'kotov_truth', who: 'hero9', text: 'Погибших сорок семь. Я подпишу только настоящую сводку.', scene: 'I срок · «Сводка»' },
  { id: 'clock_410', who: 'narr', text: 'На столе указ о новом правительстве. Подпись на нём уже стоит.', scene: 'Конец I срока · часы 4:10' },
  { id: 'clock_411', who: 'narr', text: 'Первой бумагой третьего срока Гладкий приносит регламент доступа на четырёх страницах.', scene: 'Конец II срока · часы 4:11' },
  { id: 'nightcall_ten', who: 'ten', text: 'Утро наступит. Но уже не ваше.', scene: '«На волоске» · «Особый режим»' },
  { id: 'night412_me', who: 'me', text: 'Соедините меня с охраной. Немедленно.', scene: 'Ночь 4:12' },
  { id: 'night412_narr', who: 'narr', text: 'Четыре часа двенадцать минут. Приказ ушёл по цепочке. Решает тот, кто стоит в её конце.', scene: 'Ночь 4:12' },
  { id: 'news_tv', who: 'd_tvs', text: 'Добрый вечер. В эфире главные новости Мурландии.', scene: 'Новости по ТВ' },
  { id: 'boss_deal', who: 'boss', text: 'Мы же с вами договоримся, правда?', scene: 'Теневая ситуация' },
  { id: 'asya_question', who: 'asya', text: 'Можно один вопрос? Только один!', scene: 'Пресса' },
  { id: 'baba_pension', who: 'baba', text: 'Сынок, пенсию-то когда прибавят…', scene: 'Встреча с избирателями' }
];

const wavHeader = (dataLen, sr = 24000, ch = 1, bits = 16) => { const b = Buffer.alloc(44); b.write('RIFF', 0); b.writeUInt32LE(36 + dataLen, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * ch * bits / 8, 28); b.writeUInt16LE(ch * bits / 8, 32); b.writeUInt16LE(bits, 34); b.write('data', 36); b.writeUInt32LE(dataLen, 40); return b; };
const asWav = (buf) => buf.slice(0, 4).toString() === 'RIFF' ? buf : Buffer.concat([wavHeader(buf.length), buf]); // сырой PCM L16 → WAV
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function viaInteractions(line, cast) {
  const body = { model: MODEL, input: [{ type: 'user_input', content: [{ type: 'text', text: line.text, annotations: [{ type: 'speech_metadata', style: cast.style }] }] }], response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice: cast.voice }] } };
  const r = await fetch(`${API}/interactions`, { method: 'POST', headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { const e = new Error(`interactions HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`); e.status = r.status; throw e; }
  const j = await r.json();
  const aud = (j.steps || []).filter(s => s.type === 'model_output').flatMap(s => s.content || []).filter(c => c.type === 'audio').pop() || (j.output_audio ? { data: j.output_audio.data } : null);
  if (!aud || !aud.data) throw new Error('в ответе нет аудио');
  return asWav(Buffer.from(aud.data, 'base64'));
}
async function viaGenerateContent(line, cast) { // запасной путь (старый API TTS)
  const body = { contents: [{ parts: [{ text: `Скажи ${cast.style}: ${line.text}` }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: cast.voice } } } } };
  const r = await fetch(`${API}/models/${LEGACY_MODEL}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`generateContent HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json(); const part = j.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part) throw new Error('в ответе нет inlineData');
  return asWav(Buffer.from(part.inlineData.data, 'base64'));
}
async function synth(line) {
  const cast = CAST[line.who] || CAST.narr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await viaInteractions(line, cast); }
    catch (e) {
      if (e.status === 404 || e.status === 400) { console.warn(`  · interactions недоступен (${e.status}), пробую generateContent/${LEGACY_MODEL}`); return await viaGenerateContent(line, cast); }
      if (e.status === 429 || (e.status >= 500 && attempt < 3)) { console.warn(`  · ${e.message.slice(0, 80)} — повтор через ${attempt * 5} с`); await sleep(attempt * 5000); continue; }
      throw e;
    }
  }
}

const only = ARGS.only ? String(ARGS.only).split(',') : null;
const todo = LINES.filter(l => !only || only.includes(l.id));
fs.mkdirSync(OUT, { recursive: true });
console.log(`[generate] модель ${MODEL}, фраз: ${todo.length}${ARGS.dry ? ' (dry run)' : ''}`);
let okN = 0, failN = 0;
for (const l of todo) {
  const file = path.join(OUT, l.id + '.wav');
  if (ARGS.dry) { console.log(`  ${l.id.padEnd(18)} ${String(l.who).padEnd(8)} ${(CAST[l.who] || CAST.narr).voice.padEnd(12)} «${l.text}»`); continue; }
  if (fs.existsSync(file) && !ARGS.force) { console.log(`  = ${l.id} (уже есть)`); okN++; continue; }
  try { const wav = await synth(l); fs.writeFileSync(file, wav); okN++; console.log(`  ✓ ${l.id}  ${(wav.length / 1024).toFixed(0)} КБ`); await sleep(700); }
  catch (e) { failN++; console.error(`  ✗ ${l.id}: ${e.message}`); }
}
if (ARGS.dry) process.exit(0);
const items = LINES.filter(l => fs.existsSync(path.join(OUT, l.id + '.wav'))).map(l => ({ id: l.id, who: l.who === 'narr' ? 'narr' : l.who, text: l.text, scene: l.scene, file: `out/${l.id}.wav` }));
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ model: MODEL, generated: new Date().toISOString(), items }, null, 2));
const pack = { items: items.map(it => ({ id: it.id, who: it.who, text: it.text, src: 'data:audio/wav;base64,' + fs.readFileSync(path.join(HERE, it.file)).toString('base64') })) };
fs.writeFileSync(path.join(HERE, 'voice-pack.js'), '/* ПАКЕТ 21 · ЗВУК — живая озвучка (Gemini TTS), сгенерировано generate.mjs */\nwindow.KAB_VOICE_PACK = ' + JSON.stringify(pack) + ';\nif (window.SFX && SFX.loadPack) SFX.loadPack(window.KAB_VOICE_PACK);\n');
console.log(`[generate] готово: ${okN} ок, ${failN} ошибок → ${path.join(HERE, 'voice-pack.js')}`);
process.exit(failN ? 1 : 0);

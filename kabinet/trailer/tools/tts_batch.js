// все недостающие реплики диктора одним запросом Gemini TTS (бережёт дневной лимит), затем нарезка по паузам.
// Ключ — только из GEMINI_API_KEY. Прокси VPN: NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:10809
// node tools/tts_batch.js [голос]
const fs = require('fs'), path = require('path');
const KEY = process.env.GEMINI_API_KEY; if (!KEY) { console.log('нет GEMINI_API_KEY'); process.exit(1); }
const VOICE = process.argv[2] || 'Charon', MODEL = process.env.TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const OUT = path.join(__dirname, '..', 'public', 'audio'), META = path.join(__dirname, '..', 'src', 'vo.json');
const LINES = [
  ['hook', 'Поздравляем. Вы — президент.'],
  ['land', 'Мурландия. Страна котов. Законы здесь — настоящие.'],
  ['oath', 'Присягните. Подпишите. Поставьте печать.'],
  ['remember', 'Но каждое решение кто-то запомнит.'],
  ['terms', 'Первый срок. Второй. А дальше — обнуление.'],
  ['hold', 'Сколько вы продержитесь?'],
  ['title', 'Кабинет. Три срока.'],
];
const meta = fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, 'utf8')) : {};
const todo = LINES.filter(([id]) => !(meta[id] && fs.existsSync(path.join(OUT, `vo_${id}.wav`))) || process.env.REDO);
if (!todo.length) { console.log('все реплики уже есть'); process.exit(0); }
const wav = (pcm, rate) => { const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]); };
(async () => {
  const prompt = 'Прочитай по-русски низким бархатным голосом диктора кинотрейлера, неторопливо, с лёгкой иронией. Каждую строку — отдельно, после каждой строки пауза две секунды. Читай только сами строки:\n\n' + todo.map(([, t]) => t).join('\n\n');
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } }),
  });
  const j = await r.json().catch(() => ({}));
  const part = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts.find(p => p.inlineData);
  if (!r.ok || !part) { console.log('ошибка', r.status, JSON.stringify(j.error || j).slice(0, 300)); process.exit(2); }
  const rate = +((part.inlineData.mimeType || '').match(/rate=(\d+)/) || [0, 24000])[1];
  const pcm = Buffer.from(part.inlineData.data, 'base64'); const n = pcm.length >> 1;
  fs.writeFileSync(path.join(OUT, 'vo_batch_raw.wav'), wav(pcm, rate));
  // поиск пауз: окна по 20 мс, тишина < 1.5% от пика; паузы длиннее 0.6 с — границы реплик
  const win = Math.round(rate * .02), en = []; let pk = 1;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(pcm.readInt16LE(i * 2)));
  for (let w = 0; w * win < n; w++) { let m = 0; for (let i = w * win; i < Math.min(n, (w + 1) * win); i++) m = Math.max(m, Math.abs(pcm.readInt16LE(i * 2))); en.push(m / pk); }
  const segs = []; let st = -1, sil = 0;
  for (let w = 0; w < en.length; w++) { if (en[w] > .015) { if (st < 0) st = w; sil = 0; } else if (st >= 0) { sil++; if (sil * .02 >= .6) { segs.push([st, w - sil + 1]); st = -1; sil = 0; } } }
  if (st >= 0) segs.push([st, en.length]);
  console.log('длина', (n / rate).toFixed(1) + 'с', 'фрагментов', segs.length, 'нужно', todo.length);
  if (segs.length !== todo.length) { console.log('число фрагментов не совпало — сырой файл сохранён в public/audio/vo_batch_raw.wav'); process.exit(3); }
  segs.forEach(([a, b], k) => { const s = Math.max(0, a - 3) * win, e = Math.min(n, (b + 6) * win); const id = todo[k][0]; fs.writeFileSync(path.join(OUT, `vo_${id}.wav`), wav(pcm.subarray(s * 2, e * 2), rate)); meta[id] = +((e - s) / rate).toFixed(2); console.log(id, meta[id] + 'с'); });
  fs.writeFileSync(META, JSON.stringify(meta, null, 1));
})();

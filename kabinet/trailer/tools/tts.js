// голос диктора через Gemini TTS. Ключ берётся только из переменной окружения GEMINI_API_KEY (в файлы не пишется).
// node tools/tts.js [голос]  → public/audio/vo_<id>.wav (24 кГц, моно) + src/vo.json (длительности)
const fs = require('fs'), path = require('path');
const KEY = process.env.GEMINI_API_KEY; if (!KEY) { console.log('нет GEMINI_API_KEY'); process.exit(1); }
const VOICE = process.argv[2] || 'Charon';
const MODELS = (process.env.TTS_MODEL || 'gemini-2.5-pro-preview-tts,gemini-2.5-flash-preview-tts').split(',');
const STYLE = 'Говори по-русски низким бархатным голосом диктора кинотрейлера: неторопливо, с лёгкой иронией и сдержанной угрозой, паузы на точках. Текст: ';
const LINES = [
  ['hook', 'Поздравляем. Вы — президент.'],
  ['land', 'Мурландия. Страна котов. Законы здесь — настоящие.'],
  ['oath', 'Присягните. Подпишите. Поставьте печать.'],
  ['remember', 'Но каждое решение кто-то запомнит.'],
  ['terms', 'Первый срок. Второй. А дальше — обнуление.'],
  ['hold', 'Сколько вы продержитесь?'],
  ['title', 'Кабинет. Три срока.'],
];
const OUT = path.join(__dirname, '..', 'public', 'audio'); fs.mkdirSync(OUT, { recursive: true });
const wav = (pcm, rate) => { const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]); };
(async () => {
  const meta = {};
  for (const [id, text] of LINES) {
    let ok = false;
    for (let attempt = 0, mi = 0; attempt < 8 && mi < MODELS.length; attempt++) {
      const model = MODELS[mi];
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: STYLE + text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } }),
      });
      const j = await r.json().catch(() => ({}));
      const part = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts.find(p => p.inlineData);
      if (r.status === 429) { // лимит запросов в минуту: ждём, сколько просит сервер
        const d = JSON.stringify(j.error || {}).match(/"retryDelay":"(\d+)/); const w = (d ? +d[1] : 30) + 2;
        console.log(id, model, 'лимит, ждём', w + 'с'); await new Promise(z => setTimeout(z, w * 1000)); continue;
      }
      if (!r.ok || !part) { console.log(id, model, 'ошибка', r.status, JSON.stringify(j.error || j).slice(0, 300)); mi++; continue; }
      const rate = +((part.inlineData.mimeType || '').match(/rate=(\d+)/) || [0, 24000])[1];
      const pcm = Buffer.from(part.inlineData.data, 'base64');
      fs.writeFileSync(path.join(OUT, `vo_${id}.wav`), wav(pcm, rate));
      meta[id] = +(pcm.length / 2 / rate).toFixed(2); console.log(id, model, meta[id] + 's'); ok = true; break;
    }
    if (!ok) process.exitCode = 2;
  }
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'vo.json'), JSON.stringify(meta, null, 1));
})();

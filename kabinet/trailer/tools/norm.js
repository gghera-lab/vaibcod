// громкость записей движка: усиление до целевого RMS с мягким ограничителем (tanh), 16 бит PCM WAV на месте
const fs = require('fs'), path = require('path');
const A = path.join(__dirname, '..', 'public', 'audio');
const TARGET = { mus: 4200, sfx: 5200, voice: 6500 };
for (const f of fs.readdirSync(A)) {
  if (!/^(mus_|sfx_all|voice_all).*\.wav$/.test(f)) continue;
  const p = path.join(A, f), b = fs.readFileSync(p); const d = b.indexOf('data') + 8; const n = (b.length - d) >> 1;
  let s = 0; for (let i = 0; i < n; i++) { const v = b.readInt16LE(d + i * 2); s += v * v; } const rms = Math.sqrt(s / n);
  if (rms > 2500) { console.log(f, 'уже нормализован'); continue; }
  const tgt = f.startsWith('mus') ? TARGET.mus : f.startsWith('sfx') ? TARGET.sfx : TARGET.voice; const g = tgt / Math.max(rms, 1);
  for (let i = 0; i < n; i++) { const v = b.readInt16LE(d + i * 2) / 32768 * g; b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(Math.tanh(v * 1.1) / Math.tanh(1.1) * 32000))), d + i * 2); }
  fs.writeFileSync(p, b); console.log(f, 'rms', rms.toFixed(0), '× ' + g.toFixed(2));
}

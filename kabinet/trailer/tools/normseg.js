// эффекты и реплики: каждый отрезок между отметками — к пику 0.85 (тихие подтянуть, громкие не перегрузить)
const fs = require('fs'), path = require('path');
const A = path.join(__dirname, '..', 'public', 'audio'), S = path.join(__dirname, '..', 'src');
for (const [wav, js] of [['sfx_all.wav', 'audio_sfx_all.json'], ['voice_all.wav', 'audio_voice_all.json']]) {
  const p = path.join(A, wav), b = fs.readFileSync(p); const d = b.indexOf('data') + 8; const n = (b.length - d) >> 1; const ch = 2, sr = 48000;
  const marks = Object.values(JSON.parse(fs.readFileSync(path.join(S, js), 'utf8'))).sort((x, y) => x - y);
  const edges = marks.map(t => Math.max(0, Math.round((t - .02) * sr) * ch)).concat([n]);
  for (let k = 0; k < edges.length - 1; k++) {
    let pk = 1; for (let i = edges[k]; i < edges[k + 1]; i++) pk = Math.max(pk, Math.abs(b.readInt16LE(d + i * 2)));
    const g = Math.min(8, 27850 / pk);
    for (let i = edges[k]; i < edges[k + 1]; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(b.readInt16LE(d + i * 2) * g))), d + i * 2);
  }
  fs.writeFileSync(p, b); console.log(wav, 'отрезков', edges.length - 1);
}

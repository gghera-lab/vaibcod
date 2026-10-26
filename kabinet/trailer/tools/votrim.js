// реплики диктора: срезать тишину по краям, ужать паузы внутри до MAXP секунд, записать длительности в src/vo.json
const fs = require('fs'), path = require('path');
const A = path.join(__dirname, '..', 'public', 'audio'), META = path.join(__dirname, '..', 'src', 'vo.json');
const MAXP = +(process.env.MAXP || .45);
const meta = fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, 'utf8')) : {};
for (const f of fs.readdirSync(A)) {
  const m = f.match(/^vo_([a-z]+)\.wav$/); if (!m || m[1] === 'batch') continue;
  const b = fs.readFileSync(path.join(A, f)); const rate = b.readUInt32LE(24); const p = b.subarray(44); const n = p.length >> 1;
  const win = Math.round(rate * .02); let pk = 1; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(p.readInt16LE(i * 2)));
  const loud = []; for (let w = 0; w * win < n; w++) { let mx = 0; for (let i = w * win; i < Math.min(n, (w + 1) * win); i++) mx = Math.max(mx, Math.abs(p.readInt16LE(i * 2))); loud.push(mx / pk > .02); }
  const first = loud.indexOf(true), last = loud.lastIndexOf(true); if (first < 0) continue;
  const keep = []; let run = 0; const maxW = Math.round(MAXP / .02);
  for (let w = Math.max(0, first - 2); w <= Math.min(loud.length - 1, last + 8); w++) { if (loud[w]) run = 0; else run++; if (run <= maxW) keep.push(w); }
  const out = Buffer.concat(keep.map(w => p.subarray(w * win * 2, Math.min(n, (w + 1) * win) * 2)));
  // пик к −1 дБ
  let q = 1; for (let i = 0; i < out.length >> 1; i++) q = Math.max(q, Math.abs(out.readInt16LE(i * 2))); const g = 29000 / q;
  for (let i = 0; i < out.length >> 1; i++) out.writeInt16LE(Math.round(out.readInt16LE(i * 2) * g), i * 2);
  const h = Buffer.from(b.subarray(0, 44)); h.writeUInt32LE(36 + out.length, 4); h.writeUInt32LE(out.length, 40);
  fs.writeFileSync(path.join(A, f), Buffer.concat([h, out]));
  meta[m[1]] = +((out.length >> 1) / rate).toFixed(2); console.log(m[1], (n / rate).toFixed(1) + 'с →', meta[m[1]] + 'с');
}
fs.writeFileSync(META, JSON.stringify(meta, null, 1));

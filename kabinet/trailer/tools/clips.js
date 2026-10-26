// capture → public: последовательности кадров (jpg + время) → public/seq/<имя>/ и общий индекс src/seq.json;
// снимки → public/shots/, пиксель-арт → public/art/, звук *.webm → public/audio/*.wav
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), CAP = path.join(ROOT, 'capture'), PUB = path.join(ROOT, 'public');
const ff = (args) => execFileSync(process.execPath, [path.join(ROOT, 'node_modules', '@remotion', 'cli', 'remotion-cli.js'), 'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
for (const d of ['seq', 'shots', 'art', 'audio']) fs.mkdirSync(path.join(PUB, d), { recursive: true });
const idxF = path.join(ROOT, 'src', 'seq.json'); fs.mkdirSync(path.dirname(idxF), { recursive: true });
const idx = fs.existsSync(idxF) ? JSON.parse(fs.readFileSync(idxF, 'utf8')) : {};
// только последовательности, которые стоят в монтаже (src/Trailer.tsx)
const USED = new Set((fs.readFileSync(path.join(ROOT, 'src', 'Trailer.tsx'), 'utf8').match(/['"](v_[a-z0-9_]+)['"]/gi) || []).map(x => x.slice(1, -1)));
for (const name of fs.readdirSync(CAP)) {
  const dir = path.join(CAP, name), fj = path.join(dir, 'frames.json');
  if (!fs.existsSync(fj)) continue;
  if (!USED.has(name)) { fs.rmSync(path.join(PUB, 'seq', name), { recursive: true, force: true }); continue; }
  const { frames } = JSON.parse(fs.readFileSync(fj, 'utf8')); if (!frames.length) continue;
  const out = path.join(PUB, 'seq', name); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const t0 = frames[0].t;
  for (const f of frames) fs.copyFileSync(path.join(dir, f.f), path.join(out, f.f));
  idx[name] = frames.map(f => [f.f, +(f.t - t0).toFixed(3)]);
  console.log('seq', name, frames.length, (frames[frames.length - 1].t - t0).toFixed(1) + 's');
}
fs.writeFileSync(idxF, JSON.stringify(idx));
for (const f of fs.readdirSync(CAP)) if (/\.(png|jpg)$/.test(f)) fs.copyFileSync(path.join(CAP, f), path.join(PUB, 'shots', f));
const art = path.join(CAP, 'art'); if (fs.existsSync(art)) for (const f of fs.readdirSync(art)) if (/\.png$/.test(f)) fs.copyFileSync(path.join(art, f), path.join(PUB, 'art', f));
const au = path.join(CAP, 'audio');
if (fs.existsSync(au)) for (const f of fs.readdirSync(au)) {
  if (/\.webm$/.test(f)) { const o = path.join(PUB, 'audio', f.replace('.webm', '.wav')); if (!fs.existsSync(o) || fs.statSync(o).mtimeMs < fs.statSync(path.join(au, f)).mtimeMs) ff(['-i', path.join(au, f), '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', o]); }
  if (/\.json$/.test(f)) fs.copyFileSync(path.join(au, f), path.join(ROOT, 'src', 'audio_' + f));
}
console.log('done');

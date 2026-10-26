// рендер: одна упаковка проекта → картинки Steam (PNG) и/или трейлер (MP4 H.264, AAC)
// node tools/render.js stills|trailer|all [кадр-превью ...]
const path = require('path'), fs = require('fs');
const { bundle } = require('@remotion/bundler');
const { selectComposition, renderStill, renderMedia } = require('@remotion/renderer');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'out'); fs.mkdirSync(OUT, { recursive: true });
const what = process.argv[2] || 'all', previews = process.argv.slice(3).map(Number);
(async () => {
  const t0 = Date.now();
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src', 'index.ts'), publicDir: path.join(ROOT, 'public') });
  console.log('bundle', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  if (what === 'stills' || what === 'all') {
    for (const id of ['Header-920x430', 'Header-460x215', 'Small-462x174', 'Main-1232x706', 'Main-616x353', 'Vertical-748x896', 'Library-600x900', 'LibraryHero-3840x1240', 'LibraryLogo-1280x720', 'PageBg-1438x810', 'Poster-A4-2480x3508', 'Story-1080x1920']) {
      const composition = await selectComposition({ serveUrl, id });
      await renderStill({ composition, serveUrl, output: path.join(OUT, id + '.png'), imageFormat: 'png' });
      console.log('still', id);
    }
  }
  if (what === 'preview') {
    const composition = await selectComposition({ serveUrl, id: 'Trailer' });
    for (const f of previews) { await renderStill({ composition, serveUrl, frame: f, output: path.join(OUT, 'prev', `f${String(f).padStart(4, '0')}.jpg`), imageFormat: 'jpeg', jpegQuality: 80, scale: .5 }); }
    console.log('preview', previews.length);
  }
  if (what === 'trailer' || what === 'all') {
    const composition = await selectComposition({ serveUrl, id: 'Trailer' });
    let last = -1;
    await renderMedia({ composition, serveUrl, codec: 'h264', crf: 16, audioCodec: 'aac', audioBitrate: '320k', outputLocation: path.join(OUT, 'Кабинет_трейлер_1080p.mp4'), concurrency: 4, jpegQuality: 92,
      onProgress: ({ progress }) => { const p = Math.floor(progress * 20); if (p !== last) { last = p; console.log('render', (progress * 100).toFixed(0) + '%', ((Date.now() - t0) / 1000).toFixed(0) + 's'); } } });
    console.log('trailer done');
  }
  console.log('total', ((Date.now() - t0) / 1000).toFixed(0) + 's');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

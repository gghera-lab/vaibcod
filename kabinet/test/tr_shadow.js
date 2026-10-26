// силуэт Полковника Тени: всё тёмное, кроме глаз (жёлтые пиксели) + свечение глаз
const { chromium } = require('../work/precheck/node_modules/playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const src = path.join(__dirname, '..', 'trailer', 'capture', 'art', 'cat_ten.png');
  const b = await chromium.launch(); const p = await b.newPage();
  const out = await p.evaluate(async (d) => {
    const im = new Image(); im.src = d; await im.decode(); const w = im.width, h = im.height, pad = 60;
    const c = document.createElement('canvas'); c.width = w + pad * 2; c.height = h + pad * 2; const x = c.getContext('2d'); x.drawImage(im, pad, pad);
    const id = x.getImageData(0, 0, c.width, c.height), a = id.data; const eyes = document.createElement('canvas'); eyes.width = c.width; eyes.height = c.height; const ex = eyes.getContext('2d'); const ed = ex.createImageData(c.width, c.height);
    let n = 0;
    for (let i = 0; i < a.length; i += 4) { if (!a[i + 3]) continue; const r = a[i], g = a[i + 1], bl = a[i + 2]; const eye = r > 170 && g > 170 && bl < 140;
      if (eye) { n++; ed.data[i] = 240; ed.data[i + 1] = 242; ed.data[i + 2] = 90; ed.data[i + 3] = 255; a[i] = 240; a[i + 1] = 242; a[i + 2] = 90; }
      else { const l = (r + g + bl) / 3; a[i] = 10 + l * .05; a[i + 1] = 9 + l * .05; a[i + 2] = 16 + l * .07; } }
    x.putImageData(id, 0, 0); ex.putImageData(ed, 0, 0);
    // свечение
    x.globalCompositeOperation = 'lighter'; x.filter = 'blur(18px)'; x.globalAlpha = .9; x.drawImage(eyes, 0, 0); x.drawImage(eyes, 0, 0); x.filter = 'none'; x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    return { url: c.toDataURL(), n, pad, w };
  }, 'data:image/png;base64,' + fs.readFileSync(src).toString('base64'));
  fs.writeFileSync(path.join(__dirname, '..', 'trailer', 'public', 'art', 'ten_shadow.png'), Buffer.from(out.url.split(',')[1], 'base64'));
  console.log('eye px', out.n, 'pad', out.pad, 'w', out.w); await b.close();
})();

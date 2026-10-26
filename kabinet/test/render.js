// отрисовать сцены напрямую в canvas и сохранить PNG
const { open, sleep } = require('./lib'); const fs = require('fs');
(async () => {
  const { browser, page, logs } = await open({ init: () => { try { localStorage.setItem('kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {} } });
  await sleep(600);
  const imgs = await page.evaluate(() => {
    S = newState('pres', { cand: 'barsov' });
    const mk2 = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; };
    const out = {}; const up = (c) => { const b = document.createElement('canvas'); b.width = W * 3; b.height = H * 3; const y = b.getContext('2d'); y.imageSmoothingEnabled = false; y.drawImage(c, 0, 0, W * 3, H * 3); return b.toDataURL(); };
    { const [c, x] = mk2(); x.drawImage(bgCanvas('court'), 0, 0); x.drawImage(bgCanvas('courtFg'), 0, 0); out.sf = up(c); }
    S.flags.push('bunker_mode'); S.items.push('bunker'); for (const k of Object.keys(CACHE)) delete CACHE[k];
    { const [c, x] = mk2(); x.drawImage(bgCanvas('rev_office'), 0, 0); worldOverlay(x, 5000, 'pres', 'rev'); out.bunker = up(c); }
    return out;
  });
  for (const [k, v] of Object.entries(imgs)) fs.writeFileSync(`shots/r_${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
  console.log('ok', logs.filter(l => /pageerror/.test(l)).join('\n')); await browser.close(); process.exit(0);
})().catch(e => { console.log('CRASH', e.stack); process.exit(1); });

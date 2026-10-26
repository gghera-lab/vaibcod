// спрайт президента-игрока (выбранный кандидат) и фон дворца — для афиши
const { open, sleep } = require('./lib'); const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'trailer', 'capture', 'art');
(async () => {
  const { browser, page, logs } = await open({ init: () => { try { localStorage.setItem('kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); localStorage.setItem('kab-p21-sound', JSON.stringify({ v: 1, muted: true })); } catch (e) {} } });
  await sleep(900);
  const pal = await page.evaluate(() => { const up = (c, k) => { const b = document.createElement('canvas'); b.width = c.width * k; b.height = c.height * k; const y = b.getContext('2d'); y.imageSmoothingEnabled = false; y.drawImage(c, 0, 0, b.width, b.height); return b.toDataURL(); };
    const o = {}; for (const k of ['sel_pres', 'sel_presFg']) { try { o[k] = up(bgCanvas(k), 10); } catch (e) { o['err' + k] = e.message; } } return o; });
  await page.click('[data-pick=pres]'); await sleep(400); await page.click('[data-term="1"]'); await sleep(600);
  await page.click('.brow >> nth=1'); await page.click('#bdrop'); await sleep(1800);
  const r = await page.evaluate(() => { const up = (c, k) => { const b = document.createElement('canvas'); b.width = c.width * k; b.height = c.height * k; const y = b.getContext('2d'); y.imageSmoothingEnabled = false; y.drawImage(c, 0, 0, b.width, b.height); return b.toDataURL(); };
    for (const k of Object.keys(SPR)) delete SPR[k];
    return { player: up(sprite('pres', {}), 20), player_talk: up(sprite('pres', { talk: true }), 20) }; });
  for (const [k, v] of Object.entries(Object.assign(pal, r))) { if (k.startsWith('err')) { console.log(k, v); continue; } fs.writeFileSync(path.join(OUT, (k.startsWith('sel') ? 'bg_' : 'cat_') + k + '.png'), Buffer.from(v.split(',')[1], 'base64')); console.log('ok', k); }
  await browser.close(); process.exit(0);
})();

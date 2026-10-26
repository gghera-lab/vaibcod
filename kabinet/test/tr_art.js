// чистый пиксель-арт для афиши и трейлера: фоны 384×216 → ×10 (3840×2160), спрайты котов ×20 (прозрачный фон), логотип
const { open, sleep } = require('./lib'); const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'trailer', 'capture', 'art'); fs.mkdirSync(OUT, { recursive: true });
const KILL = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 240000);
(async () => {
  const { browser, page, logs } = await open({ init: () => { try { localStorage.setItem('kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); localStorage.setItem('kab-p21-sound', JSON.stringify({ v: 1, muted: true })); } catch (e) {} } });
  await sleep(1200);
  // логотип со стартового экрана (прозрачный фон)
  const h1 = page.locator('h1.sel-h').first();
  if (await h1.count()) { await h1.screenshot({ path: path.join(OUT, 'logo_game.png'), omitBackground: true }).catch(e => console.log('logo', e.message)); }
  const info = await page.evaluate(() => ({ ch: Object.keys(CH), chMeta: Object.fromEntries(Object.entries(CH).slice(0, 400).map(([k, v]) => [k, (v.n || v.name || '') + ''])), bgs: Object.keys(BG) }));
  fs.writeFileSync(path.join(OUT, 'info.json'), JSON.stringify(info, null, 1));
  const want = (process.argv[2] || 'sel_pres,pov_office,office,court,hall,cik,polling,inaug,street,street_ev,print,yard,backroom,summit,steps,vks,lab,studio,rev_office').split(',');
  const imgs = await page.evaluate((want) => {
    S = newState('pres', { cand: 'polosatov' });
    const out = {};
    const up = (c, k) => { const b = document.createElement('canvas'); b.width = c.width * k; b.height = c.height * k; const y = b.getContext('2d'); y.imageSmoothingEnabled = false; y.drawImage(c, 0, 0, b.width, b.height); return b.toDataURL(); };
    for (const key of want) {
      try {
        const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
        x.drawImage(bgCanvas(key), 0, 0); try { const fg = bgCanvas(key + 'Fg'); if (fg) x.drawImage(fg, 0, 0); } catch (e) {}
        out['bg_' + key] = up(c, 10);
      } catch (e) { out['err_' + key] = e.message; }
    }
    // бункер (стена мониторов)
    try { S.flags.push('bunker_mode'); S.items.push('bunker'); for (const k of Object.keys(CACHE)) delete CACHE[k];
      const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(bgCanvas('rev_office'), 0, 0); worldOverlay(x, 5000, 'pres', 'rev'); out.bg_bunker = up(c, 10); } catch (e) { out.err_bunker = e.message; }
    // спрайты всех персонажей ×20
    for (const id of Object.keys(CH)) { try { out['cat_' + id] = up(sprite(id, {}), 20); } catch (e) {} }
    return out;
  }, want);
  let n = 0; for (const [k, v] of Object.entries(imgs)) { if (k.startsWith('err_')) { console.log(k, v); continue; } fs.writeFileSync(path.join(OUT, k + '.png'), Buffer.from(v.split(',')[1], 'base64')); n++; }
  console.log('saved', n, 'chars', info.ch.length);
  console.log(logs.filter(l => /pageerror/.test(l)).join('\n'));
  await browser.close(); clearTimeout(KILL); process.exit(0);
})().catch(e => { console.log('CRASH', e.stack); process.exit(1); });

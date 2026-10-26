// захват кадров для трейлера: node tr_cap.js shot1,shot2 …  → trailer/capture/<shot>/ (jpg-кадры + frames.json) или <shot>.png
const { open, sleep } = require('./lib'); const fs = require('fs'), path = require('path');
const CAP = path.join(__dirname, '..', 'trailer', 'capture'); fs.mkdirSync(CAP, { recursive: true });
const KILL = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, +process.env.KILLMS || 900000);
const INIT = () => { try { localStorage.setItem('kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); localStorage.setItem('kab-p21-sound', JSON.stringify({ v: 1, muted: true })); } catch (e) {} };
// режим «только сцена»: холст игры на весь кадр 1920×1080 (384×216 ×5)
const STAGE_CSS = `#stg13{position:fixed!important;left:0!important;top:0!important;width:1920px!important;height:1080px!important;z-index:2147483000!important;margin:0!important;border:0!important;transform:none!important;box-shadow:none!important;border-radius:0!important}
#stg13>canvas,#stg13 canvas#view,#stg13 canvas.hd2{position:absolute!important;left:0!important;top:0!important;width:1920px!important;height:1080px!important}
body.trstage #toast, body.trstage #t19{display:none!important}`;
let page, cdp;
async function stage(on) {
  await page.evaluate(([on, css]) => { let s = document.getElementById('trstage'); if (on && !s) { s = document.createElement('style'); s.id = 'trstage'; s.textContent = css; document.head.appendChild(s); } if (!on && s) s.remove(); document.body.classList.toggle('trstage', !!on); }, [on, STAGE_CSS]);
  await sleep(250);
}
async function still(name) { await page.screenshot({ path: path.join(CAP, name + '.png') }); console.log('still', name); }
async function cast(name, fn) {
  const dir = path.join(CAP, name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const frames = []; let n = 0;
  const on = async (f) => { const i = n++; const fn2 = String(i).padStart(5, '0') + '.jpg'; fs.writeFileSync(path.join(dir, fn2), Buffer.from(f.data, 'base64')); frames.push({ f: fn2, t: f.metadata.timestamp }); try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) {} };
  cdp.on('Page.screencastFrame', on);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 93, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const t0 = Date.now(); await fn(); const dur = (Date.now() - t0) / 1000;
  await cdp.send('Page.stopScreencast'); cdp.off('Page.screencastFrame', on); await sleep(200);
  fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify({ dur, frames }));
  console.log('cast', name, frames.length, 'frames', dur.toFixed(1) + 's');
}
// сцена без интерфейса: холст #view + слой .hd2 → 1920×1080 (×5), кадры jpg с отметкой времени
async function stageCast(name, ms) {
  const dir = path.join(CAP, name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const frames = []; const t0 = Date.now(); let i = 0;
  do {
    const d = await page.evaluate(() => { let c = window.__trc; if (!c) { c = window.__trc = document.createElement('canvas'); c.width = 1920; c.height = 1080; } const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = '#000'; x.fillRect(0, 0, 1920, 1080);
      const v = document.getElementById('view'); if (v) x.drawImage(v, 0, 0, 1920, 1080); const h = document.querySelector('#stg13 canvas.hd2'); if (h && h.offsetWidth) x.drawImage(h, 0, 0, 1920, 1080); return c.toDataURL('image/jpeg', .94); });
    const f = String(i++).padStart(5, '0') + '.jpg'; fs.writeFileSync(path.join(dir, f), Buffer.from(d.split(',')[1], 'base64')); frames.push({ f, t: (Date.now() - t0) / 1000 });
  } while (Date.now() - t0 < ms);
  if (!ms) { fs.renameSync(path.join(dir, '00000.jpg'), path.join(CAP, name + '.jpg')); fs.rmSync(dir, { recursive: true, force: true }); console.log('stage still', name); return; }
  fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify({ dur: (Date.now() - t0) / 1000, frames, rel: 1 }));
  console.log('stage', name, frames.length, 'frames');
}
// мелкая перерисовка, чтобы скринкаст шёл ровно даже на статичном экране
async function hold(ms) { const t = Date.now(); while (Date.now() - t < ms) { await page.evaluate(() => { document.documentElement.style.setProperty('--trk', String(Math.random())); document.body.style.outlineColor = document.body.style.outlineColor ? '' : 'transparent'; }); await sleep(30); } }
const card = (id) => page.evaluate((id) => { try { closeModal(); } catch (e) {} const c = ALLDECK.find(x => x.id === id); if (!c) return 'nocard ' + id; showScreen(cardScreen(S, c)); return 'ok'; }, id);
const closeM = () => page.evaluate(() => { try { closeModal(); } catch (e) {} });
async function toGame() {
  await sleep(800); await page.click('[data-pick=pres]'); await sleep(400); await page.click('[data-term="1"]'); await sleep(600);
  await page.click('.brow >> nth=1'); await page.click('#bdrop'); await sleep(1800);
  await page.evaluate(() => { document.getElementById('inaug').hidden = true; next(); }); await sleep(1500);
}
async function signOn(sel) {
  const b = await page.locator(sel).first().boundingBox(); if (!b) return false;
  const pts = []; for (let i = 0; i <= 60; i++) { const k = i / 60; pts.push([b.x + b.width * (.12 + .7 * k), b.y + b.height * (.55 - .22 * Math.sin(k * 9) * (1 - k * .5) + .1 * k)]); }
  await page.mouse.move(...pts[0]); await page.mouse.down(); for (const p of pts) { await page.mouse.move(...p); await sleep(14); } await page.mouse.up(); return true;
}
const CARDS = [['tariffs', 'tariffs'], ['crypto', 'crypto'], ['snow', 'snow'], ['surveil', 'surveil'], ['p_terms', 'terms'], ['protest', 'protest'], ['pension_march', 'pension'], ['watch', 'watch'], ['p10_env1', 'env1'], ['surveil_scandal', 'leak'], ['p_rating', 'rating'], ['t3_start_ten', 't3']];
const SHOTS = {
  async start() { await sleep(1500); await cast('v_start', async () => { await hold(1200); await page.hover('[data-pick=pres]').catch(() => {}); await hold(2500); }); await still('s_start'); },
  async ballot() {
    await sleep(800); await page.click('[data-pick=pres]'); await sleep(500); await still('s_terms'); await page.click('[data-term="1"]'); await sleep(900);
    await cast('v_ballot', async () => { await hold(900); await page.click('.brow >> nth=1'); await hold(1100); await page.click('#bdrop'); await hold(3200); }); await still('s_inaug0');
    await cast('v_oath', async () => {
      await hold(600); await page.locator('#sigc').scrollIntoViewIfNeeded().catch(() => {}); await signOn('#sigc'); await hold(500); await page.click('#sigok', { force: true }).catch(() => {}); await hold(1500);
      for (let i = 0; i < 4; i++) { const z = page.locator('#inaug .cz13.ready').filter({ visible: true }); if (await z.count()) { await z.first().click({ force: true }).catch(() => {}); await hold(900); } }
      await hold(1500);
    }); await still('s_oath_done');
  },
  async cards() {
    await toGame();
    const only = process.env.ONLY ? process.env.ONLY.split(' ') : null;
    for (const [id, nm] of CARDS) {
      if (only && !only.includes(nm)) continue;
      console.log(nm, await card(id)); await sleep(300);
      await cast('v_card_' + nm, async () => { await hold(5200); }); await still('s_card_' + nm);
      await stageCast('v_stage_' + nm, 4000);
    }
  },
  async votes() {
    await toGame();
    await cast('v_duma', async () => { page.evaluate(() => showVote8({ card: { t: 'Закон о мурлыкоине' } }, { stage: 'Государственная Дума · третье чтение', for: 312, against: 98, of: 450, need: 226, pass: true }, true, 1500)).catch(e => console.log('v', e.message)); await hold(7000); }); await still('s_duma');
    await stageCast('st_duma', 0);
    await cast('v_sf', async () => { page.evaluate(() => showVote8({ card: { t: 'Закон о мурлыкоине' } }, { stage: 'Совет Федерации', for: 141, against: 12, of: 178, need: 90, pass: true }, true, 1500)).catch(e => console.log('v', e.message)); await hold(7000); }); await still('s_sf');
    await stageCast('st_sf', 0);
  },
  async modals() {
    await toGame();
    await page.evaluate(() => openDecree()); await sleep(800); await still('s_decree'); await page.locator('#modal button.dgo13').first().click({ force: true }).catch(() => {}); await sleep(900); await still('s_decree2');
    await cast('v_decree', async () => {
      await hold(500);
      for (const sel of ['#dscv', '#modal .sp10:not(.ok):not(.lock) canvas']) { if (await page.locator(sel).filter({ visible: true }).count()) { await signOn(sel); break; } }
      await hold(700);
      for (const sel of ['#decseal.ready', '#modal .z13.ready']) { const l = page.locator(sel).filter({ visible: true }); if (await l.count()) { await l.first().click({ force: true }).catch(() => {}); await hold(1500); } }
      await hold(1000);
    });
    await closeM(); await sleep(400);
    const num = await page.evaluate(() => { const id = Object.keys(PH8)[0]; openPhoneModal(id); return PH8[id].num; }); await sleep(700);
    await cast('v_phone', async () => { await hold(500); for (const k of String(num)) { await page.click('.phkeys button[data-k="' + k + '"]').catch(() => {}); await hold(250); } await page.locator('.phset button').filter({ hasText: /набрать/i }).first().click().catch(() => {}); await hold(4500); }); await still('s_phone');
    await closeM(); await sleep(400);
    await page.evaluate(() => { setTimeout(() => { try { openPoslModal(); } catch (e) {} }, 0); }); await sleep(900); await still('s_posl');
    await closeM(); await sleep(300);
    await page.evaluate(() => { setTimeout(() => { try { openThr9(); } catch (e) {} }, 0); }); await sleep(800); await still('s_threat');
    await closeM();
  },
  async bunker() {
    await toGame();
    await page.evaluate(() => { S.term = 4; S.flags.push('bunker_mode'); S.items.push('bunker'); for (const k of Object.keys(CACHE)) delete CACHE[k]; });
    for (const id of ['p8_t4screens', 'p8_t4door_b']) {
      console.log(id, await card(id)); await sleep(2500);
      await cast('v_card_' + id, async () => { await hold(4500); }); await still('s_card_' + id);
      await stageCast('v_stage_' + id, 4000);
    }
  },
};
(async () => {
  for (const s of (process.argv[2] || 'start').split(',')) {
    const o = await open({ init: INIT }); page = o.page; cdp = await o.context.newCDPSession(page);
    try { await SHOTS[s](); } catch (e) { console.log('ERR', s, e.message.split('\n')[0]); }
    console.log(o.logs.filter(l => /pageerror/.test(l)).join('\n').slice(0, 1500));
    await o.browser.close();
  }
  clearTimeout(KILL); process.exit(0);
})().catch(e => { console.log('CRASH', e.stack); process.exit(1); });

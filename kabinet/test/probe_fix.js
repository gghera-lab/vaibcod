// зонд для правок: телефон, СФ, бункер, значок «Скрыто», тост
const { open, shot, sleep } = require('./lib');
const KILL = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 90000);
const what = process.argv[2] || 'phone';
(async () => {
  const { browser, page, logs } = await open({ init: () => { try { localStorage.setItem('kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {} } });
  await sleep(700); await page.click('[data-pick=pres]'); await sleep(300); await page.click('[data-term="1"]'); await sleep(400);
  await page.click('.brow >> nth=1'); await page.click('#bdrop'); await sleep(1500);
  await page.evaluate(() => { document.getElementById('inaug').hidden = true; next(); }); await sleep(1500);
  if (what === 'phone') {
    await page.evaluate(() => { const id = Object.keys(PH8).find(k => PH8[k].num === '505') || Object.keys(PH8)[0]; openPhoneModal(id); });
    await sleep(700);
    const num = await page.evaluate(() => (Object.values(PH8).find(p => p.num === '505') || Object.values(PH8)[0]).num);
    for (const k of num) { await page.click('.phkeys button[data-k="' + k + '"]').catch(() => {}); await sleep(120); }
    await page.locator('.phset button').filter({ hasText: /НАБРАТЬ|Набрать/ }).first().click().catch(() => {}); await sleep(500);
    const m = await page.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }; return { set: r('.phset'), disp: r('#phdisp'), keys: r('.phkeys'), wrap: r('.phwrap'), dispCss: (() => { const s = getComputedStyle(document.getElementById('phdisp')); return { w: s.width, h: s.height, pos: s.position, minH: s.minHeight, mw: s.maxWidth, boxs: s.boxSizing }; })() }; });
    console.log(JSON.stringify(m)); console.log(await page.evaluate(() => { const d = document.getElementById('phdisp'); return d.outerHTML.slice(0, 600) + ' | cls=' + d.className + ' | style=' + d.getAttribute('style'); })); await shot(page, 'p_phone');
  } else if (what === 'sf') {
    await page.evaluate(() => { showVote8 ? showVote8({ t: 'Совет Федерации', for: 112, against: 53, abst: 13, need: 90, of: 178, pass: true }) : 0; }).catch(e => console.log('err', e.message));
    await sleep(2500); await shot(page, 'p_sf');
  } else if (what === 'bunker') {
    await page.evaluate(() => { S.flags.push('bunker_mode'); S.items.push('bunker'); try { for (const k of Object.keys(CACHE)) delete CACHE[k]; const c = ALLDECK.find(x => x.id === 'p8_bunker3'); showScreen({ kind: 'card', card: c }); } catch (e) {} });
    await sleep(2500); await page.mouse.click(400, 500); await sleep(2500); await shot(page, 'p_bunker');
  } else if (what === 'fx') {
    await page.evaluate(() => { const fx = document.getElementById('fx'); fx.hidden = false; fx.innerHTML = '<div class="fxc p21q"><span>?</span><small>Скрыто</small></div>'; toast('Дослушайте до конца — или нажмите «Показать всё».'); document.getElementById('toast').classList.add('p21tf'); });
    await sleep(500); await shot(page, 'p_fx');
  }
  console.log('logs', logs.filter(l => /pageerror/.test(l)).join('\n'));
  await browser.close(); clearTimeout(KILL); process.exit(0);
})().catch(e => { console.log('CRASH', e.stack); process.exit(1); });

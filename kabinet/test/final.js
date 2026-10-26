// финальный тест сборки kabinet_hd_6: загрузка без сети, прохождение ПК/телефон, битое сохранение, клавиатура, звук, кадр
const { open, shot, sleep } = require('./lib');
const { play } = require('./auto');
const fs = require('fs');
const R = { checks: [] };
const ok = (name, pass, info) => { R.checks.push({ name, pass: !!pass, info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? ' · ' + JSON.stringify(info).slice(0, 300) : '')); };
const KILL = setTimeout(() => { console.log('TIMEOUT'); fs.writeFileSync(__dirname + '/final_result.json', JSON.stringify(R, null, 1)); process.exit(2); }, 240000);
const prefs = () => { try { localStorage.setItem('kab3-prefs', JSON.stringify({ sound: true, sndAsked: 1, tour19: 1 })); } catch (e) {} };

async function startPres(page) {
  await sleep(700); await page.click('text=Без звука', { timeout: 800 }).catch(() => {});
  await page.click('[data-pick=pres]'); await sleep(400); await page.click('[data-term="1"]'); await sleep(500);
}

(async () => {
  /* 1 · загрузка без сети */
  { const { browser, page, logs, loadMs } = await open({ offline: true, init: prefs });
    await sleep(800);
    const st = await page.evaluate(() => ({ start: !document.getElementById('start').hidden, btns: document.querySelectorAll('#start [data-pick]').length, fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).filter((v, i, a) => a.indexOf(v) === i), menuVisible: (() => { const m = document.getElementById('tmenu13'); return !!(m && m.offsetParent); })() }));
    ok('offline: загрузка < 3 с', loadMs < 3000, { loadMs });
    ok('offline: стартовый экран с кнопками', st.start && st.btns > 0, st);
    ok('offline: шрифты встроены', st.fonts.length >= 2, st.fonts);
    ok('Q13: «Меню» скрыто на старте', !st.menuVisible);
    await shot(page, 'f01_start_offline');
    const errs = logs.filter(l => /pageerror|\[error\]/.test(l) && !/telegram|reqfail|ERR_FAILED|fonts\.g/i.test(l));
    ok('offline: нет ошибок JS', !errs.length, errs);
    await browser.close(); }

  /* 2 · битое сохранение */
  { const { browser, page, logs } = await open({ init: () => { try { localStorage.setItem('kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); localStorage.setItem('kab3-save', JSON.stringify({ S: { role: 'xxx', term: 9 }, cur: null })); } catch (e) {} } });
    await sleep(900);
    const st = await page.evaluate(() => ({ start: !document.getElementById('start').hidden, cont: !!document.getElementById('bcont'), btns: document.querySelectorAll('#start [data-pick]').length }));
    ok('Q3: битое сохранение — старт без «Продолжить», без чёрного экрана', st.start && !st.cont && st.btns > 0, st);
    ok('Q3: нет pageerror', !logs.some(l => /pageerror/.test(l)), logs.filter(l => /pageerror/.test(l)));
    await browser.close(); }

  /* 3 · клавиатура на бюллетене + прохождение ПК со звуком */
  { const { browser, page, logs } = await open({ init: prefs });
    await startPres(page);
    for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); const f = await page.evaluate(() => document.activeElement && document.activeElement.className); if (/brow/.test(f)) break; }
    await page.keyboard.press('Enter'); await sleep(200);
    const picked = await page.evaluate(() => !!document.querySelector('.brow.on') && !document.getElementById('bdrop').disabled);
    ok('Q7: кандидат выбирается с клавиатуры', picked);
    if (!picked) await page.click('.brow >> nth=1');
    await page.click('#bdrop'); await sleep(2200);
    const snd = await page.evaluate(() => ({ sfx: !!window.SFX, st: window.SFX && SFX.state && SFX.state(), alias: window.SFX ? ['coinUp', 'voteTick', 'fire', 'vhs'].map(n => SFX.play(n)) : null }));
    ok('звук: движок SFX есть, хуки моушна озвучены', snd.sfx && snd.alias && snd.alias.some(Boolean), snd);
    const rec = await play(page, { maxSteps: 140, cardWait: 500 });
    const st = await page.evaluate(() => ({ dec: S && S.dec, week: S && S.week, term: S && S.term }));
    ok('ПК: прохождение 140 шагов', rec.steps >= 100 && st.dec > 10, { steps: rec.steps, st, mouse: rec.mouseNeeded, stuck: rec.stuck.slice(0, 3) });
    await shot(page, 'f02_pc_after_play');
    /* кадр */
    const fr = await page.evaluate(() => new Promise(res => { const a = []; let p = performance.now(); const t0 = p; const f = (t) => { a.push(t - p); p = t; if (t - t0 < 3000) requestAnimationFrame(f); else res({ avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1), p95: +a.sort((x, y) => x - y)[Math.floor(a.length * .95)].toFixed(1) }); }; requestAnimationFrame(f); }));
    ok('ПК: средний кадр ≤ 33 мс', fr.avg <= 33, fr);
    const errs = logs.filter(l => /pageerror|\[error\]/.test(l) && !/telegram|reqfail/i.test(l));
    ok('ПК: нет ошибок JS за прохождение', !errs.length, errs.slice(0, 5));
    R.pc = { rec: { steps: rec.steps, ends: rec.ends, mouse: rec.mouseNeeded }, fr };
    await browser.close(); }

  /* 4 · телефон */
  { const { browser, page, logs } = await open({ init: prefs, ctx: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } });
    await startPres(page); await page.click('.brow >> nth=0').catch(() => {}); await page.click('#bdrop').catch(() => {}); await sleep(2200);
    const rec = await play(page, { maxSteps: 70, cardWait: 500 });
    ok('телефон: прохождение 70 шагов', rec.steps >= 50, { steps: rec.steps, mouse: rec.mouseNeeded });
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    ok('телефон: нет горизонтальной прокрутки', !ov);
    await shot(page, 'f03_mobile');
    const errs = logs.filter(l => /pageerror|\[error\]/.test(l) && !/telegram|reqfail/i.test(l));
    ok('телефон: нет ошибок JS', !errs.length, errs.slice(0, 5));
    await browser.close(); }

  R.pass = R.checks.filter(c => c.pass).length; R.total = R.checks.length;
  fs.writeFileSync(__dirname + '/final_result.json', JSON.stringify(R, null, 1));
  console.log(`ИТОГ ${R.pass}/${R.total}`); clearTimeout(KILL); process.exit(0);
})().catch(e => { console.log('CRASH', e.stack); fs.writeFileSync(__dirname + '/final_result.json', JSON.stringify(R, null, 1)); process.exit(1); });

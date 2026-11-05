// тест: сцена на всю область (без пустоты сверху), верх/низ рамки сцены = верх/низ листа справа
// node test_v2e.js
const path = require('path');
process.env.GAME = path.join(__dirname, 'kabinet_plot_v2.html');
const { open, sleep } = require('../../test/lib');
const fs = require('fs');
const SH = path.join(__dirname, 'shots'); fs.mkdirSync(SH, { recursive: true });
const R = []; const ok = (n, p, i) => { R.push({ n, p: !!p, i }); console.log((p ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' · ' + JSON.stringify(i).slice(0, 300) : '')); };
const KILL = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 360000);
const VP = [['1920', 1920, 1080, false], ['1680', 1680, 940, false], ['1366', 1366, 768, false], ['m390', 390, 844, true]];
(async () => {
  for (const [n, w, h, mob] of VP) {
    const { browser, page, logs } = await open({ ctx: { viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob }, init: `window.P22_NOTOUR = 1; try { localStorage.setItem('kabv2:kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {}` });
    await sleep(900); await page.click('[data-pick=pres]'); await sleep(400); await page.click('[data-term="1"]'); await sleep(1500);
    await page.click('.brow >> nth=1'); await page.click('#bdrop'); await sleep(2500);
    await require('../../test/auto').play(page, { maxSteps: 6, cardWait: 300 });
    await page.evaluate(() => { const i = document.getElementById('inaug'); if (i) i.hidden = true; S.used = S.used.filter(u => u !== 'p8_pm'); S.nextCard = 'p8_pm'; next(); }); await sleep(2000);
    for (let k = 0; k < 20; k++) { const bg = await page.evaluate(() => SC.bg); if (bg !== 'inaug') break; await require('../../test/auto').play(page, { maxSteps: 1, cardWait: 300 }); await sleep(400); }
    await page.evaluate(() => { const i = document.getElementById('inaug'); if (i) i.hidden = true; }); await sleep(3000);
    const g = await page.evaluate(() => { const r = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); };
      const sw = document.getElementById('screenwrap'), st = sw.querySelector('.stg13'), sh = document.getElementById('sheet');
      return { bg: SC.bg, wrap: r(sw), stage: r(st), sheet: r(sh), mob: getComputedStyle(document.getElementById('main')).gridTemplateColumns.split(' ').length < 2 }; });
    // сцена покрывает рамку целиком: нет пустоты сверху/снизу
    const cover = g.stage[1] <= g.wrap[1] + 3 && g.stage[3] >= g.wrap[3] - 3;
    ok(`${n}: сцена на всю область, без пустоты сверху`, cover, g);
    if (!g.mob && !mob) ok(`${n}: верх и низ сцены на одной линии с листом справа (±3px)`, Math.abs(g.wrap[1] - g.sheet[1]) <= 3 && Math.abs(g.wrap[3] - g.sheet[3]) <= 3, { wrap: g.wrap, sheet: g.sheet });
    await page.screenshot({ path: path.join(SH, `v2e_${n}.png`) });
    const errs = logs.filter(l => /pageerror/.test(l)); ok(`${n}: нет ошибок JS`, !errs.length, errs);
    await browser.close();
  }
  clearTimeout(KILL); process.exit(R.every(r => r.p) ? 0 : 1);
})().catch(e => { console.log('CRASH', e); process.exit(3); });

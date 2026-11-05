// кнопка и список «Лист сдержек»: не перекрывают интерфейс игры на ПК и телефоне
const path = require('path'); process.env.GAME = path.join(__dirname, 'kabinet_plot_v2.html');
const { open, sleep } = require('../../test/lib');
const fs = require('fs');
const VP = [['pc', 1920, 1080, false], ['m390', 390, 844, true]];
(async () => {
  let bad = 0;
  for (const [n, w, h, mob] of VP) {
    const { browser, page, logs } = await open({ ctx: { viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob }, init: `try { localStorage.setItem('kabv2:kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {}` });
    await sleep(900); await page.click('[data-pick=pres]'); await sleep(400); await page.click('[data-term="1"]'); await sleep(1500);
    await page.click('.brow >> nth=1'); await page.click('#bdrop'); await sleep(2500);
    await page.evaluate(() => { const p = P22API.P22(S); p.sheet = 1; p.lit = ['izb', 'duma', 'sf', 'ul']; p.off = ['izb']; S.nextCard = 'p22_svodka'; next(); });
    await sleep(2500);
    // что лежит под кнопкой: элементы игры, которые она перекрывает
    const r = await page.evaluate(() => {
      const b = document.getElementById('p22sheet'); if (!b) return { none: 1 }; const R = b.getBoundingClientRect();
      const hits = []; for (const [x, y] of [[R.left + 3, R.top + 3], [R.right - 3, R.top + 3], [R.left + 3, R.bottom - 3], [R.right - 3, R.bottom - 3], [(R.left + R.right) / 2, (R.top + R.bottom) / 2]]) {
        const st = document.elementsFromPoint(x, y).filter(e => e !== b && !b.contains(e) && e.innerText && e.innerText.trim() && getComputedStyle(e).visibility !== 'hidden' && e.children.length === 0); if (st[0]) hits.push(st[0].tagName + '.' + st[0].className + ':' + st[0].innerText.trim().slice(0, 30)); }
      return { rect: [R.left, R.top, R.right, R.bottom].map(Math.round), vw: innerWidth, hits };
    });
    console.log(n, JSON.stringify(r)); if (r.hits && r.hits.length) bad++;
    await page.click('#p22sheet'); await sleep(300);
    const L = await page.evaluate(() => { const l = document.getElementById('p22list'); const R = l.getBoundingClientRect(); return { r: [R.left, R.top, R.right, R.bottom].map(Math.round), out: R.right > innerWidth || R.bottom > innerHeight }; });
    console.log(n, 'list', JSON.stringify(L)); if (L.out) bad++;
    await page.screenshot({ path: path.join(__dirname, 'shots', `v2b_sheet_${n}.png`) });
    if (logs.some(l => /pageerror/.test(l))) { bad++; console.log(logs); }
    await browser.close();
  }
  console.log(bad ? 'FAIL ' + bad : 'PASS лист не перекрывает текст и не вылезает за экран');
  process.exit(bad ? 1 : 0);
})();

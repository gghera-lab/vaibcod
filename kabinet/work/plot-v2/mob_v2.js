// ночь 4:12 и перехват на телефоне 390×844: ничего не вылезает за экран
const path = require('path'); process.env.GAME = path.join(__dirname, 'kabinet_plot_v2.html');
const { open, sleep } = require('../../test/lib');
(async () => {
  const { browser, page, logs } = await open({ ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, init: `try { localStorage.setItem('kabv2:kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {}` });
  await sleep(900); await page.click('[data-pick=pres]'); await sleep(400); await page.click('[data-term="1"]'); await sleep(1500);
  await page.click('.brow >> nth=1'); await page.click('#bdrop'); await sleep(2500);
  const over = () => page.evaluate(() => { const b = document.getElementById('end'); const W = innerWidth; return [...b.querySelectorAll('.p22n *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.left < -1 || r.right > W + 1); }).map(e => e.tagName + ':' + (e.textContent || '').slice(0, 20)); });
  await page.evaluate(() => { S.ended = 'one_term'; endGame('one_term'); }); await sleep(500);
  console.log('перехват, за краем:', await over()); await page.screenshot({ path: path.join(__dirname, 'shots', 'v2_m1_perehvat.png') });
  await page.evaluate(() => { document.getElementById('end').hidden = true; S.term = 3; S.ended = 'war9'; endGame('war9'); }); await sleep(500);
  console.log('перекличка, за краем:', await over()); await page.screenshot({ path: path.join(__dirname, 'shots', 'v2_m2_noch.png') });
  console.log('ошибки:', logs.filter(l => /pageerror/.test(l)));
  await browser.close();
})();

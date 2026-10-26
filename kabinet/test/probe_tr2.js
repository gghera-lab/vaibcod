const { open, sleep } = require('./lib');
(async () => {
  const { browser, page, logs } = await open({ init: () => { try { localStorage.setItem('kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {} } });
  await sleep(700); await page.click('[data-pick=pres]'); await sleep(300); await page.click('[data-term="1"]'); await sleep(400);
  await page.click('.brow >> nth=1'); await page.click('#bdrop'); await sleep(1500);
  await page.evaluate(() => { document.getElementById('inaug').hidden = true; next(); }); await sleep(1500);
  const r = await page.evaluate(() => [...document.querySelectorAll('canvas')].filter(c => c.offsetWidth).map(c => ({ id: c.id, cls: c.className, w: c.width, h: c.height, ow: c.offsetWidth, oh: c.offsetHeight, par: c.parentElement.id || c.parentElement.className })));
  console.log(JSON.stringify(r));
  const bgs = await page.evaluate(() => { const s = BGC1.toString(); return s.slice(0, 2500); });
  console.log(bgs);
  console.log(logs.filter(l=>/pageerror/.test(l)).join('\n'));
  await browser.close(); process.exit(0);
})();

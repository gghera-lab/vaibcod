const { open, sleep } = require('./lib');
(async () => {
  const { browser, page } = await open({ init: () => { try { localStorage.setItem('kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {} } });
  await sleep(700); await page.click('[data-pick=pres]'); await sleep(300); await page.click('[data-term="1"]'); await sleep(400);
  await page.click('.brow >> nth=1'); await page.click('#bdrop'); await sleep(1500);
  await page.evaluate(() => { document.getElementById('inaug').hidden = true; next(); }); await sleep(1500);
  await page.evaluate(() => openDecree()); await sleep(800);
  console.log(await page.evaluate(() => [...document.querySelectorAll('#modal button')].map(b => b.className + ' :: ' + b.textContent.trim().slice(0, 30)).join('\n')));
  await page.locator('#modal button.go, #modal .dcard button').first().click().catch(e => console.log('c', e.message.split('\n')[0]));
  await sleep(1000);
  console.log('---'); console.log(await page.evaluate(() => [...document.querySelectorAll('#modal button, #modal canvas, #modal [id]')].filter(e=>e.offsetWidth).map(b => b.tagName + '#' + b.id + '.' + b.className + ' :: ' + (b.textContent||'').trim().slice(0, 30)).join('\n')));
  await page.screenshot({ path: 'shots/p_dec.png' });
  await browser.close(); process.exit(0);
})();

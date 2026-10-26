const { open, sleep } = require('./lib');
(async () => { const { browser, page, logs } = await open(); await sleep(600);
  console.log(await page.evaluate(() => JSON.stringify({ court: BG.court.toString().slice(0, 60), wc: windowCity.toString().slice(0, 60), fixes: !!document.getElementById('p21-fixes-js'), qa: !!document.getElementById('p21-qa-js'), last: [...document.scripts].slice(-3).map(s => s.id) })));
  console.log(logs.join('\n').slice(0, 1500)); await browser.close(); process.exit(0); })();

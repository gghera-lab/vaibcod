const { chromium } = require('../work/precheck/node_modules/playwright');
const path = require('path'); const { pathToFileURL } = require('url');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 800, height: 1100 } });
  await p.goto(pathToFileURL(path.join(__dirname, '..', 'Отчёт_Пакет_21.html')).href); await p.emulateMedia({ media: 'print' });
  await p.screenshot({ path: path.join(__dirname, 'shots', 'report_print.png') });
  const t = await p.evaluate(() => document.body.innerText.length); console.log('chars', t); await b.close(); })();

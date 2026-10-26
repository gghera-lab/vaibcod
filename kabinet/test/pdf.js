const { chromium } = require('../work/precheck/node_modules/playwright');
const path = require('path'); const { pathToFileURL } = require('url');
(async () => { const b = await chromium.launch(); const p = await b.newPage();
  await p.goto(pathToFileURL(path.join(__dirname, '..', 'Отчёт_Пакет_21.html')).href);
  await p.pdf({ path: path.join(__dirname, '..', 'Отчёт_Пакет_21.pdf'), format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' } });
  await b.close(); console.log('pdf ok'); })();

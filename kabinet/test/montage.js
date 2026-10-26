// контактный лист: node montage.js <dir> <cols> <w>
const { chromium } = require('../work/precheck/node_modules/playwright'); const fs = require('fs'), path = require('path'); const { pathToFileURL } = require('url');
(async () => { const dir = path.resolve(process.argv[2]), cols = +process.argv[3] || 6, w = +process.argv[4] || 260;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png') && !f.startsWith('_sheet')).sort();
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: cols * (w + 8) + 8, height: 800 } });
  for (let s = 0; s * 12 < files.length; s++) { await p.setViewportSize({ width: cols * (w + 8) + 8, height: 800 });
    const part = files.slice(s * 12, s * 12 + 12);
    await p.setContent(`<body style="margin:4px;background:#222;font:11px sans-serif;color:#fff;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:8px">${part.map(f => `<div><img src="data:image/png;base64,${fs.readFileSync(path.join(dir, f)).toString("base64")}" style="width:${w}px;display:block"><div>${f}</div></div>`).join('')}</body>`);
    await p.waitForLoadState('load'); await p.screenshot({ path: path.join(dir, `_sheet${s}.png`), fullPage: true });
  } await b.close(); console.log('ok', files.length); })();

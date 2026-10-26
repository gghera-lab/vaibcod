// клавиатурные пути: присяга (подпись, печати), пропуск реплик
const { open, shot, sleep } = require('./lib');
const KILL = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 90000);
(async () => {
  const { browser, page, logs } = await open({ init: () => { try { localStorage.setItem('kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {} } });
  await sleep(700); await page.click('[data-pick=pres]'); await sleep(400); await page.click('[data-term="1"]'); await sleep(500);
  await page.click('.brow >> nth=1'); await page.click('#bdrop'); await sleep(2500);
  const st0 = await page.evaluate(() => ({ inaug: !document.getElementById('inaug').hidden, targets: [...document.querySelectorAll('#sigc, .sp10, .z13')].filter(e => e.offsetParent).map(e => e.id || e.className) }));
  console.log('inaug', JSON.stringify(st0));
  // Tab до элементов подписи/печати и Enter на каждом
  const done = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.className || a.tagName) : null; });
    if (/sigc|sp10|z13/.test(f || '') && !done.includes(f)) { await page.keyboard.press('Enter'); await sleep(600); done.push(f); const g = await page.evaluate(() => document.activeElement && document.activeElement.id); if (g === 'sigok') { await page.keyboard.press('Enter'); await sleep(2500); done.push('sigok'); } }
    const tw = await page.evaluate(() => { const t = document.getElementById('towork'); return !!(t && t.offsetParent); });
    if (tw) break;
  }
  const st1 = await page.evaluate(() => ({ towork: !!(document.getElementById('towork') && document.getElementById('towork').offsetParent), zdone: document.querySelectorAll('.z13.done').length }));
  console.log((st1.towork ? 'PASS' : 'FAIL') + ' Q4: присяга с клавиатуры', JSON.stringify({ done, st1 }));
  await shot(page, 'k01_inaug_keys');
  if (st1.towork) { await page.focus('#towork'); await page.keyboard.press('Enter'); await sleep(2500); }
  // реплики: ждём печать и жмём пробел
  let skipped = null;
  for (let i = 0; i < 40 && skipped === null; i++) {
    const typing = await page.evaluate(() => { const s = document.querySelector('#dlg .dlgskip'); return !!(s && s.offsetParent && !document.querySelector('#dlg.p21all')); });
    if (typing) { await page.keyboard.press('Space'); await sleep(250); skipped = await page.evaluate(() => !!document.querySelector('#dlg.p21all') || !document.querySelector('#dlg .dlgskip') || !document.querySelector('#dlg .dlgskip').offsetParent); }
    else { await sleep(i < 20 ? 300 : 0); if (i >= 20) { await page.keyboard.press('1'); await sleep(150); await page.keyboard.press('1'); await sleep(700); } }
  }
  console.log((skipped ? 'PASS' : 'FAIL') + ' Q5: пробел пропускает печать реплик', skipped);
  const errs = logs.filter(l => /pageerror|\[error\]/.test(l) && !/telegram|reqfail/i.test(l));
  console.log((errs.length ? 'FAIL' : 'PASS') + ' нет ошибок JS', errs.slice(0, 3).join('\n'));
  await browser.close(); clearTimeout(KILL); process.exit(0);
})().catch(e => { console.log('CRASH', e.stack); process.exit(1); });

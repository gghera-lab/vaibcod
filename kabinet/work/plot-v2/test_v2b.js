// тест сцен и строк сдержек: лист на присяге, пометки, гашение, «Сводка» / «Почти» / «Протокол 1408»
// node test_v2b.js
const path = require('path');
process.env.GAME = path.join(__dirname, 'kabinet_plot_v2.html');
const { open, sleep } = require('../../test/lib');
const { play } = require('../../test/auto');
const fs = require('fs');
const SH = path.join(__dirname, 'shots'); fs.mkdirSync(SH, { recursive: true });
const shot = (page, n) => page.screenshot({ path: path.join(SH, n + '.png') });
const R = []; const ok = (n, p, i) => { R.push({ n, p: !!p, i }); console.log((p ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' · ' + JSON.stringify(i).slice(0, 400) : '')); };
const KILL = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 420000);
const P = (page) => page.evaluate(() => S && S.p22 ? { term: S.term, week: S.week, dec: S.dec, sheet: S.p22.sheet, lit: S.p22.lit, off: S.p22.off, prec: S.p22.prec, used: S.used.filter(u => /^p22_|p8_oath|p8_pros|p8_cik/.test(u)), flags: S.flags.filter(f => /hero_/.test(f)), log: S.p22.log.slice(-6) } : null);

(async () => {
  const { browser, page, logs } = await open({ init: `window.P22_NOTOUR = 1; try { localStorage.setItem('kabv2:kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {}` });
  await sleep(900); await page.click('[data-pick=pres]'); await sleep(400); await page.click('[data-term="1"]'); await sleep(1500);
  await page.click('.brow >> nth=1'); await page.click('#bdrop'); await sleep(2200);

  // 1 · естественное прохождение I срока до 7-й недели: присяга, лист, «Сводка»
  let st = null;
  for (let k = 0; k < 14; k++) { await play(page, { maxSteps: 12, cardWait: 300 }); st = await P(page); if (st && (st.used.includes('p22_svodka') || st.term > 1)) break; }
  console.log('  state', JSON.stringify(st));
  ok('лист сдержек выдан на присяге', st && st.sheet === 1 && st.used.includes('p8_oath'));
  ok('«Сводка» пришла сама в I сроке', st && st.used.includes('p22_svodka'), st && st.used);
  ok('строки загорались по одной, не все сразу', st && Array.isArray(st.lit) && st.lit.length >= 1 && st.lit.length < 8, st && st.lit);
  ok('кнопка «Лист сдержек» на экране', await page.locator('#p22sheet').isVisible());
  await page.click('#p22sheet'); await sleep(300); await shot(page, 'v2b_01_list'); await page.click('#p22sheet');

  // 2 · пометка на варианте и гашение: «Генеральный прокурор»
  await page.evaluate(() => { S.used = S.used.filter(u => u !== 'p8_pros'); S.nextCard = 'p8_pros'; next(); });
  await sleep(2500); await page.click('text=Показать всё', { timeout: 800 }).catch(() => {}); await sleep(600);
  const marks = await page.evaluate(() => [...document.querySelectorAll('#opts .p22mark')].map(m => m.textContent));
  ok('пометки «Погасит строку: Прокуратура» у Шептунова и Громобоева', marks.length === 2 && marks.every(m => /Прокуратура/.test(m)), marks);
  await shot(page, 'v2b_02_pros_marks');
  const g = await page.evaluate(() => { const i = U.scr.card.o.findIndex(o => /Шептунов/.test(o.l)); choose(S, U.scr, i); return { off: S.p22.off.slice(), lit: S.p22.lit.slice() }; });
  ok('выбор Шептунова гасит Прокуратуру', g.off.includes('pro'), g);

  // 3 · «Почти» и «Протокол 1408» во II сроке
  const sc = await page.evaluate(() => {
    const out = {}; const p0 = S.p22.prec;
    S.term = 2; let scr = cardScreen(S, CARD('p22_pochti')); out.pochti = scr.card && scr.card.t; choose(S, scr, 0); out.precAfterPochti = S.p22.prec - p0;
    scr = cardScreen(S, CARD('p22_1408')); out.p1408 = scr.card && scr.card.t; choose(S, scr, 3); out.izbOff = S.p22.off.includes('izb'); out.precTotal = S.p22.prec - p0;
    out.echo = (S.p22.echo || []).length; return out; });
  ok('«Почти»: открытая награда даёт +2 к прецеденту', sc.pochti === 'Почти' && sc.precAfterPochti === 2, sc);
  ok('«Протокол 1408»: вывести из комиссии — гаснет Избирком, прецедент −2', sc.p1408 === 'Протокол 1408' && sc.izbOff && sc.precTotal === 0, sc);
  ok('отголоски в новостях запланированы', sc.echo >= 1, sc);

  // 4 · «Сводка»: ссылка Котова — флаги, Котов больше не доверяет
  const sv = await page.evaluate(() => { const p0 = S.p22.prec; const scr = cardScreen(S, CARD('p22_svodka')); choose(S, scr, 2); return { d: S.p22.prec - p0, fl: S.flags.filter(f => /hero_/.test(f)), v: P22API.verdict(S) }; });
  ok('«Сводка»: ссылка — прецедент −2, флаги hero_exiled и hero_gone', sv.d === -2 && sv.fl.includes('hero_exiled') && sv.fl.includes('hero_gone'), sv);

  const errs = logs.filter(l => /pageerror|\[error\]/.test(l) && !/telegram|reqfail|ERR_FAILED|fonts\.g/i.test(l));
  ok('нет ошибок JS', !errs.length, errs);
  fs.writeFileSync(path.join(__dirname, 'test_v2b_result.json'), JSON.stringify({ R, st, logs: errs }, null, 1));
  await browser.close(); clearTimeout(KILL);
  process.exit(R.every(r => r.p) ? 0 : 1);
})().catch(e => { console.log('CRASH', e); process.exit(3); });

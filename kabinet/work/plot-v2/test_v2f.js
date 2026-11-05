// тест: исход ночи 4:12 меняет финал, «Друг» в ночи, Котов после ссылки убран из сцен
// node test_v2f.js
const path = require('path');
process.env.GAME = path.join(__dirname, 'kabinet_plot_v2.html');
const { open, sleep } = require('../../test/lib');
const fs = require('fs');
const SH = path.join(__dirname, 'shots'); fs.mkdirSync(SH, { recursive: true });
const R = []; const ok = (n, p, i) => { R.push({ n, p: !!p, i }); console.log((p ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' · ' + JSON.stringify(i).slice(0, 340) : '')); };
const KILL = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000);
const INIT = `window.P22_NOTOUR = 1; try { localStorage.setItem('kabv2:kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {}`;
async function fresh() {
  const o = await open({ init: INIT }); const page = o.page;
  await sleep(900); await page.click('[data-pick=pres]'); await sleep(400); await page.click('[data-term="1"]'); await sleep(1500);
  await page.click('.brow >> nth=1'); await page.click('#bdrop'); await sleep(2500);
  await require('../../test/auto').play(page, { maxSteps: 4, cardWait: 300 });
  await page.evaluate(() => { const i = document.getElementById('inaug'); if (i) i.hidden = true; });
  return o;
}
// провести ночь: настроить прецедент/строки, вызвать финал, пройти экраны, выбрать кнопку
async function nightRun(page, id, prec, off, btn) {
  await page.evaluate(([id, prec, off]) => { const p = P22API.P22(S); S.term = 4; p.night = null; p.prec = prec; p.off = off; S.ended = id; endGame(id); }, [id, prec, off]);
  await sleep(400); await page.click('#p22n1'); await sleep(250); await page.click('#p22n2'); await sleep(250);
  if (btn) { await page.click(btn); await sleep(250); } else if (await page.locator('#p22nocall').count()) { await page.click('#p22nocall'); await sleep(250); }
  if (await page.locator('#p22n4').count()) await page.click('#p22n4');
  await sleep(1300);
  for (let k = 0; k < 14; k++) { if (await page.evaluate(() => !!document.querySelector('#end .etext'))) break; if (await page.locator('#trnext').count()) await page.click('#trnext'); else await page.mouse.click(600, 500); await sleep(600); } await sleep(1000);
  return page.evaluate(() => ({ head: (() => { const t = document.getElementById('end').innerText; const hit = Object.values(ENDINGS).map(e => e.t).filter(n => n && n.length > 3 && t.toLowerCase().includes(n.toLowerCase())); return hit.sort((a, b) => t.toLowerCase().indexOf(a.toLowerCase()) - t.toLowerCase().indexOf(b.toLowerCase()))[0]; })(), txt: document.getElementById('end').innerText.slice(0, 160), line: (document.querySelector('#end .p22line') || {}).textContent, night: S.p22.night }));
}

(async () => {
  // 1 · отказ исполнителя спасает от «Вентиляции»
  { const { browser, page, logs } = await fresh();
    const r = await nightRun(page, 'p9_final_tigr', 5, [], null);
    ok('высокий прецедент: «Вентиляция» → «Выход на поверхность»', r.head === 'Выход на поверхность' && r.night.res === 'refuse' && /иначе/.test(r.line || ''), r);
    await page.screenshot({ path: path.join(SH, 'v2f_01_refuse.png') });
    const e = logs.filter(l => /pageerror/.test(l)); ok('нет ошибок JS (1)', !e.length, e); await browser.close(); }
  // 2 · подчинение отнимает «Честные выборы»
  { const { browser, page, logs } = await fresh();
    const r = await nightRun(page, 'fin_honest', -3, ['ks', 'vs', 'duma', 'sf', 'pro', 'hvost', 'izb'], null);
    ok('низкий прецедент и мало строк: «Честные выборы» → «Навсегда»', r.head === 'Навсегда' && r.night.res === 'obey', r);
    const e = logs.filter(l => /pageerror/.test(l)); ok('нет ошибок JS (2)', !e.length, e); await browser.close(); }
  // 3 · «Друг» — исход ночи: ответить Барсукову
  { const { browser, page, logs } = await fresh();
    await page.evaluate(() => { const p = P22API.P22(S); S.term = 4; p.night = null; p.prec = 2; S.ended = 'p8_spy'; endGame('p8_spy'); });
    await sleep(400); await page.click('#p22n1'); await sleep(250); await page.click('#p22n2'); await sleep(300);
    const scr = await page.evaluate(() => ({ h: document.querySelector('#end h2').textContent, btns: [...document.querySelectorAll('#end .p22btns button')].map(b => b.textContent) }));
    ok('«Друг»: в 4:12 экран «Два звонка» с Барсуковым и Котовым', scr.h === 'Друг' && scr.btns.some(t => /Барсуков/.test(t)) && scr.btns.some(t => /Котов/.test(t)), scr);
    await page.screenshot({ path: path.join(SH, 'v2f_02_friend.png') });
    await page.click('#p22friend'); await sleep(1300);
    for (let k = 0; k < 14; k++) { if (await page.evaluate(() => !!document.querySelector('#end .etext'))) break; if (await page.locator('#trnext').count()) await page.click('#trnext'); else await page.mouse.click(600, 500); await sleep(600); } await sleep(1000);
    const f = await page.evaluate(() => ({ head: (() => { const t = document.getElementById('end').innerText; const hit = Object.values(ENDINGS).map(e => e.t).filter(n => n && n.length > 3 && t.toLowerCase().includes(n.toLowerCase())); return hit.sort((a, b) => t.toLowerCase().indexOf(a.toLowerCase()) - t.toLowerCase().indexOf(b.toLowerCase()))[0]; })(), txt: document.getElementById('end').innerText.slice(0, 160), line: (document.querySelector('#end .p22line') || {}).textContent }));
    ok('«Друг»: ответили Барсукову → финал «Друг» со строкой про самолёт', f.head === 'Друг' && /Барсукову/.test(f.line || ''), f);
    const e = logs.filter(l => /pageerror/.test(l)); ok('нет ошибок JS (3)', !e.length, e); await browser.close(); }
  // 4 · Котов сослан — его нет в «Ситуационном центре», «Наградном листе», «Губернаторе»
  { const { browser, page, logs } = await fresh();
    const k = await page.evaluate(() => { S.flags.push('hero_exiled', 'hero_gone');
      const sit = ALLDECK.find(c => /^p9_sit_/.test(c.id)); const s1 = cardScreen(S, sit).card; const g = cardScreen(S, CARD('p9_gov')).card; const v = CARD('p9_aw1_vil') ? cardScreen(S, CARD('p9_aw1_vil')).card : null;
      const txt = (c) => c ? [c.x, ...(c.lines || []).map(l => l[1] + ' [' + l[0] + ']'), ...(c.o || []).map(o => o.l), ...(c.cast || [])].join(' | ') : '';
      return { sit: txt(s1), gov: txt(g), vil: txt(v), awHeroBlocked: !reqOk(S, CARD('p9_aw1_hero')) }; });
    ok('ссылка: в «Ситуационном центре» нет Котова (майор Бакенбардов)', !/Котов|hero9/.test(k.sit) && /Бакенбардов|По-уставному/.test(k.sit), k.sit.slice(0, 200));
    ok('ссылка: в «Губернаторе» нет варианта «врио Котов»', !/Котов|hero9/.test(k.gov), k.gov.slice(0, 200));
    ok('ссылка: «Наградной лист» Котову не приходит, во втором нет варианта с Котовым', k.awHeroBlocked && !/Котов/.test(k.vil.split(' | ').filter(s => !/\[/.test(s)).join(' ')), { blocked: k.awHeroBlocked, vil: k.vil.slice(0, 200) });
    const e = logs.filter(l => /pageerror/.test(l)); ok('нет ошибок JS (4)', !e.length, e); await browser.close(); }
  fs.writeFileSync(path.join(__dirname, 'test_v2f_result.json'), JSON.stringify(R, null, 1));
  clearTimeout(KILL); process.exit(R.every(r => r.p) ? 0 : 1);
})().catch(e => { console.log('CRASH', e); process.exit(3); });

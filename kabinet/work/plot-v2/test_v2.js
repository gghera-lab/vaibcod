// тест тестовой копии: отдельные сохранения, «На волоске», перехват, ночь 4:12
// node test_v2.js  (Playwright из work/precheck)
const path = require('path');
process.env.GAME = path.join(__dirname, 'kabinet_plot_v2.html');
const { open, sleep } = require('../../test/lib');
const { play } = require('../../test/auto');
const fs = require('fs');
const SH = path.join(__dirname, 'shots'); fs.mkdirSync(SH, { recursive: true });
const shot = (page, n) => page.screenshot({ path: path.join(SH, n + '.png') });
const R = []; const ok = (n, p, i) => { R.push({ n, p: !!p, i }); console.log((p ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' · ' + JSON.stringify(i).slice(0, 400) : '')); };
const KILL = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 200000);

(async () => {
  const { browser, page, logs } = await open({ init: () => { window.P22_NOTOUR = 1; try { localStorage.setItem('kabv2:kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {} } });
  await sleep(900);
  ok('заголовок тестовой копии', (await page.title()).includes('v2'), await page.title());
  ok('кнопка ТЕСТ v2 на экране', await page.locator('#p22chip').isVisible());
  await page.click('text=Без звука', { timeout: 800 }).catch(() => {});
  await page.click('[data-pick=pres]'); await sleep(400); await page.click('[data-term="1"]'); await sleep(1500);
  await page.click('.brow >> nth=1'); await page.click('#bdrop'); await sleep(2200);
  await play(page, { maxSteps: 25, cardWait: 400 });
  ok("партия началась", await page.evaluate(() => !!(S && S.dec > 0)), await page.evaluate(() => S && [S.term, S.week, S.dec]));

  // ключи хранилища: только с префиксом
  const keys = await page.evaluate(() => { const k = []; for (let i = 0; i < localStorage.length; i++) k.push(localStorage.key(i)); return k; });
  ok('все ключи localStorage с префиксом kabv2:', keys.length && keys.every(k => k.startsWith('kabv2:')), keys);

  // 1 · «На волоске» — четыре провала подряд в I сроке
  const res = await page.evaluate(() => {
    const out = [];
    for (let n = 1; n <= 4; n++) {
      S.week += 4; S.st.kz = 0; S.ended = null; const scr = nextScreen(S);
      const c = scr.card || {}; const opts = (c.o || []).map(o => o.l);
      out.push({ n, kind: scr.kind, t: c.t, opts, avail: scr.avail });
      if (scr.kind !== 'card') { out[out.length - 1].after = { kz: Math.round(S.st.kz), prec: S.p22.prec, alive: P22API.alive(S), coerce3: S.p22.coerce3, ended: S.ended, auto: 1 }; continue; }
      const i = Math.max(0, (scr.avail || []).findIndex(Boolean)); choose(S, scr, i);
      out[out.length - 1].after = { kz: Math.round(S.st.kz), prec: S.p22.prec, alive: P22API.alive(S), coerce3: S.p22.coerce3, ended: S.ended };
    }
    return out;
  });
  res.forEach(r => console.log('  rescue', JSON.stringify(r).slice(0, 300)));
  ok('провал в I сроке → карточка «На волоске» (первые три), дальше — автоматически', res.slice(0, 3).every(r => r.kind === 'card' && r.t === 'На волоске') && res[3].t !== 'На волоске');
  ok('нет «Принять поражение» в I сроке', res.every(r => !r.opts.some(l => /Принять поражение/.test(l))));
  ok('игра не закончилась после 4 спасений', res.every(r => r.after && !r.after.ended));
  ok('цена растёт: строки гаснут со 2-го, прецедент −1 с 3-го, принуждение с 4-го', res[3] && res[3].after.alive <= 6 && res[3].after.prec <= -2 && res[3].after.coerce3 === 1, res.map(r => r.after));
  await page.evaluate(() => { next(); }); await sleep(800); await shot(page, 'v2_01_na_voloske');

  // 2 · перехват «Один срок» в I сроке
  await page.evaluate(() => { const m = document.getElementById('modal'); if (m) m.hidden = true; S.ended = 'one_term'; endGame('one_term'); });
  await sleep(600); await shot(page, 'v2_02_perehvat');
  const ic = await page.evaluate(() => ({ text: document.getElementById('end').innerText.slice(0, 400), att: S.p22.att.length, prec: S.p22.prec }));
  ok('перехват: экран «ПЕРЕХВАЧЕНО»', /ПЕРЕХВАЧЕНО/.test(ic.text) && ic.att === 1, ic);
  await page.click('#p22go'); await sleep(900);
  const t2 = await page.evaluate(() => ({ term: S.term, ended: S.ended, endHidden: document.getElementById('end').hidden }));
  ok('после перехвата игра идёт дальше во II сроке', t2.term === 2 && !t2.ended && t2.endHidden, t2);

  // 3 · ночь 4:12 для проигрыша III срока («Война»)
  await page.evaluate(() => { S.term = 3; S.ended = 'war9'; endGame('war9'); });
  await sleep(500); await shot(page, 'v2_03_noch_pereklichka');
  const n1 = await page.evaluate(() => document.getElementById('end').innerText.slice(0, 300));
  ok('ночь: перекличка «Ночь наступила раньше»', /Ночь наступила раньше/.test(n1) && /Конституционный суд/.test(n1), n1);
  await page.click('#p22n1'); await sleep(300); await shot(page, 'v2_04_noch_prikaz');
  await page.click('#p22n2'); await sleep(300); await shot(page, 'v2_05_noch_ispolnitel');
  if (await page.locator('#p22call').count()) await page.click('#p22call');
  else if (await page.locator('#p22nocall').count()) await page.click('#p22nocall');
  await sleep(300); await page.click('#p22n4'); await sleep(1500); await shot(page, 'v2_06_final_s_nochyu');
  const fin = await page.evaluate(() => ({ head: (document.querySelector('#end .pn-head') || {}).textContent, line: (document.querySelector('#end .p22line') || {}).textContent, night: S.p22.night }));
  ok('после ночи — финал «Война» со строкой про 4:12', fin.head === 'Война' && /4:12/.test(fin.line || ''), fin);

  // 4 · основная игра не тронута
  const main = path.join(__dirname, '..', '..', 'kabinet_hd_6.html');
  ok('kabinet_hd_6.html без слоя Пакет 22', !fs.readFileSync(main, 'utf8').includes('p22-plot'));

  const errs = logs.filter(l => /pageerror|\[error\]/.test(l) && !/telegram|reqfail|ERR_FAILED|fonts\.g/i.test(l));
  ok('нет ошибок JS', !errs.length, errs);
  fs.writeFileSync(path.join(__dirname, 'test_v2_result.json'), JSON.stringify({ R, res, logs: errs }, null, 1));
  await browser.close(); clearTimeout(KILL);
  process.exit(R.every(r => r.p) ? 0 : 1);
})().catch(e => { console.log('CRASH', e); process.exit(3); });

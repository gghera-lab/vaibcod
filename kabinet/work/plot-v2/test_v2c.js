// тест правок по игре: петля «На волоске», конец срока, шкала, меню, сейф, медаль, вёрстка ПК/телефон
// node test_v2c.js
const path = require('path');
process.env.GAME = path.join(__dirname, 'kabinet_plot_v2.html');
const { open, sleep } = require('../../test/lib');
const fs = require('fs');
const SH = path.join(__dirname, 'shots'); fs.mkdirSync(SH, { recursive: true });
const shot = (page, n) => page.screenshot({ path: path.join(SH, n + '.png') });
const R = []; const ok = (n, p, i) => { R.push({ n, p: !!p, i }); console.log((p ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' · ' + JSON.stringify(i).slice(0, 400) : '')); };
const KILL = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 300000);
const INIT = `window.P22_NOTOUR = 1; try { localStorage.setItem('kabv2:kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {}`;
async function start(page) {
  await sleep(900); await page.click('[data-pick=pres]'); await sleep(400); await page.click('[data-term="1"]'); await sleep(1500);
  await page.click('.brow >> nth=1'); await page.click('#bdrop'); await sleep(2500);
  await require('../../test/auto').play(page, { maxSteps: 8, cardWait: 300 });
  await page.evaluate(() => { const i = document.getElementById('inaug'); if (i) i.hidden = true; }); await sleep(300);
}
const toOffice = async (page) => { await page.evaluate(() => { S.used = S.used.filter(u => u !== 'p22_svodka'); S.nextCard = 'p22_svodka'; next(); }); await sleep(1500); };

(async () => {
  /* ---------- ПК ---------- */
  const { browser, page, logs } = await open({ init: INIT });
  await start(page); await toOffice(page);
  const lay = await page.evaluate(() => { const r = (id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); };
    const d = document.getElementById('desk'); return { left: r('left'), wrap: r('screenwrap'), deskVisible: !!(d && d.offsetParent), safe: r('p22safeBtn'), billsText: /Законопроектов в работе/.test(document.getElementById('left').innerText) }; });
  ok('нижней панели (деньги, законопроекты) на экране нет', !lay.deskVisible && !lay.billsText, lay);
  ok('сцена растянута на всю высоту колонки', lay.wrap && lay.left && Math.abs(lay.wrap[3] - lay.left[3]) < 30, lay);
  ok('сейф на стене слева сверху', lay.safe && lay.safe[2] > 60 && lay.safe[0] < lay.wrap[0] + 80, lay.safe);
  const vis = () => page.evaluate(() => { const b = document.getElementById('p22safeBtn'); return { bg: SC.bg, shown: !!(b && b.offsetParent) }; });
  await page.evaluate(() => { setScene({ bg: 'hall', who: null }); }); await sleep(500); const vh = await vis();
  await page.evaluate(() => { const i = document.getElementById('inaug'); if (i) i.hidden = true; S.nextCard = 'p22_svodka'; next(); }); await sleep(1500); const vo = await vis();
  ok('сейф только в кабинете: в зале скрыт, в кабинете виден', !vh.shown && vo.shown, { hall: vh, office: vo });
  await shot(page, 'v2c_01_scene_pc');

  await page.click('#p22safeBtn'); await sleep(600);
  const sf = await page.evaluate(() => ({ title: (document.getElementById('mtitle') || {}).textContent, text: (document.getElementById('mbody') || {}).innerText || '', inModal: !!document.querySelector('#mbody #desk') }));
  ok('сейф открывает окно с личными деньгами', sf.title === 'Сейф' && sf.inModal && /ЛИЧН/i.test(sf.text) && !/Законопроектов/.test(sf.text), { title: sf.title, text: sf.text.slice(0, 160) });
  await shot(page, 'v2c_02_safe_pc');
  await page.keyboard.press('Escape'); await sleep(400);
  ok('после закрытия сейфа панель снова спрятана', await page.evaluate(() => { const d = document.getElementById('desk'); return !!d && d.parentElement.id === 'p22hold'; }));

  await page.click('[data-act=menu]').catch(() => {}); await sleep(500);
  const menu = await page.evaluate(() => [...document.querySelectorAll('#mbody button')].filter(b => b.offsetParent).map(b => b.innerText.trim()));
  ok('в меню нет «Покупки», «Анимации», «Темп ритуала», «Раздумье», «Показать, что можно нажимать»', !menu.some(t => /^Покупки|Анимации|Темп ритуала|Раздумье|можно нажимать/.test(t)), menu);
  await shot(page, 'v2c_03_menu'); await page.keyboard.press('Escape'); await sleep(300);

  // петля: показатель падает каждую неделю — карточек спасения не больше трёх, игра не кончается
  const loop = await page.evaluate(() => {
    let cards = 0, autos = 0; const seen = [];
    for (let k = 0; k < 30; k++) {
      S.week++; S.st.sv = 0; const scr = nextScreen(S);
      if (scr.kind === 'card' && scr.second) { cards++; seen.push(scr.card.t); choose(S, scr, Math.max(0, (scr.avail || []).findIndex(Boolean))); }
      else if (scr.kind === 'end') return { ended: scr.id, k, cards };
      else autos++;
      S.nextCard = null; S.nextInline = null;
    }
    return { cards, autos, sv: S.st.sv, res: S.p22.res[1], ended: S.ended };
  });
  ok('провал каждую неделю: максимум 3 карточки «На волоске», игра не кончилась', loop.cards <= 3 && !loop.ended, loop);

  // конец срока наступает, даже если показатель на нуле
  const fin = await page.evaluate(() => {
    ALLDECK.filter(c => c.at && termOk(S, c) && forRole(c, S.role)).forEach(c => { if (!S.used.includes(c.id)) S.used.push(c.id); });
    S.week = TURNS(S) + 1; S.st.sv = 0; S.ended = null; S.billNext = null; const scr = nextScreen(S); return { kind: scr.kind, id: scr.id, term: S.term };
  });
  ok('срок заканчивается (term1_done), а не застревает', fin.kind === 'end' && fin.id === 'term1_done', fin);

  // шкала срока идёт по доле сцен и не откатывается
  const bar = await page.evaluate(() => { S.ended = null; nextTerm(S); S.week = 2; updTop(); const a = [...document.querySelectorAll('#weekseg > i')].findIndex(e => e.className === 'now');
    ALLDECK.filter(c => c.at && termOk(S, c) && forRole(c, S.role)).slice(0, 10).forEach(c => S.used.push(c.id)); updTop(); const b = [...document.querySelectorAll('#weekseg > i')].findIndex(e => e.className === 'now');
    return { term: S.term, a, b, n: document.querySelectorAll('#weekseg > i').length }; });
  ok('шкала II срока двигается по пройденным сценам', bar.term === 2 && bar.b > bar.a && bar.b < bar.n - 1, bar);

  // медаль: кружок на груди прикалывает, «Приколоть» становится серой
  await page.evaluate(() => { openAwardModal10([['hero9', 'Орден Мужества']]); }); await sleep(700);
  await page.click('#awzone', { force: true }); await sleep(600);
  const aw = await page.evaluate(() => ({ pinned: document.getElementById('awpinned').classList.contains('on'), qDis: document.getElementById('awq').disabled, okOn: !document.getElementById('awok').disabled }));
  ok('клик по кружку на груди прикалывает орден, «Приколоть» серая', aw.pinned && aw.qDis && aw.okOn, aw);
  await shot(page, 'v2c_04_award');
  const errs = logs.filter(l => /pageerror|\[error\]/.test(l) && !/telegram|reqfail|ERR_FAILED|fonts\.g/i.test(l));
  ok('ПК: нет ошибок JS', !errs.length, errs);
  await browser.close();

  /* ---------- телефон ---------- */
  const m = await open({ ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, init: INIT });
  await start(m.page); await toOffice(m.page);
  const ml = await m.page.evaluate(() => { const s = document.getElementById('p22safeBtn').getBoundingClientRect(); return { safe: [s.left, s.top, s.width, s.height].map(Math.round), vw: innerWidth, sw: document.documentElement.scrollWidth }; });
  ok('телефон: сейф виден, страница не шире экрана', ml.safe[2] > 40 && ml.safe[0] + ml.safe[2] <= ml.vw && ml.sw <= ml.vw + 1, ml);
  await shot(m.page, 'v2c_05_scene_m390');
  await m.page.click('#p22safeBtn'); await sleep(600); await shot(m.page, 'v2c_06_safe_m390');
  const mo = await m.page.evaluate(() => { const b = document.getElementById('mbody'); return [...b.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1; }).map(e => e.className).slice(0, 5); });
  ok('телефон: содержимое сейфа не вылезает за экран', !mo.length, mo);
  const merr = m.logs.filter(l => /pageerror/.test(l)); ok('телефон: нет ошибок JS', !merr.length, merr);
  await m.browser.close();

  fs.writeFileSync(path.join(__dirname, 'test_v2c_result.json'), JSON.stringify(R, null, 1));
  clearTimeout(KILL); process.exit(R.every(r => r.p) ? 0 : 1);
})().catch(e => { console.log('CRASH', e); process.exit(3); });

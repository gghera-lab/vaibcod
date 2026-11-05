// долгий прогон релиза: бот играет всю партию до финала (три срока, ночь 4:12) — проверка, что игра не зацикливается
// node long_v2.js [seed-name]   → long_<name>.json
const path = require('path');
process.env.GAME = process.env.GAME || path.join(__dirname, '..', '..', 'kabinet_hd_7.html');
const { open, sleep } = require('../../test/lib');
const { play } = require('../../test/auto');
const fs = require('fs');
const NAME = process.argv[2] || 'a';
const T0 = Date.now(); const log = []; const L = (s) => { const t = ((Date.now() - T0) / 1000).toFixed(0); log.push(t + 's ' + s); console.log(t + 's ' + s); };
const out = { name: NAME, terms: [], ends: [], night: null, final: null, steps: 0, errors: [], stuck: 0 };
const save = (why) => { out.why = why; out.sec = Math.round((Date.now() - T0) / 1000); out.log = log.slice(-60); fs.writeFileSync(path.join(__dirname, `long_${NAME}.json`), JSON.stringify(out, null, 1)); };
const KILL = setTimeout(() => { L('TIMEOUT'); save('timeout'); process.exit(2); }, 1500000);

(async () => {
  const { browser, page, logs } = await open({ init: `window.P22_NOTOUR = 1; try { localStorage.setItem('kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {}` });
  await sleep(900); await page.click('[data-pick=pres]'); await sleep(400); await page.click('[data-term="1"]'); await sleep(1500);
  await page.click('.brow >> nth=1'); await page.click('#bdrop'); await sleep(2500);
  let lastKey = '', same = 0;
  for (let round = 0; round < 400; round++) {
    const rec = await play(page, { maxSteps: 12, cardWait: 250, pick: (st) => { let av = st.avail ? st.avail.map((a, i) => a ? i : -1).filter(i => i >= 0) : [...Array(st.nopt).keys()]; const nv = av.filter(i => !/вето|Принять поражение/i.test(st.opts[i] || '')); if (nv.length) av = nv; return av.length ? av[Math.floor(Math.random() * av.length)] : 0; } }); out.steps += rec.steps;
    const st = await page.evaluate(() => ({ term: S && S.term, week: S && S.week, dec: S && S.dec, ended: S && S.ended, endVis: !document.getElementById('end').hidden,
      btns: [...document.querySelectorAll('#end button')].filter(b => b.offsetParent && !b.disabled).map(b => b.id || b.textContent.trim().slice(0, 20)),
      paper: !!document.querySelector('#end .etext'), cont: !!document.getElementById('econt'), night: S && S.p22 && S.p22.night, res: S && S.p22 && S.p22.res, prec: S && S.p22 && S.p22.prec, alive: S && S.p22 && (8 - S.p22.off.length) }));
    if (st.term && !out.terms.includes(st.term)) { out.terms.push(st.term); L(`срок ${st.term} (неделя ${st.week}, решений ${st.dec}, прецедент ${st.prec}, строк ${st.alive})`); }
    if (st.endVis) {
      // финал: газета без «Продолжить» — конец партии
      if (st.paper && !st.cont && st.ended) { out.final = st.ended; out.night = st.night; L(`ФИНАЛ: ${st.ended} · ночь: ${JSON.stringify(st.night)}`); break; }
      // свои экраны и переходы: перехват, ночь, бункер, трейлер, продолжение срока (не «уйти»)
      const pref = ['p22go', 'p22n1', 'p22n2', 'p22call', 'p22nocall', 'p22n4', 'econt', 'b18go', 'trnext', 'ebuy4', 'emove4'];
      const id = pref.find(p => st.btns.includes(p));
      if (id) { if (!out.ends.length || out.ends[out.ends.length - 1] !== id) out.ends.push(id); await page.click('#' + id).catch(() => {}); await sleep(900); continue; }
    }
    // подтверждение сдачи («Всё равно сдаться») и выбор «Принять поражение», если других доступных вариантов нет
    await page.evaluate(() => { const m = document.getElementById('modal'); if (m && !m.hidden) { const y = [...m.querySelectorAll('button')].find(b => b.offsetParent && /Всё равно сдаться/.test(b.textContent)); if (y) y.click(); } });
    // ритуал закона/вето: основание → штамп «Отклонён» → подпись от руки → печать → отправить
    if (await page.evaluate(() => { const p = document.getElementById('lmpad'); return !!(p && p.offsetParent); })) {
      await page.evaluate(() => { const r = document.querySelector('#mbody [data-r]'); if (r) r.click(); }); await sleep(400); await page.evaluate(() => { const v = document.getElementById('lmv'); if (v && !v.disabled) v.click(); }); await sleep(600);
      const b = await page.locator('#lmpad').boundingBox(); if (b) { await page.mouse.move(b.x + b.width * .1, b.y + b.height * .6); await page.mouse.down(); for (let i = 0; i <= 30; i++) await page.mouse.move(b.x + b.width * (.1 + .8 * i / 30), b.y + b.height * (.5 + .25 * Math.sin(i / 2))); await page.mouse.up(); }
      await sleep(500); await page.evaluate(() => { const s = document.getElementById('lmseal'); if (s && s.offsetParent) s.click(); }); await sleep(600);
      const rs = await page.evaluate(() => ({ title: (document.getElementById('mtitle') || {}).textContent, msg: (document.getElementById('lmmsg') || {}).textContent, ok: (() => { const o = document.getElementById('lmok'); return o ? { dis: o.disabled, txt: o.textContent.trim() } : null; })(), letter: (() => { const l = document.getElementById('lmletter'); return l ? !l.hidden : null; })(), rsOn: document.querySelectorAll('#lmrs .on, #lmrs [aria-pressed=true]').length }));
      L('ритуал: ' + JSON.stringify(rs)); if (rs.ok && rs.ok.dis) await page.screenshot({ path: path.join(__dirname, 'shots', 'long_ritual_' + (out.rituals || 0) + '.png') });
      await page.evaluate(() => { const o = document.getElementById('lmok'); if (o && !o.disabled) o.click(); }); await sleep(900); out.rituals = (out.rituals || 0) + 1;
    }
    // ритуалы в окне (печать на законе/указе): нажать печать, затем активную главную кнопку
    const rit = await page.evaluate(() => { const m = document.getElementById('modal'); if (!m || m.hidden) return null; const vis = (e) => e && e.offsetParent;
      const seal = ['#lmseal', '#myseal', '#decseal', '.sealbox', '.seal8', '.rpseal', '.pl9seal', '.envseal'].map(s => m.querySelector(s)).find(e => vis(e) && !e.classList.contains('done'));
      if (seal) { const r = seal.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, what: seal.id || seal.className }; }
      const b = [...m.querySelectorAll('.bigbtn')].find(e => vis(e) && !e.disabled && !/Закрыть|Отмена/.test(e.textContent)); if (b) { b.click(); return { clicked: b.textContent.trim().slice(0, 30) }; } return null; });
    if (rit && rit.x) { await page.mouse.click(rit.x, rit.y); await sleep(700); }
    const key = `${st.term}|${st.week}|${st.dec}|${st.btns.join(',')}`;
    if (key === lastKey && same >= 2) { const mo = await page.evaluate(() => !document.getElementById('modal').hidden); if (mo) { await page.keyboard.press('Escape'); await sleep(600); out.esc = (out.esc || 0) + 1; } }
    if (key === lastKey) { if (++same >= 6) { out.stuck++; L('застряли: ' + key); await page.screenshot({ path: path.join(__dirname, 'shots', `long_${NAME}_stuck.png`) }); break; } } else { same = 0; lastKey = key; }
    if (round % 10 === 0) L(`… срок ${st.term} неделя ${st.week} решений ${st.dec} спасений ${JSON.stringify(st.res)}`);
  }
  out.errors = logs.filter(l => /pageerror|\[error\]/.test(l) && !/telegram|reqfail|ERR_FAILED|fonts\.g/i.test(l)).slice(0, 10);
  await page.screenshot({ path: path.join(__dirname, 'shots', `long_${NAME}_final.png`) });
  save(out.final ? 'final' : 'no-final');
  await browser.close(); clearTimeout(KILL); process.exit(out.final ? 0 : 1);
})().catch(e => { L('CRASH ' + e.message); save('crash'); process.exit(3); });

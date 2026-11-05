// тест: кадр на разных окнах (сейф, перо, телефон видны), обучение в новой партии с шагом «Сейф», окно указов и звонков
// node test_v2d.js
const path = require('path');
process.env.GAME = path.join(__dirname, 'kabinet_plot_v2.html');
const { open, sleep } = require('../../test/lib');
const fs = require('fs');
const SH = path.join(__dirname, 'shots'); fs.mkdirSync(SH, { recursive: true });
const R = []; const ok = (n, p, i) => { R.push({ n, p: !!p, i }); console.log((p ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' · ' + JSON.stringify(i).slice(0, 380) : '')); };
const KILL = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 420000);
const VP = [['1920', 1920, 1080, false], ['1280sq', 1280, 960, false], ['1366', 1366, 768, false], ['m390', 390, 844, true]];

async function start(page, tourOff) {
  await sleep(900); await page.click('[data-pick=pres]'); await sleep(400); await page.click('[data-term="1"]'); await sleep(1500);
  await page.click('.brow >> nth=1'); await page.click('#bdrop'); await sleep(2500);
  await require('../../test/auto').play(page, { maxSteps: 6, cardWait: 300 });
  await page.evaluate(() => { const i = document.getElementById('inaug'); if (i) i.hidden = true; }); await sleep(300);
  for (let k = 0; k < 25; k++) { const bg = await page.evaluate(() => SC.bg); if (bg === 'pov' || bg === 'office') break; await require('../../test/auto').play(page, { maxSteps: 1, cardWait: 300 }); await sleep(300); }
}
// видимая доля прямоугольника внутри сцены
const VISF = `(el) => { const w = document.getElementById('screenwrap').getBoundingClientRect(); const q = el.getBoundingClientRect(); const vw = Math.max(0, Math.min(q.right, w.right) - Math.max(q.left, w.left)), vh = Math.max(0, Math.min(q.bottom, w.bottom) - Math.max(q.top, w.top)); return q.width && q.height ? (vw * vh) / (q.width * q.height) : 0; }`;

(async () => {
  for (const [n, w, h, mob] of VP) {
    const { browser, page, logs } = await open({ ctx: { viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob }, init: `try { localStorage.setItem('kabv2:kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {}` });
    await start(page);
    await page.evaluate(() => { if (window.TOUR && TOUR.on) document.querySelector('#t19 .t19skip').click(); S.used = S.used.filter(u => u !== 'p22_svodka'); S.nextCard = 'p22_svodka'; next(); }); await sleep(1800);
    const v2 = await page.evaluate(() => { const HT = (typeof HOT13 !== 'undefined' && HOT13[SC.bg]) || {}; const a = document.getElementById('view').getBoundingClientRect(); const wr = document.getElementById('screenwrap').getBoundingClientRect(); const sx = a.width / 384, sy = a.height / 216;
      const vis = (l, t, r, b) => { const w = Math.max(0, Math.min(r, wr.right) - Math.max(l, wr.left)), h = Math.max(0, Math.min(b, wr.bottom) - Math.max(t, wr.top)); return +((w * h) / ((r - l) * (b - t))).toFixed(2); };
      const frac = (r) => r ? vis(a.left + r[0] * sx, a.top + r[1] * sy, a.left + (r[0] + r[2]) * sx, a.top + (r[1] + r[3]) * sy) : null;
      const sb = document.getElementById('p22safeBtn').getBoundingClientRect();
      return { bg: SC.bg, visW: +((STG13.vx1 - STG13.vx0) / 384).toFixed(2), safe: vis(sb.left, sb.top, sb.right, sb.bottom), pen: frac(HT.pen), phone: frac(HT.phone), hot: Object.keys(HT) }; });
    ok(`${n}: видно ≥ 85% ширины сцены, сейф ≥ 60%, перо и телефон ≥ 80%`, v2.visW >= (n === '1280sq' ? 0.75 : 0.85) && v2.safe >= 0.6 && (v2.pen == null || v2.pen >= 0.8) && (v2.phone == null || v2.phone >= 0.8), v2);
    await page.screenshot({ path: path.join(SH, `v2d_scene_${n}.png`) });

    // окно указов и звонков: вставляем панель в карточку и раскрываем оба раздела
    const ap = await page.evaluate(() => { const host = document.getElementById('opts').parentElement; const d = document.createElement('div'); d.id = 'aptest'; d.innerHTML = actPanelHTML(); host.insertBefore(d, host.firstChild);
      d.querySelectorAll('details').forEach(x => x.open = true); try { fillPortraits(d); } catch (e) {}
      const sums = [...d.querySelectorAll('.ap11s > summary')].map(s => { const r = s.getBoundingClientRect(), t = s.querySelector('.ap17t').getBoundingClientRect(); return { w: Math.round(r.width), textLeft: Math.round(t.left - r.left) }; });
      const panel = d.querySelector('.actpanel').getBoundingClientRect(); const ph = d.querySelector('.ap11i.ph'); const phr = ph ? ph.getBoundingClientRect() : null;
      d.scrollIntoView(); return { sums, panelW: Math.round(panel.width), phoneH: phr ? Math.round(phr.height) : null, over: [...d.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1; }).length }; });
    const rows = await page.evaluate(() => { const it = [...document.querySelectorAll('#aptest .ap11i')].slice(0, 6).map(e => e.getBoundingClientRect()); let ov = 0; for (let i = 1; i < it.length; i++) if (it[i].top < it[i - 1].bottom - 1) ov++; return { ov, h: it.map(r => Math.round(r.height)) }; }); ap.rows = rows;
    const sameW = rows.ov === 0 && ap.sums.length === 2 && ap.sums.every(s => Math.abs(s.w - ap.panelW) < 30);
    ok(`${n}: «Подписать указ» и «Позвонить» во всю ширину, текст слева, контакты компактные`, sameW && ap.sums.every(s => s.textLeft < 80) && ap.phoneH && ap.phoneH <= 70 && !ap.over, ap);
    await sleep(400);
    const el = await page.$('#aptest'); if (el) await el.screenshot({ path: path.join(SH, `v2d_panel_${n}.png`) });
    const errs = logs.filter(l => /pageerror/.test(l)); ok(`${n}: нет ошибок JS`, !errs.length, errs);
    await browser.close();
  }

  // обучение в новой партии: prefs с tour19:1 (как у игрока после первой партии) — всё равно показывается, последний шаг «Сейф»
  { const { browser, page, logs } = await open({ init: `try { localStorage.setItem('kabv2:kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {}` });
    await start(page);
    let seen = false; for (let k = 0; k < 25 && !seen; k++) { seen = await page.evaluate(() => !!(window.TOUR ? TOUR.on : !document.getElementById('t19').hidden)); if (!seen) { await require('../../test/auto').play(page, { maxSteps: 1, cardWait: 300 }); await sleep(600); } }
    const g = await page.evaluate(() => ({ glob: typeof stepBox, steps: (typeof STEPS !== 'undefined') ? STEPS.map(s => s.t) : null, on: !document.getElementById('t19').hidden }));
    ok('обучение показалось в новой партии, хотя в прошлой его уже видели', g.on, g);
    let last = null; for (let k = 0; k < 6; k++) { const t = await page.evaluate(() => document.querySelector('#t19 .t19t').textContent); last = t; if (t === 'Сейф') break; await page.evaluate(() => document.querySelector('#t19 .t19go').click()); await sleep(500); }
    const hole = await page.evaluate(() => { const h = document.querySelector('#t19 .t19hole').getBoundingClientRect(), s = document.getElementById('p22safeBtn').getBoundingClientRect(); return { op: getComputedStyle(document.querySelector('#t19 .t19hole')).opacity, h: [h.left, h.top, h.width, h.height].map(Math.round), s: [s.left, s.top, s.width, s.height].map(Math.round) }; });
    ok('последний шаг обучения — «Сейф», подсветка на сейфе', last === 'Сейф' && +hole.op > 0 && Math.abs(hole.h[1] - hole.s[1]) < 30 && hole.h[2] < hole.s[2] + 60, { last, hole });
    await page.screenshot({ path: path.join(SH, 'v2d_tour_safe.png') });
    await browser.close(); }

  fs.writeFileSync(path.join(__dirname, 'test_v2d_result.json'), JSON.stringify(R, null, 1));
  clearTimeout(KILL); process.exit(R.every(r => r.p) ? 0 : 1);
})().catch(e => { console.log('CRASH', e); process.exit(3); });

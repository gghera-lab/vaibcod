// финальный аудит: механики, вёрстка (вылезания, обрезка текста), шрифты, тексты, окна, мобильная версия
// node audit.js <profile> [steps]   profile: pc | pc1366 | deck | m390 | m360 | land
const { open, sleep } = require('./lib');
const { play } = require('./auto');
const fs = require('fs'), path = require('path');
const PROF = {
  pc: { viewport: { width: 1920, height: 1080 } },
  pc1366: { viewport: { width: 1366, height: 768 } },
  deck: { viewport: { width: 1280, height: 800 } },
  m390: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  m360: { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  land: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
};
const name = process.argv[2] || 'pc', STEPS = +process.argv[3] || 160, MOB = /^m|land/.test(name);
const OUT = path.join(__dirname, 'audit', name); fs.mkdirSync(OUT, { recursive: true });
const KILL = setTimeout(() => { finish('TIMEOUT'); }, 330000);
const issues = new Map(), errors = [], mech = [], screens = new Set();
let page, browser;
function addIssue(screen, it) { const k = it.kind + '|' + it.sel + '|' + (it.txt || '').slice(0, 40); if (!issues.has(k)) issues.set(k, Object.assign({ screen, n: 1 }, it)); else issues.get(k).n++; }

// проверка вёрстки текущего экрана (в странице)
const CHECK = (MOB) => {
  const out = [], vw = innerWidth, vh = innerHeight;
  const vis = (e) => { if (!e.getClientRects().length) return false; const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > .05; };
  const sel = (e) => { let s = e.tagName.toLowerCase(); if (e.id) return s + '#' + e.id; if (e.classList.length) s += '.' + [...e.classList].slice(0, 2).join('.'); const p = e.parentElement; return (p && p.id ? '#' + p.id + ' > ' : p && p.classList.length ? '.' + p.classList[0] + ' > ' : '') + s; };
  const txtOwn = (e) => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
  if (document.documentElement.scrollWidth > vw + 1) out.push({ kind: 'page-hscroll', sel: 'html', txt: document.documentElement.scrollWidth + '>' + vw });
  // корневые контейнеры: модалка, панель карточки, старт, присяга, финал
  const roots = ['#modal .mbox', '#start', '#inaug', '#end', '#sheet', '#card', '#bar', '#top', '#dapp'].map(s => document.querySelector(s)).filter(e => e && vis(e));
  const isClipScroll = (e) => { const s = getComputedStyle(e); return /auto|scroll/.test(s.overflowX); };
  for (const el of document.querySelectorAll('body *')) {
    if (/^(SCRIPT|STYLE|CANVAS|SVG|PATH|BR|OPTION)$/i.test(el.tagName) || el.closest('svg')) continue;
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const own = txtOwn(el);
    // 1) текст не влезает в свой блок
    if (own.length > 1) {
      const s = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && /hidden|clip/.test(s.overflowX) && s.textOverflow !== 'ellipsis' && el.clientWidth > 0) out.push({ kind: 'text-clipped-x', sel: sel(el), txt: own.slice(0, 60), d: el.scrollWidth - el.clientWidth });
      if (el.scrollHeight > el.clientHeight + 3 && /hidden|clip/.test(s.overflowY) && !s.webkitLineClamp && s.webkitLineClamp !== 'none' && el.clientHeight > 0 && !/^(BUTTON)$/.test(el.tagName)) out.push({ kind: 'text-clipped-y', sel: sel(el), txt: own.slice(0, 60), d: el.scrollHeight - el.clientHeight });
      const fam = s.fontFamily.split(',')[0].replace(/["']/g, '').trim(); const fs = parseFloat(s.fontSize) * (fam === 'Kab Label' ? 1.5 : 1); const lim = fam === 'Press Start 2P' ? (MOB ? 7 : 7) : (MOB ? 10.5 : 10); if (fs < lim && !el.closest('#fx,.m20delta')) out.push({ kind: 'font-small', sel: sel(el), txt: own.slice(0, 40), d: fs, fam });
      if (/undefined|NaN|\[object|\$\{|null\b/.test(own)) out.push({ kind: 'bad-text', sel: sel(el), txt: own.slice(0, 80) });
    }
    // 2) блок вылезает за свой корневой контейнер или за экран
    const root = roots.find(rt => rt.contains(el) && rt !== el);
    let p = el.parentElement, inScroll = false; while (p && p !== root) { if (isClipScroll(p)) { inScroll = true; break; } p = p.parentElement; }
    if (!inScroll && (own.length > 1 || /^(BUTTON|IMG|INPUT|A)$/.test(el.tagName))) {
      const rr = root ? root.getBoundingClientRect() : { left: 0, right: vw, top: 0, bottom: 1e9 };
      const L = Math.max(0, rr.left), Rr = Math.min(vw, rr.right);
      if (r.right > Rr + 2 || r.left < L - 2) out.push({ kind: root ? 'out-of-box' : 'out-of-screen', sel: sel(el), txt: (own || el.getAttribute('aria-label') || el.tagName).slice(0, 50), d: Math.round(Math.max(r.right - Rr, L - r.left)), root: root ? sel(root) : 'viewport' });
    }
    // 3) кнопки на телефоне — зона нажатия
    if (MOB && el.tagName === 'BUTTON' && !el.disabled && (r.height < 30 || r.width < 30) && !el.closest('.phkeys')) out.push({ kind: 'tap-small', sel: sel(el), txt: (el.textContent || '').trim().slice(0, 30), d: Math.round(Math.min(r.width, r.height)) });
  }
  // 4) шрифты: семейство не загружено
  const loaded = new Set([...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, '')));
  const fams = new Set(); for (const el of document.querySelectorAll('#app *, #start *, #modal *, #inaug *, #end *')) { if (!vis(el) || !txtOwn(el)) continue; fams.add(getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim()); }
  for (const f of fams) if (!loaded.has(f) && !/^(sans-serif|serif|monospace|system-ui|inherit)$/i.test(f)) out.push({ kind: 'font-missing', sel: f, txt: '' });
  return out;
};
const MECH = () => { if (typeof S === 'undefined' || !S) return null; const bad = []; for (const [k, v] of Object.entries(S.st || {})) if (!isFinite(v) || v < -0.5 || v > 100.5) bad.push(k + '=' + v); if (!isFinite(S.pw)) bad.push('pw=' + S.pw); if (!isFinite(S.week)) bad.push('week=' + S.week); return { bad, term: S.term, week: S.week, dec: S.dec, pw: S.pw, ended: S.ended }; };

async function check(label) {
  const r = await page.evaluate(CHECK, MOB).catch(e => [{ kind: 'check-error', sel: '', txt: e.message }]);
  r.forEach(it => addIssue(label, it));
  const m = await page.evaluate(MECH).catch(() => null); if (m && m.bad.length) mech.push({ label, ...m });
  if (!screens.has(label)) { screens.add(label); await page.screenshot({ path: path.join(OUT, label.replace(/[^a-zа-я0-9_-]+/gi, '_').slice(0, 60) + '.png') }).catch(() => {}); }
}
async function finish(why) {
  const res = { profile: name, why, errors, mech, screens: [...screens], issues: [...issues.values()].sort((a, b) => a.kind.localeCompare(b.kind)) };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(res, null, 1));
  const byKind = {}; res.issues.forEach(i => byKind[i.kind] = (byKind[i.kind] || 0) + 1);
  console.log(name, why, 'screens', screens.size, 'errors', errors.length, 'mech', mech.length, JSON.stringify(byKind));
  try { await browser.close(); } catch (e) {} process.exit(0);
}

(async () => {
  const o = await open({ ctx: PROF[name], init: () => { try { localStorage.setItem('kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {} } });
  browser = o.browser; page = o.page;
  page.on('pageerror', e => errors.push(e.message.slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error' && !/telegram|ERR_|favicon/i.test(m.text())) errors.push('[console] ' + m.text().slice(0, 300)); });
  await sleep(900); await check('start');
  await page.click('[data-pick=pres]'); await sleep(500); await check('terms');
  await page.click('[data-term="1"]'); await sleep(700); await check('ballot');
  await page.click('.brow >> nth=1'); await sleep(400); await check('ballot-pick');
  await page.click('#bdrop'); await sleep(2500); await check('inaug');
  // прохождение с проверкой каждого нового типа экрана
  const rec = await play(page, { maxSteps: STEPS, cardWait: 450, onStep: async (st) => {
    const label = st.modal ? 'modal-' + (st.mtitle || '') : st.inaug ? 'inaug' : (st.kind || 'none') + (st.card ? '-' + st.card : '');
    const kindLabel = st.modal ? label : st.inaug ? 'inaug' : (st.kind || 'none');
    if (!screens.has(kindLabel) || Math.random() < .25) await check(kindLabel);
  } });
  // все окна
  const modals = [['menu', 'openMenu()'], ['log', 'openLog()'], ['shop', 'openShop()'], ['archive', 'openArchive()'], ['role', 'openRole()'], ['phones', 'openPhones()'], ['people', 'openPeople()'], ['staff', 'openStaff9()'], ['decree', 'openDecree()'], ['cash', 'openCash10()'], ['biz', 'openBiz9()'], ['posl', 'openPoslModal()'], ['ld', 'openLd9()'], ['thr', 'openThr9()'], ['branches', 'openBranches9()'], ['chart', 'openChart(STATS[0].k)']];
  for (const [nm, js] of modals) { await page.evaluate(() => { try { closeModal(); } catch (e) {} }); await sleep(150); const ok = await page.evaluate((js) => { try { eval(js); return true; } catch (e) { return e.message; } }, js); await sleep(700); if (ok !== true) { errors.push('modal ' + nm + ': ' + ok); continue; } await check('win-' + nm); await page.evaluate(() => { const m = document.querySelector('#modal .mbody, #modal .mbox'); if (m) m.scrollTop = m.scrollHeight; }); await sleep(200); await check('win-' + nm + '-bottom'); }
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  // телефон: звонок
  await page.evaluate(() => { try { openPhoneModal(Object.keys(PH8)[0]); } catch (e) {} }); await sleep(700); await check('phone-call');
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  // конец срока и финал
  await page.evaluate(() => { try { S.ended = 'one_term'; endGame('one_term'); } catch (e) { console.error('endGame ' + e.message); } }); await sleep(4200); await check('end');
  await page.evaluate(() => { const b = document.getElementById('end'); if (b) b.scrollTop = b.scrollHeight; }); await sleep(300); await check('end-bottom');
  // министр и депутат
  await page.evaluate(() => { try { showStart(); } catch (e) {} }); await sleep(800);
  await page.evaluate(() => { try { closeModal(); newGame('min'); } catch (e) { console.error('min ' + e.message); } }); await sleep(2500); await check('min-start');
  await play(page, { maxSteps: 25, cardWait: 500, pick: () => 0, onStep: async (st) => { const l = 'min-' + (st.kind || 'none'); if (!screens.has(l)) await check(l); } });
  await page.evaluate(() => { try { showStart(); depOpen(); } catch (e) { console.error('dep ' + e.message); } }); await sleep(1200); await check('dep-open');
  await page.locator('#modal button', { hasText: 'Начать' }).first().click({ force: true }).catch(() => {}); await sleep(2500); await check('dep-start');
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Space'); await sleep(450); } await check('dep-play');
  const dc = page.locator('#dapp .dch, #dapp .opt').first(); if (await dc.count()) { await dc.click().catch(() => {}); await sleep(900); await check('dep-choice'); }
  mech.push({ label: 'summary', steps: rec.steps, ends: rec.ends, stuck: rec.stuck.slice(0, 5), mouse: rec.mouseNeeded });
  clearTimeout(KILL); finish('done');
})().catch(e => { errors.push('CRASH ' + e.stack); finish('crash'); });

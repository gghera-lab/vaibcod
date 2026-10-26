// автопроходчик: клавиатура в первую очередь, мышь — когда клавиатурой не выходит
const { sleep } = require('./lib');
async function state(page) {
  return page.evaluate(() => {
    const vis = id => { const e = document.getElementById(id); return !!(e && !e.hidden); };
    const sc = typeof U !== 'undefined' ? U.scr : null;
    return {
      start: vis('start'), inaug: vis('inaug'), modal: vis('modal'), end: vis('end'),
      mtitle: vis('modal') ? (document.getElementById('mtitle') || {}).textContent : null,
      kind: sc && sc.kind, card: sc && sc.card && sc.card.id, nopt: sc && sc.card && sc.card.o ? sc.card.o.length : 0,
      avail: sc && sc.avail ? sc.avail.map(Boolean) : null,
      busy: U.busy, vote: !!U.voteDone, lines: U.linesDone, doc: U.docRead, sel: U.sel,
      S: (typeof S !== 'undefined' && S) ? { term: S.term, week: S.week, dec: S.dec, ended: S.ended, finalEnd: S.finalEnd, st: Object.values(S.st).map(Math.round).join(',') } : null,
      opts: [...document.querySelectorAll('#opts > *')].map(e => (e.innerText || '').trim().slice(0, 50)),
      endText: vis('end') ? document.getElementById('end').innerText.slice(0, 300) : null,
      depon: !!window.DEPON, tour: !!(document.getElementById('t19') && !document.getElementById('t19').hidden),
    };
  });
}
async function drawSig(page, sel) {
  const b = await page.locator(sel).first().boundingBox(); if (!b) return false;
  await page.mouse.move(b.x + b.width * .1, b.y + b.height * .6); await page.mouse.down();
  for (let i = 0; i <= 30; i++) await page.mouse.move(b.x + b.width * (.1 + .8 * i / 30), b.y + b.height * (.5 + .25 * Math.sin(i / 2)));
  await page.mouse.up(); return true;
}
async function clickIf(page, sel) { const l = page.locator(sel).filter({ visible: true }).first(); if (await l.count()) { await l.click({ timeout: 3000, force: true }).catch(() => {}); return true; } return false; }

async function play(page, o = {}) {
  const maxSteps = o.maxSteps || 400; const rec = { steps: 0, cards: [], modals: [], mouseNeeded: {}, stuck: [], ends: [], keyOK: 0 };
  const pick = o.pick || ((st) => { let av = st.avail ? st.avail.map((a, i) => a ? i : -1).filter(i => i >= 0) : [...Array(st.nopt).keys()]; const nv = av.filter(i => !/вето|Принять поражение/i.test(st.opts[i] || '')); if (nv.length) av = nv; return av.length ? av[Math.floor(Math.random() * av.length)] : 0; });
  let lastSig = '', same = 0;
  for (let step = 0; step < maxSteps; step++) {
    const st = await state(page); rec.steps = step;
    const sig = JSON.stringify([st.inaug, st.modal, st.mtitle, st.kind, st.card, st.busy, st.vote, st.lines, st.doc, st.sel, st.S && st.S.dec, st.S && st.S.week, st.end, st.opts.length, st.tour]);
    if (sig === lastSig) same++; else same = 0; lastSig = sig;
    if (o.onStep) await o.onStep(st, step);
    if (st.tour) { rec.tour = (rec.tour || 0) + 1; await page.keyboard.press('Enter'); await sleep(350); continue; }
    if (st.end) { rec.ends.push({ step, S: st.S, text: st.endText }); if (o.stopAtEnd !== false) break; }
    if (same > 25) { rec.stuck.push({ step, st }); if (o.log) console.log('STUCK', JSON.stringify(st)); break; }
    const mouse = (why) => { rec.mouseNeeded[why] = (rec.mouseNeeded[why] || 0) + 1; };
    if (st.end) {
      // попробовать продолжить (финал срока) — кнопкой
      if (await clickIf(page, '#end button.bigbtn:not([disabled]), #end button:not([disabled])')) { mouse('end-continue'); await sleep(800); continue; }
      break;
    }
    if (st.inaug) {
      if (await page.locator('#towork').filter({ visible: true }).count()) { await page.click('#towork', { force: true, timeout: 3000 }).catch(() => {}); mouse('inaug-towork'); await sleep(900); continue; }
      const zones = page.locator('#inaug .cz13.ready').filter({ visible: true });
      if (await zones.count()) { await zones.first().click({ force: true, timeout: 3000 }).catch(() => {}); mouse('inaug-stamp-zone'); await sleep(500); continue; }
      if (await page.locator('#sigc').filter({ visible: true }).count() && !(await page.evaluate(() => document.getElementById('sigok') && document.getElementById('sigok').closest('.sigrow').style.display === 'none'))) {
        await page.locator('#sigc').scrollIntoViewIfNeeded(); await drawSig(page, '#sigc'); mouse('inaug-signature'); await page.click('#sigok', { force: true, timeout: 3000 }).catch(() => {}); await sleep(900); continue;
      }
      // другие варианты присяги (сроки 2+)
      const b = page.locator('#inaug button:not([disabled])').filter({ visible: true });
      if (await b.count()) { const t = await b.last().innerText(); if (o.log) console.log('inaug btn', t); await b.last().click({ force: true, timeout: 3000 }).catch(() => {}); mouse('inaug-btn'); await sleep(900); continue; }
      const sp = page.locator('#inaug .sp10 canvas').filter({ visible: true }); if (await sp.count()) { await drawSig(page, '#inaug .sp10 canvas'); mouse('inaug-sp10'); await sleep(500); continue; }
      await sleep(600); continue;
    }
    if (st.modal) {
      if (!rec.modals.includes(st.mtitle)) rec.modals.push(st.mtitle);
      if (!st.busy && !o.keepModal) { await page.keyboard.press('Escape'); await sleep(400); continue; }
      // ритуалы: послание, указ, телефон
      const did = await page.evaluate(() => {
        const M = document.getElementById('modal'); const q = s => M.querySelector(s);
        const ps = [...M.querySelectorAll('.pl9p')]; if (ps.length) { let n = 0; ['ext', 'int'].forEach(ax => { const live = ps.filter(p => p.dataset.ax === ax && !p.classList.contains('struck')); live.slice(1).forEach(p => { p.click(); n++; }); }); if (n) return 'strike'; }
        const disp = q('#phdisp'); if (disp && /—/.test(disp.textContent)) { const em = q('.phwho em'); const num = em && (em.textContent.match(/внутренний (S+)/) || [])[1]; if (num) { num.split('').forEach(d => { const b = M.querySelector('[data-k="' + d + '"]'); b && b.click(); }); return 'dial'; } }
        const ask = q('.phask:not(.off)'); if (ask) { ask.click(); return 'ask'; }
        return null; });
      if (did) { mouse('modal-' + did + ':' + st.mtitle); await sleep(did === 'dial' ? 2200 : 700); continue; }
      for (const sel of ['#modal .sp10:not(.ok):not(.lock) canvas', '#dscv']) {
        const ok = await page.evaluate((sel) => { const c = document.querySelector(sel); if (!c || !c.offsetWidth) return false; if (sel === '#dscv') { const s = document.getElementById('decseal'); return !(s && (s.classList.contains('ready') || s.classList.contains('hit'))); } return true; }, sel);
        if (ok) { await page.locator(sel).first().scrollIntoViewIfNeeded().catch(() => {}); await drawSig(page, sel); mouse('modal-signature:' + st.mtitle); await sleep(400); break; }
      }
      for (const sel of ['#decseal.ready:not(.hit)', '#pl9seal.ready:not(.hit)', '#modal .z13.ready']) if (await clickIf(page, sel)) { mouse('modal-seal:' + st.mtitle); await sleep(400); }
      const prim = page.locator('#modal .bigbtn:not([disabled]), #modal button.go:not([disabled])').filter({ visible: true });
      if (await prim.count()) { await prim.last().click({ force: true, timeout: 3000 }).catch(() => {}); mouse('modal-primary:' + st.mtitle); await sleep(700); continue; }
      if (same > 12) { await page.keyboard.press('Escape'); await sleep(400); }
      await sleep(300); continue;
    }
    if (!st.S) { await sleep(500); continue; }
    { const rp = page.locator('#sheet .sp10:not(.ok) canvas').filter({ visible: true }); if (await rp.count()) { await rp.first().scrollIntoViewIfNeeded().catch(() => {}); await drawSig(page, '#sheet .sp10:not(.ok) canvas'); mouse('sheet-signature:' + st.kind); await sleep(400); continue; } }
    { const z = page.locator('#sheet .z13.ready').filter({ visible: true }); if (await z.count()) { await z.first().scrollIntoViewIfNeeded().catch(() => {}); await z.first().click({ force: true, timeout: 3000 }).catch(() => {}); mouse('sheet-stamp:' + st.kind); await sleep(400); continue; } }
    if (st.vote) { await page.keyboard.press('Enter'); rec.keyOK++; await sleep(400); continue; }
    if (st.busy) { await page.keyboard.press('Space'); await sleep(o.busyWait || 500); if (same > 8) { await clickIf(page, '#opts .opt.next, #opts button'); mouse('busy-next'); } continue; }
    if (st.kind && st.kind !== 'card' && !st.card) { if (!rec.kinds) rec.kinds = {}; rec.kinds[st.kind] = (rec.kinds[st.kind] || 0) + 1; await page.keyboard.press('Enter'); rec.keyOK++; await sleep(500); if (same > 3) { await clickIf(page, '#opts button, #opts .opt'); mouse('next-btn:' + st.kind); } continue; }
    if (st.card) {
      if (!rec.cards.length || rec.cards[rec.cards.length - 1].id !== st.card) rec.cards.push({ id: st.card, term: st.S.term, week: st.S.week });
      if (!st.lines) { await page.keyboard.press('Space'); await sleep(250); if (same > 2) { if (await clickIf(page, '.dlgskip')) mouse('lines-skip'); } continue; }
      if (!st.doc) { const pg = await page.evaluate(() => { const dp = document.querySelector('.docpaper.flip'); if (dp && !dp.dataset.seen) { const n = dp.querySelector('.pgn'); if (n) { n.click(); return true; } } return false; }); if (pg) { mouse('doc-page'); await sleep(150); continue; } if (await clickIf(page, '#docok')) mouse('doc-ok'); await sleep(300); continue; }
      if (same > 6) { // клавиатура не сработала — мышью
        const idx = pick(st); const opt = page.locator('#opts .opt').nth(idx); if (await opt.count()) { await opt.click({ force: true, timeout: 3000 }).catch(() => {}); await sleep(200); await opt.click({ force: true, timeout: 3000 }).catch(() => {}); mouse('opt-click'); } await sleep(600); continue;
      }
      const idx = pick(st);
      if (st.nopt === 1) await page.keyboard.press('Enter'); else { await page.keyboard.press(String(idx + 1)); await sleep(120); await page.keyboard.press(String(idx + 1)); }
      rec.keyOK++; await sleep(o.cardWait || 700); continue;
    }
    // неизвестный экран
    await page.keyboard.press('Enter'); await sleep(400);
  }
  return rec;
}
module.exports = { play, state, drawSig, clickIf };

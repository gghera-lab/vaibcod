// поиск повторов текста внутри карточек: заголовок, текст, реплики, варианты, досье, подсказки
const { open } = require('./lib');
const KILL = setTimeout(() => process.exit(2), 60000);
(async () => {
  const { browser, page } = await open();
  await new Promise(r => setTimeout(r, 800));
  const out = await page.evaluate(() => {
    const nz = (x) => String(x || '').toLowerCase().replace(/<[^>]+>/g, '').replace(/[^а-яёa-z0-9]/g, '');
    const res = [];
    for (const c of ALLDECK) {
      const parts = [];
      const add = (where, t) => { if (typeof t === 'string' && nz(t).length >= 12) parts.push([where, t]); };
      add('t', c.t); add('x', c.x || c.text);
      (c.lines || []).forEach((l, i) => add('line' + i, Array.isArray(l) ? l[1] : (l && (l.t || l.text))));
      (c.o || []).forEach((o, i) => { add('o' + i + '.l', o.l); add('o' + i + '.h', o.h || o.hint); if (o.dos) { add('o' + i + '.bio', o.dos.bio); add('o' + i + '.plus', o.dos.plus); add('o' + i + '.minus', o.dos.minus); } });
      const seen = new Map();
      for (const [w, t] of parts) { const k = nz(t); if (seen.has(k) && !(/\.bio$/.test(seen.get(k)) && /\.plus$/.test(w))) res.push({ id: c.id, a: seen.get(k), b: w, t: t.slice(0, 80) }); else if (!seen.has(k)) seen.set(k, w); }
      // вариант, целиком содержащий текст своего досье
      (c.o || []).forEach((o, i) => { if (o.dos && o.dos.plus && nz(o.l).includes(nz(o.dos.plus)) && nz(o.dos.plus).length > 12) res.push({ id: c.id, a: 'o' + i + '.l', b: 'o' + i + '.plus', t: o.dos.plus.slice(0, 80) }); });
    }
    return { n: ALLDECK.length, res };
  });
  console.log('cards', out.n, 'dups', out.res.length);
  out.res.forEach(r => console.log(JSON.stringify(r)));
  await browser.close(); clearTimeout(KILL); process.exit(0);
})();

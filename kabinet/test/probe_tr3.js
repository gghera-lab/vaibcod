const { open, sleep } = require('./lib'); const fs=require('fs');
(async () => {
  const { browser, page, logs } = await open({ init: () => { try { localStorage.setItem('kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {} } });
  await sleep(800);
  const r = await page.evaluate(() => {
    const out = { deck: (typeof ALLDECK!=='undefined'?ALLDECK:[]).map(c => [c.id, c.term, c.bg, c.who||c.p||'', (c.t||'').slice(0,60), (c.x||c.txt||'').slice(0,90)].join(' | ')) };
    out.keys = Object.keys(ALLDECK[0]||{});
    out.cachekeys = Object.keys(CACHE);
    out.vote8 = showVote8.toString().slice(0,600);
    return out;
  });
  fs.writeFileSync('deck_dump.txt', r.deck.join('\n')); console.log(r.deck.length, JSON.stringify(r.keys), JSON.stringify(r.cachekeys).slice(0,800)); console.log(r.vote8);
  await browser.close(); process.exit(0);
})();

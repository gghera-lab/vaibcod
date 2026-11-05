// выгрузка сюжетных карт президента (сроки I–III): id, срок, неделя, заголовок, варианты и их флаги → cards.json
const path = require('path'); process.env.GAME = path.join(__dirname, 'kabinet_plot_v2.html');
const { open, sleep } = require('../../test/lib');
const fs = require('fs');
(async () => {
  const { browser, page } = await open({});
  await sleep(800);
  const cards = await page.evaluate(() => {
    const all = [].concat(typeof ALLDECK !== 'undefined' ? ALLDECK : []);
    return all.filter(c => c && c.id && !c.retired && (c.term || 0) <= 4 && (!c.roles || c.roles.includes('pres') || c.all)).map(c => ({
      id: c.id, term: c.term, at: c.at, t: c.t, who: c.who, req: c.req, not: c.not, x: String(c.x || '').slice(0, 160),
      o: (c.o || []).map(o => ({ l: String(o.l || '').slice(0, 90), f: o.f || o.flag || o.flags, end: o.end, ld: !!o.ld, force: o.force, shame: o.shame }))
    }));
  });
  fs.writeFileSync(path.join(__dirname, 'cards.json'), JSON.stringify(cards, null, 1));
  console.log('cards', cards.length);
  await browser.close();
})();

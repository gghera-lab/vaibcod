const { open, sleep } = require('./lib');
(async () => {
  const { browser, page, logs } = await open({ init: () => { try { localStorage.setItem('kab3-prefs', JSON.stringify({ sound: false, sndAsked: 1, tour19: 1 })); } catch (e) {} } });
  await sleep(800);
  const r = await page.evaluate(() => {
    const o = { W: typeof W !== 'undefined' ? W : null, H: typeof H !== 'undefined' ? H : null };
    o.bgSrc = typeof bgCanvas === 'function' ? bgCanvas.toString().slice(0, 1500) : null;
    o.sfx = window.SFX ? SFX.list() : null;
    o.globals = Object.keys(window).filter(k => /^(BG|BGS|SCN|DRAW|PORT|CHAR|NPC|CATS|PEOPLE|WORLD)/i.test(k)).slice(0, 60);
    o.fns = ['worldOverlay','drawCat','catSprite','portrait','drawPortrait','showVote8','openPhoneModal','openDecree','newState','showScreen','endGame','openPoslModal','next'].map(f => f + ':' + typeof window[f]);
    return o;
  });
  console.log(JSON.stringify(r, null, 1)); await browser.close(); process.exit(0);
})();

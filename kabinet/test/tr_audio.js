// запись звука из движка игры: музыка-темы, эффекты, кошачья речь → webm (opus)
const { open, sleep } = require('./lib'); const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'trailer', 'capture', 'audio'); fs.mkdirSync(OUT, { recursive: true });
const KILL = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, +process.env.KILLMS || 600000);
const INIT = () => {
  try { localStorage.setItem('kab3-prefs', JSON.stringify({ sound: true, sndAsked: 1, tour19: 1 })); } catch (e) {}
  const oc = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (t, ...a) {
    const r = oc.call(this, t, ...a);
    try { if (t && t instanceof AudioDestinationNode) { const c = this.context; if (!c.__rec) { c.__rec = c.createMediaStreamDestination(); window.__recCtx = c; } oc.call(this, c.__rec); } } catch (e) {}
    return r;
  };
  window.__startRec = () => { const c = window.__recCtx; const mr = new MediaRecorder(c.__rec.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 256000 }); const ch = []; mr.ondataavailable = e => ch.push(e.data); mr.start(250); window.__mr = { mr, ch }; return true; };
  window.__stopRec = () => new Promise(res => { const { mr, ch } = window.__mr; mr.onstop = async () => { const b = new Blob(ch, { type: 'audio/webm' }); const buf = await b.arrayBuffer(); let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); res(btoa(s)); }; mr.stop(); });
};
async function rec(page, name, fn, ms) {
  await page.evaluate(() => window.__startRec());
  const t0 = Date.now(); const marks = await fn(); const left = ms - (Date.now() - t0); if (left > 0) await sleep(left);
  const b64 = await page.evaluate(() => window.__stopRec());
  fs.writeFileSync(path.join(OUT, name + '.webm'), Buffer.from(b64, 'base64'));
  if (marks) fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(marks, null, 1));
  console.log('rec', name, Math.round(b64.length * .75 / 1024) + 'KB');
}
(async () => {
  const { browser, page, logs } = await open({ init: INIT });
  await sleep(900); await page.mouse.click(5, 5); await sleep(300);
  const st = await page.evaluate(() => { SFX.unlock(); return SFX.state(); }); console.log(JSON.stringify(st));
  await sleep(500);
  const ok = await page.evaluate(() => !!window.__recCtx); console.log('recCtx', ok); if (!ok) { console.log(logs.join('\n')); process.exit(1); }
  const what = (process.argv[2] || 'test').split(',');
  const themes = ['menu', 'calm', 'tense', 'crisis', 'vote', 'election', 'oath', 'termEnd', 'bunker', 'night', 'finaleBad'];
  for (const w of what) {
    if (w === 'test') await rec(page, 'test', async () => { await page.evaluate(() => SFX.play('paper.stamp')); await sleep(800); await page.evaluate(() => SFX.say('ten', 'Нам нужен доступ ко всей переписке граждан.')); return null; }, 5000);
    if (w === 'themes') for (const th of themes) { await page.evaluate((th) => SFX.scene(th, 600), th); await sleep(3500); await rec(page, 'mus_' + th, async () => null, +process.env.TLEN || 32000); }
    if (w === 'sfx') { await page.evaluate(() => SFX.scene('__none', 600)); await sleep(3500);
      const names = await page.evaluate(() => SFX.list().sfx);
      await rec(page, 'sfx_all', async () => { const marks = {}; const t0 = Date.now(); for (const n of names) { marks[n] = (Date.now() - t0) / 1000; await page.evaluate((n) => SFX.play(n), n); await sleep(n === 'phone.ring' || n === 'oath.bells' || n === 'applause' || n === 'end' ? 4000 : 1800); } return marks; }, 1000); }
    if (w === 'voice') { await page.evaluate(() => SFX.scene('__none', 600)); await sleep(3500);
      const lines = [['adviser', 'Поздравляю! Вы — президент.'], ['ten', 'Нам нужен доступ ко всей переписке граждан.'], ['kogtev', 'Ваши прежние сроки не считаются.'], ['mayor', 'Зима, как обычно, наступила неожиданно.'], ['murka', 'Хорошо, вы вышли к людям!'], ['it', 'Мурлыкоин! Курс будет только расти.'], ['cik', 'Поздравляю. Явка — шестьдесят семь процентов.'], ['seifov', 'Скромные швейцарские часы.'], ['baba', 'Я сорок лет работала!'], ['pres', 'Подписываю.'], ['pm', 'Энергокомпании в долгах, котельные изношены.']];
      await rec(page, 'voice_all', async () => { const marks = {}; const t0 = Date.now(); for (const [w2, t] of lines) { marks[w2] = (Date.now() - t0) / 1000; await page.evaluate(([a, b]) => SFX.say(a, b), [w2, t]); await sleep(3600); } return marks; }, 1000); }
  }
  console.log(JSON.stringify(await page.evaluate(() => SFX.state())));
  console.log(logs.filter(l => /pageerror/.test(l)).join('\n'));
  await browser.close(); clearTimeout(KILL); process.exit(0);
})().catch(e => { console.log('CRASH', e.stack); process.exit(1); });

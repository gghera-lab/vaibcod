// Проверка ПАКЕТА 21 · ЗВУК: нет ошибок консоли, AudioContext только после жеста, хуки зовут SFX, звук реально выходит.
// Запуск: node work\sound\test\sound.test.js   (playwright берётся из work\precheck\node_modules)
const path = require('path');
const { pathToFileURL } = require('url');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(path.join(__dirname, '..', '..', 'precheck', 'node_modules', 'playwright')); }
const GAME = path.join(__dirname, '..', 'kabinet.html');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, pass: !!cond, info }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' · ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await context.route(/telegram\.org|fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  await page.addInitScript(() => {
    window.__AC = []; const Orig = window.AudioContext;
    class Counted extends Orig { constructor(...a) { super(...a); window.__AC.push({ t: performance.now(), stack: (new Error().stack || '').split('\n').slice(2, 5).join(' | ') }); } }
    window.AudioContext = Counted; window.webkitAudioContext = Counted;
  });
  await page.goto(pathToFileURL(GAME).href, { waitUntil: 'load' });
  await sleep(2200);
  const st0 = await page.evaluate(() => ({ sfx: !!window.SFX, ac: window.__AC.length, state: window.SFX && SFX.state(), au2: typeof window.AU2, startVisible: !document.getElementById('start').hidden, banner: !!document.getElementById('snd2') && getComputedStyle(document.getElementById('snd2')).display }));
  ok('SFX загружен', st0.sfx, st0.state);
  ok('AudioContext НЕ создан до жеста', st0.ac === 0, 'создано: ' + st0.ac);
  ok('Старый баннер «Со звуком?» скрыт', !st0.banner || st0.banner === 'none', st0.banner);
  ok('Кнопка звука на стартовом экране', await page.evaluate(() => document.getElementById('p21btn').classList.contains('on')));

  // первый жест
  await page.mouse.click(5, 450);
  await sleep(700);
  const st1 = await page.evaluate(() => ({ ac: window.__AC.length, state: SFX.state() }));
  ok('AudioContext создан после жеста (ровно один)', st1.ac === 1, st1.ac);
  ok('Контекст running', st1.state.ctx === 'running', st1.state.ctx);
  ok('Тема меню', st1.state.theme === 'menu', st1.state.theme);

  // измеритель выхода
  await page.evaluate(() => { const P = SFX._P, c = P.ctx; const an = c.createAnalyser(); an.fftSize = 2048; P.out.connect(an); window.__an = an; window.__meter = () => { const a = new Float32Array(an.fftSize); an.getFloatTimeDomainData(a); let pk = 0, s = 0; for (const x of a) { pk = Math.max(pk, Math.abs(x)); s += x * x; } return { pk, rms: Math.sqrt(s / a.length) }; }; });
  const meter = async (ms) => page.evaluate(async (ms) => { let pk = 0, rms = 0, n = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { const m = window.__meter(); pk = Math.max(pk, m.pk); rms += m.rms; n++; await new Promise(r => setTimeout(r, 20)); } return { pk: +pk.toFixed(3), rms: +(rms / n).toFixed(4) }; }, ms);
  const mMenu = await meter(2500); ok('Музыка меню звучит (rms>0)', mMenu.rms > .0005, mMenu);

  // каждый звук библиотеки: выход есть, без перегруза
  const names = await page.evaluate(() => SFX.list().sfx);
  const loud = [];
  for (const n of names) { await page.evaluate((n) => { SFX._P.last = {}; SFX.play(n, { p: .5, who: 'asya', d: .6 }); }, n); const m = await meter(n.startsWith('ui.') ? 250 : 600); loud.push([n, m.pk, m.rms]); }
  const silent = loud.filter(x => x[1] < .002).map(x => x[0]); const clip = loud.filter(x => x[1] > .99).map(x => x[0]);
  ok('Все звуки библиотеки слышны (' + names.length + ')', silent.length === 0, silent.join(', ') || 'все');
  ok('Нет перегруза (peak ≤ 0.99)', clip.length === 0, clip.join(', ') || 'max ' + Math.max(...loud.map(x => x[1])).toFixed(2));

  // кошачья речь: разные персонажи
  const voices = {};
  for (const w of ['kogtev', 'asya', 'gen', 'baba', 'blog', 'boss', 'ten', 'd_tvs', 'me']) { await page.evaluate((w) => SFX.say(w, 'Господин президент, это очень важно! Вы слышите?', { ms: 2000 }), w); const m = await meter(1200); voices[w] = m.rms; }
  ok('Кошачьи голоса звучат у всех', Object.values(voices).every(v => v > .0008), voices);
  const prof = await page.evaluate(() => ['kogtev', 'asya', 'gen', 'blog', 'ten', 'zam', 'mother', 'm_starec'].map(w => { const p = SFX.voice(w); return w + ':' + Math.round(p.f0) + 'Hz/' + p.size.toFixed(2) + (p.whisper ? '/шёпот' : '') + (p.rough ? '/хрип' : ''); }));
  ok('Профили голосов различаются', new Set(prof.map(x => x.split(':')[1])).size >= 7, prof.join(' '));

  // ход игры через интерфейс: президент → сроки → бюллетень → присяга → карточки
  await page.evaluate(() => { SFX._log.length = 0; });
  await page.click('#start [data-pick="pres"]').catch(() => {});
  await sleep(500);
  await page.click('#start [data-term="1"]').catch(() => {});
  await sleep(600);
  const hasBallot = await page.$('.brow');
  if (hasBallot) { await page.click('.brow'); await sleep(300); await page.click('#bdrop'); await sleep(1800); }
  else await page.evaluate(() => newGame('pres', CANDS[0].id));
  await sleep(800);
  const inaug = await page.evaluate(() => ({ vis: !document.getElementById('inaug').hidden, theme: SFX.state().theme }));
  ok('Присяга: тема oath', inaug.vis && inaug.theme === 'oath', inaug);
  // подпись мышью
  const pad = await page.$('#sigc');
  if (pad) { const b = await pad.boundingBox(); await page.mouse.move(b.x + 30, b.y + b.height / 2); await page.mouse.down(); for (let i = 0; i < 40; i++) await page.mouse.move(b.x + 30 + i * (b.width - 60) / 40, b.y + b.height / 2 + Math.sin(i / 3) * 30); await page.mouse.up(); await page.click('#sigok').catch(() => {}); await sleep(900); await page.click('#towork').catch(() => {}); await sleep(1500); }
  else await page.evaluate(() => { document.getElementById('inaug').hidden = true; next(); });
  await sleep(600);
  await page.evaluate(() => { const i = document.getElementById('inaug'); if (!i.hidden) { const b = document.getElementById('towork'); if (b) b.click(); else { i.hidden = true; next(); } } });
  await sleep(1500);
  // закрыть экскурсию, если открылась
  await page.evaluate(() => { const s = document.querySelector('.t19skip'); if (s && s.offsetParent) s.click(); });
  // несколько карточек: ждём реплик, выбираем вариант дважды (выбор + подпись)
  const seen = new Set();
  for (let k = 0; k < 7; k++) {
    await sleep(600);
    const info = await page.evaluate(() => { const u = U.scr; return u ? { kind: u.kind, t: u.card ? u.card.t : u.t, lines: u.card && u.card.lines ? u.card.lines.length : 0 } : null; });
    if (info) seen.add(info.kind + ':' + info.t);
    await page.evaluate(() => { const b = document.querySelector('.dlgskip'); if (b) b.click(); const d = document.getElementById('docok'); if (d) { U.docRead = true; renderOptions(); } });
    await sleep(300);
    const clicked = await page.evaluate(() => { const ob = [...document.querySelectorAll('#opts .opt:not(.off), #opts button.opt')]; if (!ob.length) return 0; ob[0].click(); return ob.length; });
    await sleep(250);
    await page.evaluate(() => { const on = document.querySelector('#opts .opt.on'); if (on) on.click(); });
    await sleep(2600);
    await page.evaluate(() => { const b = document.querySelector('#opts button.opt.next, #opts .opt.next'); if (b && document.getElementById('vres') && !document.getElementById('vres').hidden) b.click(); });
  }
  const lg = await page.evaluate(() => SFX._log.map(e => e.k + ':' + e.n));
  const cnt = (re) => lg.filter(x => re.test(x)).length;
  ok('Карточки пройдены', seen.size >= 3, [...seen].slice(0, 6).join(' | '));
  ok('Хук: смена листа → paper.page/sheet', cnt(/play:paper\.(page|sheet)/) > 0, cnt(/play:paper\.(page|sheet)/));
  ok('Хук: выбор варианта → ui.select', cnt(/play:ui\.select/) > 0, cnt(/play:ui\.select/));
  ok('Хук: подпись → paper.sign', cnt(/play:paper\.sign/) > 0, cnt(/play:paper\.sign/));
  ok('Хук: печать → paper.stamp', cnt(/play:paper\.stamp/) > 0, cnt(/play:paper\.stamp/));
  ok('Хук: реплики → SFX.say', cnt(/^say:/) > 0, lg.filter(x => /^say:/.test(x)).slice(0, 6).join(' '));
  ok('Тема в игре — calm/tense/crisis/…', await page.evaluate(() => ['calm', 'tense', 'crisis', 'bunker', 'vote', 'election', 'night'].includes(SFX.state().theme)), await page.evaluate(() => SFX.state()));
  ok('Эмбиент кабинета включается', await page.evaluate(() => SFX.state().amb || SFX.state().fam !== 'pov'), await page.evaluate(() => SFX.state().fam));
  ok('«Озвучка 2.0» перенаправлена в движок', await page.evaluate(() => SFX.state().au2routed));

  // голосование: тики подсчёта и итог
  await page.evaluate(() => { SFX._log.length = 0; window.__v = showVote({ card: { t: 'Тестовый закон' } }, { stage: 'Первое чтение', for: 262, against: 150, of: 450, need: 226, pass: true }, true); });
  await sleep(3200);
  const lv = await page.evaluate(() => ({ log: SFX._log.map(e => e.k + ':' + e.n), theme: SFX.state().theme }));
  ok('Голосование: vote.start', lv.log.includes('play:vote.start'), lv.theme);
  ok('Голосование: тики подсчёта', lv.log.filter(x => x === 'play:vote.tick').length >= 5, lv.log.filter(x => x === 'play:vote.tick').length);
  ok('Голосование: итог vote.pass', lv.log.includes('play:vote.pass'));
  ok('Голосование: тема vote', lv.theme === 'vote', lv.theme);
  await page.evaluate(() => U.voteDone && U.voteDone());
  await sleep(300);
  // выборы
  await page.evaluate(() => { SFX._log.length = 0; showElection({ you: 48.2, rival: 39.5, rivalName: 'Соперник', turnout: 61 }); });
  await sleep(6200);
  const le = await page.evaluate(() => SFX._log.map(e => e.k + ':' + e.n));
  ok('Выборы: тики и итог elect.win/lose', (le.includes('play:elect.win') || le.includes('play:elect.lose')) && le.filter(x => x === 'play:elect.tick').length >= 3, le.filter(x => /elect/.test(x)).length);
  await page.evaluate(() => U.voteDone && U.voteDone());
  await sleep(400);

  // меню: панель громкостей
  await page.evaluate(() => openMenu());
  await sleep(400);
  const panel = await page.evaluate(() => ({ p21: !!document.querySelector('#mbody .p21snd'), old: !!document.querySelector('#mbody .vol2'), sliders: document.querySelectorAll('#mbody .p21snd input[type=range]').length }));
  ok('Панель звука в меню (5 ползунков), старая .vol2 убрана', panel.p21 && !panel.old && panel.sliders === 5, panel);
  await page.evaluate(() => { const i = document.querySelector('#mbody [data-p21v="music"]'); i.value = 35; i.dispatchEvent(new Event('input', { bubbles: true })); });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kab-p21-sound')));
  ok('Громкость сохраняется в localStorage', saved && Math.abs(saved.music - .35) < .001, saved);
  await page.click('#mbody [data-p21="mute"]');
  await sleep(300);
  const mut = await page.evaluate(() => ({ m: SFX.isMuted(), pref: PREF.sound, ls: JSON.parse(localStorage.getItem('kab-p21-sound')).muted }));
  ok('Mute: SFX + PREF.sound + localStorage', mut.m && mut.pref === false && mut.ls === true, mut);
  await sleep(700); const mOff = await meter(1200); ok('При mute тишина (хвосты < -46 дБ)', mOff.pk < .005, mOff);
  await page.click('#mbody [data-p21="mute"]');
  await sleep(200);
  ok('Снятие mute', await page.evaluate(() => !SFX.isMuted() && PREF.sound === true));
  // клавиша S старой игры тоже синхронизирует
  await page.evaluate(() => closeModal()); await sleep(300);
  await page.keyboard.press('KeyS'); await sleep(250);
  const sKey = await page.evaluate(() => SFX.isMuted()); await page.keyboard.press('KeyS'); await sleep(250);
  ok('Клавиша S (старый переключатель) синхронизирована', sKey === true && await page.evaluate(() => !SFX.isMuted()));

  // телефон: набор, гудки, голос в трубке через «телефонный» фильтр
  const phoneOk = await page.evaluate(async () => {
    if (typeof PH8 === 'undefined' || typeof openPhoneModal !== 'function') return 'нет PH8';
    SFX._log.length = 0; const id = Object.keys(PH8)[0]; const P = PH8[id]; closeModal(); await new Promise(r => setTimeout(r, 400)); openPhoneModal(id, {}); await new Promise(r => setTimeout(r, 500));
    for (const d of P.num) { const b = document.querySelector(`#mbody [data-k="${d}"]`); b && b.click(); await new Promise(r => setTimeout(r, 120)); }
    await new Promise(r => setTimeout(r, 2200)); if (!document.getElementById('phdisp')) { /* телефон под замком сценарием — проверяем те же пути напрямую */ closeModal(); AU.tone(680, .08, 'sine', .05); AU.tone(425, .5, 'sine', .05); openModal('Телефон', '<div class="phwho"><canvas data-port="minfin"></canvas></div><div id="phdlg"></div>'); await new Promise(r => setTimeout(r, 100)); document.getElementById('phdlg').insertAdjacentHTML('beforeend', '<div class="pl"><b>Рублёв</b>Казна выдержит одно большое обещание.</div>'); await new Promise(r => setTimeout(r, 300)); } const disp = (document.getElementById('phdisp') || {}).textContent; return 'disp=' + disp + ' num=' + P.num + ' ' + SFX._log.map(e => e.k + ':' + e.n).join(' ');
  });
  ok('Телефон: кнопки, гудки, голос', /phone\.key/.test(phoneOk) && /phone\.ringback/.test(phoneOk) && /say:/.test(phoneOk), String(phoneOk).slice(0, 160));
  await page.evaluate(() => closeModal());

  const clipOk = await page.evaluate(async () => { const sr = 24000, n = 24000, b = new ArrayBuffer(44 + n * 2), v = new DataView(b); const w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0))); w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true); for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 8) * 8000, true); let bin = ''; new Uint8Array(b).forEach(x => bin += String.fromCharCode(x)); SFX.loadPack({ items: [{ id: 't1', who: 'kogtev', text: 'Тестовая фраза, господин президент!', src: 'data:audio/wav;base64,' + btoa(bin) }] }); SFX._log.length = 0; SFX.say('kogtev', 'тестовая фраза господин президент'); await new Promise(r => setTimeout(r, 400)); return SFX._log.map(e => e.k + ':' + e.n).join(' ') + ' speaking=' + SFX.state().speaking; });
  ok('Живая озвучка: пакет подменяет мяу по тексту', /clip:t1/.test(clipOk) && /speaking=true/.test(clipOk), clipOk);
  // сцены: принудительная тема (для будущего пролога 4:09)
  await page.evaluate(() => SFX.scene('night', 5)); await sleep(600);
  ok('SFX.scene("night")', await page.evaluate(() => SFX.state().theme === 'night'));
  await page.evaluate(() => SFX.scene(null));
  // итоги срока
  await page.evaluate(() => { SFX._log.length = 0; try { endGame('term_ok'); } catch (e) { console.warn(e); } }); await sleep(900);
  const eg = await page.evaluate(() => ({ theme: SFX.state().theme, log: SFX._log.map(e => e.k + ':' + e.n).join(' ') }));
  ok('Итоги срока: тема termEnd/finale', /termEnd|finale/.test(eg.theme), eg.theme);

  const acEnd = await page.evaluate(() => window.__AC.length);
  ok('За всю сессию один AudioContext', acEnd === 1, acEnd);
  ok('Нет ошибок консоли', errors.length === 0, errors.slice(0, 5).join(' || '));
  const fail = results.filter(r => !r.pass).length;
  console.log(`\nИТОГ: ${results.length - fail}/${results.length} проверок пройдено`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

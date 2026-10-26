const { chromium } = require('../work/precheck/node_modules/playwright');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const GAME = process.env.GAME || require("path").join(__dirname, "..", "build", "kabinet_hd_6.html");
const URL = pathToFileURL(GAME).href;
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

async function open(opts = {}) {
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctxOpts = Object.assign({ viewport: { width: 1920, height: 1080 } }, opts.ctx || {});
  const context = await browser.newContext(ctxOpts);
  const logs = [];
  if (opts.offline) await context.route(/^https?:/, r => r.abort()); else if (!opts.realTG) await context.route(/telegram.org/, r => r.abort());
  const page = await context.newPage();
  page.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/willReadFrequently/.test(m.text())) logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
  page.on('requestfailed', r => logs.push(`[reqfail] ${r.url().slice(0, 120)} ${r.failure() && r.failure().errorText}`));
  page.on('popup', p => logs.push('[popup] ' + p.url()));
  page.on('dialog', d => { logs.push(`[dialog] ${d.type()} ${d.message()}`); d.dismiss().catch(() => {}); });
  if (opts.init) await page.addInitScript(opts.init);
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: opts.wait || 'load', timeout: 60000 }).catch(e => logs.push('[goto] ' + e.message));
  const loadMs = Date.now() - t0;
  return { browser, context, page, logs, loadMs };
}
const shot = (page, name, o) => page.screenshot(Object.assign({ path: path.join(SHOTS, name + '.png'), scale: 'css' }, o || {}));
const sleep = ms => new Promise(r => setTimeout(r, ms));
module.exports = { open, shot, sleep, URL, SHOTS };

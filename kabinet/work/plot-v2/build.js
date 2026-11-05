// сборка тестовой копии «Кабинета» с сюжетом v2: основная игра не меняется
// node build.js → kabinet_plot_v2.html (копия kabinet_hd_6.html + отдельные сохранения + слой «Пакет 22»)
// node build.js --release → ../../kabinet_hd_7.html (релиз: обычные сохранения, без тестовой панели)
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', '..', 'kabinet_hd_6.html');
const REL = process.argv.includes('--release');
const OUT = REL ? path.join(__dirname, '..', '..', 'kabinet_hd_7.html') : path.join(__dirname, 'kabinet_plot_v2.html');
const LAYER = fs.readFileSync(path.join(__dirname, 'p22-layer.html'), 'utf8');

// все ключи localStorage с префиксом — сохранения, настройки и звук не пересекаются с основной игрой
const NS = `<script id="p22-ns">(function () { var P = 'kabv2:', SP = Storage.prototype, g = SP.getItem, s = SP.setItem, r = SP.removeItem;
SP.getItem = function (k) { return g.call(this, P + k); }; SP.setItem = function (k, v) { return s.call(this, P + k, v); }; SP.removeItem = function (k) { return r.call(this, P + k); }; })();</script>`;

let h = fs.readFileSync(SRC, 'utf8');
const hi = h.indexOf('<head>'); if (hi < 0) throw new Error('нет <head>');
if (!REL) h = h.slice(0, hi + 6) + '\n' + NS + '\n' + h.slice(hi + 6);
const bi = h.lastIndexOf('</body>'); if (bi < 0) throw new Error('нет </body>');
// релиз: без тестовой кнопки и панели, обычное название
const REL_FIX = '<style id="p22-release">#p22chip, #p22panel { display: none !important; }</style><script id="p22-release-js">document.title = "Кабинет · три срока"; window.P22_RELEASE = 1;</script>';
h = h.slice(0, bi) + LAYER + (REL ? REL_FIX : '') + '\n' + h.slice(bi);
fs.writeFileSync(OUT, h);
console.log('OK', OUT, (h.length / 1e6).toFixed(2) + ' МБ');

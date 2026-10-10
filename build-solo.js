// 一人用ページ（dist/solo.html）を作る：node tools/build-solo.js
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const mod = (name, file) => `__def(${JSON.stringify(name)}, function (module, exports, require) {\n${read(file)}\n});`;
const shim = `
var __mods = {}, __cache = {};
function __def(n, f) { __mods[n] = f; }
function require(n) {
  n = n.replace(/\\.js$/, '').replace(/^\\.\\.?\\//, './');
  if (n === 'crypto') return { randomInt: function (k) { var a = new Uint32Array(1); window.crypto.getRandomValues(a); return a[0] % k; } };
  if (__cache[n]) return __cache[n].exports;
  var m = { exports: {} }; __cache[n] = m; __mods[n](m, m.exports, require); return m.exports;
}`;
const html = read('public/index.html');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script'));
const css = read('public/style.css') + `
:root { color-scheme: dark; }
html, body { height: 100%; }
body { background: radial-gradient(circle at 50% 35%, var(--felt) 0%, var(--felt-dark) 75%); background-color: var(--felt-dark); }
.screen { top: env(safe-area-inset-top, 0px); bottom: env(safe-area-inset-bottom, 0px); }
`;
const out = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>友達麻雀 一人打ち</title>
<meta name="theme-color" content="#0f3d2e">
<style>
${css}
</style>
${body}
<script>
${shim}
${mod('./yaku', 'yaku.js')}
${mod('./rules', 'rules.js')}
${mod('./game', 'game.js')}
${read('public/tiles.js')}
${read('public/sound.js')}
${read('public/effects.js')}
${read('public/chars.js')}
${read('public/solo.js')}
${read('public/client.js')}
${read('public/replay.js')}
</script>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'solo.html'), out);
console.log('dist/solo.html', out.length, 'bytes');

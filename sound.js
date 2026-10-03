// 効果音（音声ファイルなし：Web Audioで合成）
'use strict';
window.SFX = (function () {
  let ctx = null;
  const KEY = 'mj_sound';
  let mode = 'all'; // 'all' すべて / 'turn' 番と鳴きだけ / 'off' なし
  try { mode = localStorage.getItem(KEY) || 'all'; } catch (e) { /* 保存できない環境 */ }

  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // 最初の操作で音を使えるようにする（ブラウザの決まり）
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, () => ac(), { once: true, passive: true }));

  function tone(freq, start, dur, type = 'sine', vol = 0.18) {
    const c = ac(); if (!c) return;
    const t0 = c.currentTime + start;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function click() {
    const c = ac(); if (!c) return;
    const len = Math.floor(c.sampleRate * 0.04);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = 2200; g.gain.value = 0.5;
    s.buffer = buf; s.connect(f); f.connect(g); g.connect(c.destination); s.start();
  }
  // シュッという風切り音（ノイズを高い方へ流す）
  function swish() {
    const c = ac(); if (!c) return;
    const len = Math.floor(c.sampleRate * 0.18);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) { const x = i / len; d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * x) * (1 - x * 0.5); }
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(900, c.currentTime); f.frequency.exponentialRampToValueAtTime(5200, c.currentTime + 0.16);
    g.gain.value = 0.45;
    s.buffer = buf; s.connect(f); f.connect(g); g.connect(c.destination); s.start();
  }
  const SOUNDS = {
    swish: () => swish(),                                                     // 役が1行ずつ出る
    stamp: () => { tone(196, 0, 0.35, 'sine', 0.3); [784, 988, 1318].forEach((f, i) => tone(f, 0.04 + i * 0.06, 0.4, 'triangle', 0.16)); }, // 満貫などのドン
    turn: () => { tone(880, 0, 0.12); tone(1320, 0.1, 0.18); },            // 自分の番
    alert: () => { tone(1046, 0, 0.1, 'triangle', 0.22); tone(1046, 0.14, 0.1, 'triangle', 0.22); }, // 鳴ける・選択
    discard: () => click(),                                                   // 打牌
    call: () => { tone(523, 0, 0.12, 'square', 0.08); tone(784, 0.08, 0.16, 'square', 0.08); }, // ポン・チー・槓
    riichi: () => { tone(659, 0, 0.15, 'sawtooth', 0.08); tone(988, 0.12, 0.3, 'sawtooth', 0.08); }, // リーチ
    win: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.1, 0.35, 'triangle', 0.2)); }, // 和了
    thunder: () => {
      const c = ac(); if (!c) return;
      const len = Math.floor(c.sampleRate * 1.6);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const crack = t < 0.04 ? 1 : Math.exp(-t * 3.5) * (0.6 + 0.4 * Math.sin(t * 40));
        last = last * 0.96 + (Math.random() * 2 - 1) * 0.04; // 低い音にする
        d[i] = (t < 0.03 ? (Math.random() * 2 - 1) : last * 8) * crack;
      }
      const s = c.createBufferSource(), g = c.createGain();
      g.gain.value = 0.9; s.buffer = buf; s.connect(g); g.connect(c.destination); s.start();
    },
    bigwin1: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.08, 0.45, 'triangle', 0.22)); },
    bigwin2: () => { [392, 523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, i * 0.07, 0.6, 'sawtooth', 0.09)); tone(130, 0, 1.2, 'sine', 0.25); },
    bigwin3: () => {
      [262, 330, 392, 523, 659, 784, 1046, 1318, 1568, 2093].forEach((f, i) => tone(f, i * 0.06, 0.9, 'sawtooth', 0.08));
      [523, 659, 784].forEach(f => tone(f, 0.8, 1.6, 'triangle', 0.18));
      tone(65, 0, 2.0, 'sine', 0.3);
    },
    draw: () => { tone(392, 0, 0.3, 'sine', 0.15); tone(330, 0.25, 0.4, 'sine', 0.15); },           // 流局
  };
  const IMPORTANT = new Set(['turn', 'alert']);
  function play(name) {
    if (mode === 'off') return;
    if (mode === 'turn' && !IMPORTANT.has(name)) return;
    const f = SOUNDS[name]; if (f) { try { f(); } catch (e) { /* 音が出せなくても続ける */ } }
  }
  function setMode(m) { mode = m; try { localStorage.setItem(KEY, m); } catch (e) { /* 保存できない環境 */ } }
  return { play, setMode, get mode() { return mode; } };
})();

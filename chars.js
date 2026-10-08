// オリジナルのちびキャラ（SVG）。表情：normal（ふつう）・happy（和了）・riichi（気合い）・sad（振り込み）
'use strict';
(function () {
  const CHARS = [
    { id: 'rin', name: 'りん', hair: '#e8434f', hairDark: '#b72634', eye: '#c42a3a', style: 'twin', acc: 'pinRed', outfit: '#ffffff', collar: '#e8434f' },
    { id: 'kohaku', name: 'こはく', hair: '#f2c14e', hairDark: '#c8952a', eye: '#b8860b', style: 'long', acc: 'ribbonGold', outfit: '#fff7e0', collar: '#d9a52b' },
    { id: 'shizuku', name: 'しずく', hair: '#5fc4f0', hairDark: '#2f95c8', eye: '#1a9be0', style: 'bob', acc: 'drop', outfit: '#eef8ff', collar: '#1a9be0' },
    { id: 'nanami', name: 'ななみ', hair: 'rainbow', hairDark: '#8a5bd6', eye: '#7b2cbf', style: 'pony', acc: 'star', outfit: '#ffffff', collar: '#8338ec' },
    { id: 'pochi', name: 'ぽち', hair: '#f4f1ea', hairDark: '#c9c2b2', eye: '#2f78c4', style: 'cat', acc: 'pocchi', outfit: '#e9f4ff', collar: '#2f78c4' },
    { id: 'daiya', name: 'ダイヤ', hair: '#2b2b38', hairDark: '#14141c', eye: '#5a6cff', style: 'short', acc: 'diamond', outfit: '#f2f2f7', collar: '#2b2b38' },
  ];
  const SKIN = '#ffe4d6', SKIN_SH = '#f6c9b6', LINE = '#5a3a3a';

  function defs(c, uid) {
    let d = '';
    if (c.hair === 'rainbow') {
      d += `<linearGradient id="h${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6b8a"/><stop offset=".25" stop-color="#ffb84d"/><stop offset=".5" stop-color="#7ed957"/><stop offset=".75" stop-color="#5ab8ff"/><stop offset="1" stop-color="#b07cff"/></linearGradient>`;
    }
    d += `<radialGradient id="e${uid}" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".55" stop-color="${c.eye}"/><stop offset="1" stop-color="#1d1030"/></radialGradient>`;
    return `<defs>${d}</defs>`;
  }
  const hairFill = (c, uid) => (c.hair === 'rainbow' ? `url(#h${uid})` : c.hair);

  // 顔より後ろの髪
  function backHair(c, H) {
    switch (c.style) {
      case 'twin': return `<ellipse cx="17" cy="60" rx="11" ry="22" fill="${H}" transform="rotate(12 17 60)"/><ellipse cx="83" cy="60" rx="11" ry="22" fill="${H}" transform="rotate(-12 83 60)"/>` +
        `<circle cx="22" cy="36" r="6" fill="${c.collar}"/><circle cx="78" cy="36" r="6" fill="${c.collar}"/>`;
      case 'long': return `<path d="M18 46 Q14 80 22 98 L78 98 Q86 80 82 46 Z" fill="${H}"/>`;
      case 'bob': return `<path d="M20 48 Q16 74 28 80 L72 80 Q84 74 80 48 Z" fill="${H}"/>`;
      case 'pony': return `<path d="M74 28 Q100 30 94 62 Q90 82 80 88 Q88 64 76 40 Z" fill="${H}"/><circle cx="76" cy="28" r="5" fill="${c.collar}"/>`;
      case 'cat': return `<path d="M22 48 Q18 70 26 76 L74 76 Q82 70 78 48 Z" fill="${H}"/>`;
      default: return `<path d="M24 50 Q22 66 28 70 L72 70 Q78 66 76 50 Z" fill="${H}"/>`;
    }
  }
  // 前髪と頭の上
  function frontHair(c, H, D) {
    let s = `<path d="M21 52 Q18 18 50 16 Q82 18 79 52 Q74 38 66 34 Q62 44 52 46 Q56 36 54 32 Q44 44 30 44 Q34 38 34 34 Q26 40 21 52 Z" fill="${H}" stroke="${D}" stroke-width="1"/>`;
    s += `<path d="M34 22 Q44 18 54 20" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>`; // つや
    if (c.style === 'cat') s += `<path d="M24 30 L22 8 L40 20 Z" fill="${H}" stroke="${D}" stroke-width="1"/><path d="M27 25 L26 13 L35 20 Z" fill="#f7b8c4"/>` +
      `<path d="M76 30 L78 8 L60 20 Z" fill="${H}" stroke="${D}" stroke-width="1"/><path d="M73 25 L74 13 L65 20 Z" fill="#f7b8c4"/>`;
    if (c.style === 'short') s += `<path d="M58 18 Q70 10 74 20" fill="none" stroke="${H}" stroke-width="4" stroke-linecap="round"/>`; // アホ毛
    return s;
  }
  function accessory(c) {
    switch (c.acc) {
      case 'pinRed': return `<g transform="translate(66 30) rotate(20)"><rect x="-7" y="-2.5" width="14" height="5" rx="2.5" fill="#fff" stroke="#e8434f" stroke-width="1.5"/><text x="0" y="1.6" font-size="5" text-anchor="middle" fill="#e8434f" font-weight="900" font-family="sans-serif">5</text></g>`;
      case 'ribbonGold': return `<g transform="translate(70 26)"><path d="M0 0 L-9 -6 L-9 6 Z M0 0 L9 -6 L9 6 Z" fill="#f5c542" stroke="#b8860b" stroke-width="1"/><circle r="2.6" fill="#ffdf6e" stroke="#b8860b" stroke-width="1"/></g>`;
      case 'drop': return `<path d="M30 24 Q34 30 30 33 Q26 30 30 24 Z" fill="#9fdcff" stroke="#1a9be0" stroke-width="1"/><circle cx="29" cy="30" r=".9" fill="#fff"/>`;
      case 'star': return `<path d="M30 20 L32.4 25.6 L38 26 L33.6 29.6 L35 35 L30 32 L25 35 L26.4 29.6 L22 26 L27.6 25.6 Z" fill="#ffd84d" stroke="#e0a800" stroke-width="1"/>`;
      case 'pocchi': return `<circle cx="50" cy="27" r="3.8" fill="#8fd0ff" stroke="#2f78c4" stroke-width="1.2"/><circle cx="48.8" cy="25.8" r="1.1" fill="#fff"/>`;
      case 'diamond': return `<g transform="translate(68 30)"><path d="M0 -6 L5 0 L0 7 L-5 0 Z" fill="#9db0ff" stroke="#3b4bd6" stroke-width="1"/><path d="M0 -6 L1.6 0 L0 7" fill="none" stroke="#fff" stroke-width=".7" opacity=".8"/></g>`;
    }
    return '';
  }
  function eyes(c, uid, expr) {
    if (expr === 'happy') {
      return `<path d="M32 56 Q39 48 46 56" fill="none" stroke="${LINE}" stroke-width="2.6" stroke-linecap="round"/>` +
        `<path d="M54 56 Q61 48 68 56" fill="none" stroke="${LINE}" stroke-width="2.6" stroke-linecap="round"/>`;
    }
    const one = (x) => {
      let s = `<ellipse cx="${x}" cy="56" rx="6.6" ry="8.2" fill="#fff"/>` +
        `<ellipse cx="${x}" cy="57" rx="5.6" ry="7.4" fill="url(#e${uid})"/>` +
        `<ellipse cx="${x}" cy="58" rx="2.6" ry="3.6" fill="#1d1030"/>` +
        `<circle cx="${x - 2}" cy="53.5" r="2.1" fill="#fff"/><circle cx="${x + 2.2}" cy="60" r="1" fill="#fff"/>`;
      // まつげ（上のふち）
      s += `<path d="M${x - 7.4} 52 Q${x} 45.5 ${x + 7.4} 52" fill="none" stroke="${LINE}" stroke-width="2.4" stroke-linecap="round"/>`;
      if (expr === 'sad') { const o = x < 50 ? -1 : 1; // 外側（目じり）が下がる
        s += `<path d="M${x - 7.6 * o} 53.5 L${x + 7.6 * o} 50 L${x + 7.6 * o} 44 L${x - 7.6 * o} 44 Z" fill="${SKIN}"/>` +
          `<path d="M${x - 7.6 * o} 53.5 L${x + 7.6 * o} 50" stroke="${LINE}" stroke-width="2.4" stroke-linecap="round"/>`; }
      if (expr === 'riichi') s += `<path d="M${x - 7.6} 51 L${x + 7.6} 53.5 L${x + 7.6} 47 L${x - 7.6} 45 Z" fill="${SKIN}"/>` +
        `<path d="M${x - 7.6} 51 L${x + 7.6} 53.5" stroke="${LINE}" stroke-width="2.4" stroke-linecap="round"/>`;
      return s;
    };
    let s = one(39) + one(61);
    if (expr === 'riichi') { // 左右の目を少し内向きのつり目に（右目は反転）
      s = one(39);
      const r = one(61).replace(/M(\d+\.?\d*) 51 L(\d+\.?\d*) 53\.5 L(\d+\.?\d*) 47 L(\d+\.?\d*) 45 Z/, (m, a, b, c2, d) => `M${a} 53.5 L${b} 51 L${c2} 45 L${d} 47 Z`).replace(/M(\d+\.?\d*) 51 L(\d+\.?\d*) 53\.5"/, (m, a, b) => `M${a} 53.5 L${b} 51"`);
      s += r;
    }
    return s;
  }
  function mouth(expr) {
    if (expr === 'happy') return `<path d="M44 66 Q50 74 56 66 Z" fill="#c4384a" stroke="${LINE}" stroke-width="1.4" stroke-linejoin="round"/><path d="M46.5 69.5 Q50 72 53.5 69.5" fill="#ff8fa0"/>`;
    if (expr === 'riichi') return `<path d="M45 68 L55 67" stroke="${LINE}" stroke-width="2" stroke-linecap="round"/>`;
    if (expr === 'sad') return `<path d="M45 69.5 Q47.5 66.5 50 68.5 Q52.5 66.5 55 69.5" fill="none" stroke="${LINE}" stroke-width="1.8" stroke-linecap="round"/>`;
    return `<path d="M46 67 Q48 69.4 50 67 Q52 69.4 54 67" fill="none" stroke="${LINE}" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  function extra(c, expr) {
    if (expr === 'happy') return `<g fill="#ffd84d"><path d="M10 26 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/><path d="M88 18 l1.4 3.6 3.6 1.4 -3.6 1.4 -1.4 3.6 -1.4 -3.6 -3.6 -1.4 3.6 -1.4z"/></g>`;
    if (expr === 'sad') return `<path d="M28 60 Q25.5 65 28 67 Q30.5 65 28 60 Z" fill="#8fd0ff" stroke="#3a8fd6" stroke-width=".8"/>` +
      `<g stroke="#6f8fd6" stroke-width="1.6" stroke-linecap="round" opacity=".8"><path d="M38 34 v7"/><path d="M45 32 v8"/><path d="M52 32 v8"/><path d="M59 34 v7"/></g>`;
    if (expr === 'riichi') return `<g stroke="#ff6b3d" stroke-width="2.4" stroke-linecap="round"><path d="M86 30 l8 -6"/><path d="M88 40 l9 -1"/><path d="M84 22 l4 -9"/></g>`;
    return '';
  }

  let uidN = 0;
  window.CHARACTERS = CHARS.map(c => ({ id: c.id, name: c.name, color: c.collar, cat: 'O' }));
  window.charSVG = function (id, expr = 'normal') {
    const c = CHARS.find(x => x.id === id) || CHARS[0];
    const uid = c.id + (uidN++);
    const H = hairFill(c, uid), D = c.hairDark;
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs(c, uid)}` +
      backHair(c, H) +
      // 体（えり付きの服）
      `<path d="M26 100 Q28 82 50 80 Q72 82 74 100 Z" fill="${c.outfit}" stroke="${D}" stroke-width="1"/>` +
      `<path d="M40 82 L50 92 L60 82" fill="${c.collar}"/>` +
      `<rect x="45" y="74" width="10" height="9" rx="3" fill="${SKIN_SH}"/>` +
      // 顔
      `<ellipse cx="50" cy="54" rx="28" ry="26" fill="${SKIN}"/>` +
      `<ellipse cx="33" cy="64" rx="5" ry="3" fill="#ff9aaa" opacity=".55"/><ellipse cx="67" cy="64" rx="5" ry="3" fill="#ff9aaa" opacity=".55"/>` +
      eyes(c, uid, expr) + mouth(expr) +
      frontHair(c, H, D) + accessory(c) + extra(c, expr) +
      `</svg>`;
  };
})();

// ===== 追加のキャラ50人：A 女の子 20・B ゆるいマスコット動物 15・C ちいさなモンスター 15（すべてオリジナル） =====
// 表情：normal（ふつう）・happy（和了）・riichi（気合い）・sad（振り込み）
(function () {
  const SKIN = '#ffe7da', LINE = '#4a2c2c', DARK = '#2b1b2b';
  let U = 0;
  const shine = (x, y, s = 1) => `<circle cx="${x}" cy="${y}" r="${2.2 * s}" fill="#fff"/><circle cx="${x + 3.2 * s}" cy="${y + 5 * s}" r="${1 * s}" fill="#fff"/>`;
  // まぶた（目じり＝外側の高さ yo、目がしら＝内側の高さ yi）。肌色でふさいで線を引く
  const lid = (x, w, yo, yi, top, fill) => { const o = x < 50 ? -1 : 1;
    return `<path d="M${x + o * w} ${yo} L${x - o * w} ${yi} L${x - o * w} ${top} L${x + o * w} ${top} Z" fill="${fill}"/>` +
      `<path d="M${x + o * w} ${yo} L${x - o * w} ${yi}" stroke="${LINE}" stroke-width="2.2" stroke-linecap="round"/>`; };
  const closedHappy = (x, y, w = 6) => `<path d="M${x - w} ${y} Q${x} ${y - w * 1.2} ${x + w} ${y}" fill="none" stroke="${LINE}" stroke-width="2.6" stroke-linecap="round"/>`;
  const brow = (x, y, kind) => { const o = x < 50 ? -1 : 1; // riichi：目がしらが下がる／sad：目がしらが上がる
    const yo = kind === 'riichi' ? y - 3 : y + 2, yi = kind === 'riichi' ? y + 2 : y - 3;
    return `<path d="M${x + o * 6} ${yo} L${x - o * 6} ${yi}" stroke="${LINE}" stroke-width="2.2" stroke-linecap="round"/>`; };
  const sparkle = `<g fill="#ffd84d"><path d="M10 24 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/><path d="M88 16 l1.4 3.6 3.6 1.4 -3.6 1.4 -1.4 3.6 -1.4 -3.6 -3.6 -1.4 3.6 -1.4z"/></g>`;
  const fire = `<g stroke="#ff6b3d" stroke-width="2.4" stroke-linecap="round"><path d="M86 30 l8 -6"/><path d="M88 40 l9 -1"/><path d="M84 22 l4 -9"/></g>`;
  const gloom = `<g stroke="#6f8fd6" stroke-width="1.6" stroke-linecap="round" opacity=".8"><path d="M40 30 v7"/><path d="M47 28 v8"/><path d="M54 28 v8"/><path d="M61 30 v7"/></g>`;
  const tear = (x, y) => `<path d="M${x} ${y} Q${x - 2.6} ${y + 5} ${x} ${y + 7} Q${x + 2.6} ${y + 5} ${x} ${y} Z" fill="#8fd0ff" stroke="#3a8fd6" stroke-width=".8"/>`;
  const wrap = (s) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${s}</svg>`;

  // ===== A：女の子 =====
  function animeEye(x, uid) {
    return `<ellipse cx="${x}" cy="59" rx="7.4" ry="9.6" fill="#fff"/>` +
      `<ellipse cx="${x}" cy="60.2" rx="6.6" ry="8.8" fill="url(#ie${uid})"/>` +
      `<ellipse cx="${x}" cy="61.5" rx="3.2" ry="4.4" fill="#22122e"/>` + shine(x - 2.6, 55.6, 1.15) +
      `<path d="M${x - 7.8} 53.4 Q${x} 47.6 ${x + 7.8} 53.4" fill="none" stroke="${LINE}" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  function girl(p, expr) {
    const uid = 'g' + (U++);
    const H = p.hair, D = p.dark;
    const backs = {
      long: `<path d="M17 50 Q12 86 22 100 L78 100 Q88 86 83 50 Z" fill="${H}"/>`,
      twin: `<path d="M20 44 Q4 60 10 92 Q16 98 22 90 Q18 70 26 52 Z" fill="${H}"/><path d="M80 44 Q96 60 90 92 Q84 98 78 90 Q82 70 74 52 Z" fill="${H}"/>`,
      bob: `<path d="M19 48 Q15 76 27 82 L73 82 Q85 76 81 48 Z" fill="${H}"/>`,
      pony: `<path d="M70 26 Q98 26 92 60 Q88 84 76 92 Q86 64 72 40 Z" fill="${H}"/>`,
      side: `<path d="M24 40 Q4 52 12 82 Q18 92 24 86 Q20 66 30 50 Z" fill="${H}"/>`,
      bun: `<circle cx="28" cy="22" r="10" fill="${H}" stroke="${D}" stroke-width="1"/><circle cx="72" cy="22" r="10" fill="${H}" stroke="${D}" stroke-width="1"/><path d="M21 48 Q18 70 28 74 L72 74 Q82 70 79 48 Z" fill="${H}"/>`,
      braid: `<path d="M21 48 Q18 70 28 74 L72 74 Q82 70 79 48 Z" fill="${H}"/>` + [0, 1, 2, 3].map(i => `<ellipse cx="${18 - i}" cy="${64 + i * 8}" rx="5.4" ry="5" fill="${H}" stroke="${D}" stroke-width="1"/><ellipse cx="${82 + i}" cy="${64 + i * 8}" rx="5.4" ry="5" fill="${H}" stroke="${D}" stroke-width="1"/>`).join(''),
      short: `<path d="M22 48 Q20 66 28 70 L72 70 Q80 66 78 48 Z" fill="${H}"/>`,
      wavy: `<path d="M16 48 Q8 64 16 74 Q10 86 20 98 L80 98 Q90 86 84 74 Q92 64 84 48 Z" fill="${H}"/>`,
    };
    const O = p.outfit, C = p.collar;
    let body = `<path d="M24 100 Q26 80 50 78 Q74 80 76 100 Z" fill="${O}" stroke="${D}" stroke-width=".8"/>`;
    if (p.wear === 'sailor') body += `<path d="M30 82 L50 96 L70 82 L66 79 L50 89 L34 79 Z" fill="${C}"/><path d="M46 92 L50 100 L54 92 Z" fill="#e8434f"/>`;
    else if (p.wear === 'military') body += `<path d="M40 79 L50 92 L60 79" fill="none" stroke="${C}" stroke-width="3"/><circle cx="50" cy="95" r="1.6" fill="#e9c46a"/><rect x="26" y="84" width="9" height="3" rx="1" fill="#e9c46a"/><rect x="65" y="84" width="9" height="3" rx="1" fill="#e9c46a"/>`;
    else if (p.wear === 'blazer') body += `<path d="M38 79 L50 96 L62 79" fill="#fff"/><path d="M48 84 L50 96 L52 84 Z" fill="${C}"/><path d="M36 80 L44 100 M64 80 L56 100" stroke="${D}" stroke-width="1.2"/>`;
    else if (p.wear === 'hoodie') body += `<path d="M34 80 Q50 90 66 80" fill="none" stroke="${C}" stroke-width="3"/><path d="M45 86 v8 M55 86 v8" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`;
    else body += `<path d="M40 80 L50 90 L60 80" fill="${C}"/>`;
    body += `<rect x="45" y="72" width="10" height="9" rx="3" fill="#f8cdb9"/>`;
    const fronts = {
      straight: `<path d="M19 54 Q16 16 50 14 Q84 16 81 54 Q78 42 74 40 L74 44 Q66 40 62 44 Q58 40 54 44 Q50 40 46 44 Q42 40 38 44 Q34 40 30 44 L28 40 Q22 44 19 54 Z" fill="${H}" stroke="${D}" stroke-width="1"/>`,
      swept: `<path d="M19 54 Q16 16 50 14 Q84 16 81 54 Q76 34 64 30 Q58 44 40 46 Q46 38 44 34 Q32 44 26 46 Q22 48 19 54 Z" fill="${H}" stroke="${D}" stroke-width="1"/>`,
      m: `<path d="M19 54 Q16 16 50 14 Q84 16 81 54 Q76 40 68 36 Q64 46 54 46 Q56 38 50 32 Q44 38 46 46 Q36 46 32 36 Q24 40 19 54 Z" fill="${H}" stroke="${D}" stroke-width="1"/>`,
    };
    let front = fronts[p.bangs || 'm'] + `<path d="M30 24 Q42 18 56 20" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".5"/>`;
    if (p.ahoge) front += `<path d="M52 15 Q58 4 66 10" fill="none" stroke="${H}" stroke-width="3.4" stroke-linecap="round"/>`;
    const A = {
      headband: `<path d="M20 38 Q50 18 80 38" fill="none" stroke="${p.accC}" stroke-width="4.6" stroke-linecap="round"/><path d="M72 30 l8 -6 l2 9 z M72 30 l-2 -10 l9 3 z" fill="${p.accC}"/>`,
      beret: `<ellipse cx="44" cy="16" rx="26" ry="9" fill="${p.accC}" transform="rotate(-10 44 16)"/><circle cx="40" cy="7" r="2.4" fill="${p.accC}"/>`,
      cap: `<path d="M22 30 Q50 6 78 30 L78 34 Q50 26 22 34 Z" fill="${p.accC}"/><path d="M22 33 Q50 27 80 33 L84 38 Q50 32 18 38 Z" fill="#2b2b2b"/><path d="M50 15 l2 4.4 4.8 .4 -3.6 3 1.2 4.6 -4.4 -2.6 -4.4 2.6 1.2 -4.6 -3.6 -3 4.8 -.4 z" fill="#e9c46a"/>`,
      helmet: `<path d="M18 38 Q18 8 50 8 Q82 8 82 38 Z" fill="${p.accC}"/><rect x="16" y="35" width="68" height="5" rx="2" fill="#3b4a2f"/><circle cx="50" cy="22" r="4" fill="#e9c46a"/>`,
      cat: `<path d="M22 32 L20 8 L40 20 Z" fill="${H}" stroke="${D}"/><path d="M25 27 L24 14 L34 20 Z" fill="#ffb8c8"/><path d="M78 32 L80 8 L60 20 Z" fill="${H}" stroke="${D}"/><path d="M75 27 L76 14 L66 20 Z" fill="#ffb8c8"/>`,
      bunny: `<ellipse cx="36" cy="6" rx="6" ry="16" fill="#fff" stroke="#ddd" transform="rotate(-12 36 6)"/><ellipse cx="64" cy="6" rx="6" ry="16" fill="#fff" stroke="#ddd" transform="rotate(12 64 6)"/><ellipse cx="36" cy="8" rx="2.6" ry="10" fill="#ffc6d3" transform="rotate(-12 36 8)"/><ellipse cx="64" cy="8" rx="2.6" ry="10" fill="#ffc6d3" transform="rotate(12 64 8)"/>`,
      glasses: `<circle cx="38" cy="60" r="9" fill="none" stroke="${p.accC}" stroke-width="1.8"/><circle cx="62" cy="60" r="9" fill="none" stroke="${p.accC}" stroke-width="1.8"/><path d="M47 60 h6" stroke="${p.accC}" stroke-width="1.8"/>`,
      star: `<path d="M70 26 l2.6 5.4 6 .8 -4.4 4 1.2 6 -5.4 -3 -5.4 3 1.2 -6 -4.4 -4 6 -.8 z" fill="${p.accC}" stroke="#fff" stroke-width="1"/>`,
      flower: `<g transform="translate(72 30)">${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-5" rx="3.4" ry="5" fill="${p.accC}" transform="rotate(${a})"/>`).join('')}<circle r="2.6" fill="#ffe066"/></g>`,
      bow: `<g transform="translate(50 12)"><path d="M0 0 L-14 -8 L-14 8 Z M0 0 L14 -8 L14 8 Z" fill="${p.accC}" stroke="#fff" stroke-width="1"/><circle r="3.4" fill="${p.accC}" stroke="#fff" stroke-width="1"/></g>`,
      phones: `<path d="M16 54 Q14 10 50 10 Q86 10 84 54" fill="none" stroke="#333" stroke-width="3.4"/><rect x="10" y="48" width="10" height="16" rx="4" fill="${p.accC}"/><rect x="80" y="48" width="10" height="16" rx="4" fill="${p.accC}"/>`,
      witch: `<path d="M14 34 Q50 24 86 34 Q50 40 14 34 Z" fill="#3b2a5c"/><path d="M30 31 Q42 -6 70 4 Q58 10 66 31 Z" fill="#3b2a5c"/><path d="M33 26 Q50 22 66 26" stroke="${p.accC}" stroke-width="3"/>`,
      crown: `<path d="M34 20 L38 8 L44 16 L50 4 L56 16 L62 8 L66 20 Z" fill="#ffd54d" stroke="#d1a000" stroke-width="1"/>`,
      clip: `<rect x="64" y="28" width="12" height="4" rx="2" fill="${p.accC}" transform="rotate(30 70 30)"/><rect x="62" y="34" width="12" height="4" rx="2" fill="${p.accC}" transform="rotate(30 68 36)"/>`,
    };
    // 目と口（表情ごと）
    let face;
    if (expr === 'happy') face = closedHappy(38, 60, 7) + closedHappy(62, 60, 7) + `<path d="M44.5 69 Q50 77 55.5 69 Z" fill="#d6455a"/>`;
    else {
      face = animeEye(38, uid) + animeEye(62, uid);
      if (expr === 'riichi') face += lid(38, 8.6, 50.5, 55, 44, SKIN) + lid(62, 8.6, 50.5, 55, 44, SKIN) + `<path d="M45.5 71 L54.5 70.4" stroke="${LINE}" stroke-width="1.9" stroke-linecap="round"/>`;
      else if (expr === 'sad') face += lid(38, 8.6, 56, 51.5, 44, SKIN) + lid(62, 8.6, 56, 51.5, 44, SKIN) + tear(29, 64) + `<path d="M45 72 Q47.5 69 50 71 Q52.5 69 55 72" fill="none" stroke="${LINE}" stroke-width="1.7" stroke-linecap="round"/>`;
      else face += p.mouth === 'open' ? `<path d="M45.5 70 Q50 76.5 54.5 70 Z" fill="#d6455a"/>` : p.mouth === 'cat' ? `<path d="M45 70 Q47.5 72.6 50 70 Q52.5 72.6 55 70" fill="none" stroke="${LINE}" stroke-width="1.7" stroke-linecap="round"/>` : `<path d="M46.5 70.5 Q50 73.5 53.5 70.5" fill="none" stroke="${LINE}" stroke-width="1.7" stroke-linecap="round"/>`;
    }
    const fx = expr === 'happy' ? sparkle : expr === 'riichi' ? fire : expr === 'sad' ? gloom : '';
    return wrap(`<defs><linearGradient id="ie${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d1030"/><stop offset=".55" stop-color="${p.eye}"/><stop offset="1" stop-color="#fff" stop-opacity=".9"/></linearGradient></defs>` +
      (backs[p.style] || backs.short) + body + `<ellipse cx="50" cy="56" rx="29" ry="27" fill="${SKIN}"/>` +
      `<ellipse cx="33" cy="68" rx="5.4" ry="3" fill="#ff8fa3" opacity=".5"/><ellipse cx="67" cy="68" rx="5.4" ry="3" fill="#ff8fa3" opacity=".5"/>` +
      face + front + (A[p.acc] || '') + fx);
  }

  // ===== B：ゆるいマスコット動物 =====
  function mascot(p, expr) {
    const B = p.body, I = p.inner || '#fff7ec';
    const ears = {
      round: `<circle cx="27" cy="26" r="11" fill="${B}"/><circle cx="73" cy="26" r="11" fill="${B}"/><circle cx="27" cy="26" r="6" fill="${I}"/><circle cx="73" cy="26" r="6" fill="${I}"/>`,
      cat: `<path d="M18 38 L22 10 L42 26 Z" fill="${B}"/><path d="M82 38 L78 10 L58 26 Z" fill="${B}"/><path d="M24 30 L26 17 L35 25 Z" fill="${I}"/><path d="M76 30 L74 17 L65 25 Z" fill="${I}"/>`,
      bunny: `<ellipse cx="36" cy="16" rx="8" ry="20" fill="${B}"/><ellipse cx="64" cy="16" rx="8" ry="20" fill="${B}"/><ellipse cx="36" cy="18" rx="3.6" ry="13" fill="${I}"/><ellipse cx="64" cy="18" rx="3.6" ry="13" fill="${I}"/>`,
      droop: `<ellipse cx="18" cy="48" rx="9" ry="18" fill="${p.ear || B}" transform="rotate(14 18 48)"/><ellipse cx="82" cy="48" rx="9" ry="18" fill="${p.ear || B}" transform="rotate(-14 82 48)"/>`,
      panda: `<circle cx="26" cy="26" r="11" fill="#2b2b2b"/><circle cx="74" cy="26" r="11" fill="#2b2b2b"/>`,
      none: '', frog: `<circle cx="34" cy="28" r="12" fill="${B}"/><circle cx="66" cy="28" r="12" fill="${B}"/>`,
      tuft: `<path d="M44 18 Q50 4 56 18 Q50 12 44 18 Z" fill="${B}"/>`,
      fox: `<path d="M16 40 L20 6 L44 24 Z" fill="${B}"/><path d="M84 40 L80 6 L56 24 Z" fill="${B}"/><path d="M22 30 L24 14 L36 24 Z" fill="#3a2a2a"/><path d="M78 30 L76 14 L64 24 Z" fill="#3a2a2a"/>`,
    };
    const panda = p.ear0 === 'panda';
    let s = ears[p.ear0 || 'round'] + `<ellipse cx="50" cy="58" rx="36" ry="33" fill="${B}"/>`;
    if (panda) s += `<ellipse cx="37" cy="56" rx="7" ry="9" fill="#2b2b2b" transform="rotate(20 37 56)"/><ellipse cx="63" cy="56" rx="7" ry="9" fill="#2b2b2b" transform="rotate(-20 63 56)"/>`;
    if (p.mask) s += `<path d="M14 58 Q50 30 86 58 Q80 44 50 38 Q20 44 14 58 Z" fill="${p.mask}"/>`;
    if (p.muzzle !== false) s += `<ellipse cx="50" cy="68" rx="15" ry="11" fill="${I}"/>`;
    const ex = panda ? [37, 63] : [36, 64];
    const eyeCol = panda ? '#fff' : DARK;
    const eye = (x) => (p.eyes === 'sleepy' && expr === 'normal') ? `<path d="M${x - 5} 56 Q${x} 60 ${x + 5} 56" fill="none" stroke="${DARK}" stroke-width="2.4" stroke-linecap="round"/>`
      : panda ? `<circle cx="${x}" cy="56" r="3.4" fill="#fff"/><circle cx="${x + (x < 50 ? .6 : -.6)}" cy="56.4" r="2" fill="#111"/>`
        : p.eyes === 'sparkle' ? `<circle cx="${x}" cy="56" r="5" fill="${DARK}"/>${shine(x - 1.6, 54, .8)}`
          : `<circle cx="${x}" cy="56" r="3.2" fill="${DARK}"/><circle cx="${x - 1}" cy="55" r="1" fill="#fff"/>`;
    if (expr === 'happy') s += closedHappy(ex[0], 57, 5).replace(LINE, panda ? '#fff' : LINE) + closedHappy(ex[1], 57, 5).replace(LINE, panda ? '#fff' : LINE);
    else s += eye(ex[0]) + eye(ex[1]);
    if (expr === 'riichi' || expr === 'sad') s += brow(ex[0], 47, expr) + brow(ex[1], 47, expr);
    // 鼻・口
    if (p.beak) s += expr === 'happy' ? `<path d="M43 63 L57 63 L50 73 Z" fill="${p.beak}"/><path d="M45 66 L55 66" stroke="#c46a1e" stroke-width="1.2"/>` : `<path d="M44 64 L56 64 L50 72 Z" fill="${p.beak}"/>`;
    else {
      s += `<ellipse cx="50" cy="64" rx="3.6" ry="2.6" fill="${p.nose || '#3a2626'}"/>`;
      s += expr === 'happy' ? `<path d="M45 68 Q50 76 55 68 Z" fill="#d6455a"/>`
        : expr === 'sad' ? `<path d="M50 66.6 v2.4 M45 72.6 Q50 68.4 55 72.6" fill="none" stroke="#3a2626" stroke-width="1.5" stroke-linecap="round"/>`
          : expr === 'riichi' ? `<path d="M50 66.6 v2.6 M46 70.6 L54 70.2" fill="none" stroke="#3a2626" stroke-width="1.6" stroke-linecap="round"/>`
            : `<path d="M50 66.6 v3 M50 69.6 Q46.5 72.6 44 70 M50 69.6 Q53.5 72.6 56 70" fill="none" stroke="#3a2626" stroke-width="1.5" stroke-linecap="round"/>`;
    }
    s += `<ellipse cx="27" cy="68" rx="6" ry="3.6" fill="#ff8fa3" opacity=".55"/><ellipse cx="73" cy="68" rx="6" ry="3.6" fill="#ff8fa3" opacity=".55"/>`;
    if (expr === 'sad') s += tear(25, 60);
    const T = {
      leaf: `<path d="M50 24 Q60 10 70 18 Q62 28 50 24 Z" fill="#7ac74f" stroke="#4e9a2f"/>`,
      nightcap: `<path d="M24 34 Q40 4 70 12 Q82 20 76 30 Q50 22 24 34 Z" fill="#8fb8ff"/><circle cx="78" cy="30" r="5" fill="#fff"/>`,
      bowtie: `<path d="M50 92 L40 86 L40 98 Z M50 92 L60 86 L60 98 Z" fill="#e8434f"/>`,
      scarf: `<path d="M20 84 Q50 96 80 84 L80 90 Q50 102 20 90 Z" fill="#e8434f"/>`,
      flower: `<g transform="translate(72 30)">${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-4.4" rx="3" ry="4.4" fill="#ff9ec7" transform="rotate(${a})"/>`).join('')}<circle r="2.4" fill="#ffe066"/></g>`,
      hat: `<ellipse cx="50" cy="26" rx="22" ry="5" fill="#d9a441"/><path d="M36 26 Q36 12 50 12 Q64 12 64 26 Z" fill="#e8b552"/><path d="M36 22 h28" stroke="#e8434f" stroke-width="3"/>`,
      tea: `<rect x="66" y="78" width="16" height="13" rx="3" fill="#fff" stroke="#c9b9a6"/><path d="M82 81 q6 3 0 7" fill="none" stroke="#c9b9a6" stroke-width="1.6"/><path d="M70 74 q2 -4 0 -6 M76 74 q2 -4 0 -6" stroke="#bbb" stroke-width="1.2" fill="none"/>`,
      ribbon: `<g transform="translate(70 24)"><path d="M0 0 L-9 -6 L-9 6 Z M0 0 L9 -6 L9 6 Z" fill="#ff7ab0"/><circle r="2.6" fill="#ff7ab0"/></g>`,
    };
    s += T[p.item] || '';
    s += expr === 'happy' ? sparkle : expr === 'riichi' ? fire : expr === 'sad' ? gloom : '';
    return wrap(s);
  }

  // ===== C：ちいさなモンスター =====
  function monster(p, expr) {
    const B = p.body;
    const shapes = {
      blob: `<path d="M18 80 Q14 40 50 30 Q86 40 82 80 Q50 92 18 80 Z" fill="${B}"/>`,
      round: `<circle cx="50" cy="58" r="32" fill="${B}"/>`,
      drop: `<path d="M50 14 Q80 52 78 66 Q76 88 50 88 Q24 88 22 66 Q20 52 50 14 Z" fill="${B}"/>`,
      ghost: `<path d="M22 86 L22 50 Q22 22 50 22 Q78 22 78 50 L78 86 L71 80 L64 86 L57 80 L50 86 L43 80 L36 86 L29 80 Z" fill="${B}" stroke="#c9c0ef" stroke-width="1.2"/>`,
      cloud: `<path d="M22 76 Q8 74 12 60 Q8 44 26 44 Q28 26 46 30 Q58 18 70 32 Q90 30 88 50 Q96 64 82 76 Z" fill="${B}" stroke="#c9dcff" stroke-width="1.2"/>`,
      star: `<path d="M50 12 L61 40 L90 42 L67 60 L75 88 L50 72 L25 88 L33 60 L10 42 L39 40 Z" fill="${B}" stroke-linejoin="round" stroke="${B}" stroke-width="6"/>`,
      egg: `<ellipse cx="50" cy="58" rx="28" ry="34" fill="${B}"/>`,
      seed: `<ellipse cx="50" cy="62" rx="30" ry="27" fill="${B}"/>`,
    };
    const behind = {
      wings: `<path d="M20 52 Q2 36 6 22 Q20 32 30 46 Z" fill="${p.c2}"/><path d="M80 52 Q98 36 94 22 Q80 32 70 46 Z" fill="${p.c2}"/>`,
      flame: `<path d="M50 4 Q64 18 58 30 Q66 26 64 18 Q76 32 64 44 L36 44 Q24 32 36 18 Q34 26 42 30 Q36 18 50 4 Z" fill="${p.c2}"/>`,
      sprout: `<path d="M50 30 v-12" stroke="#4e9a2f" stroke-width="3"/><path d="M50 20 Q36 6 28 16 Q38 26 50 20 Z M50 20 Q64 6 72 16 Q62 26 50 20 Z" fill="#7ac74f"/>`,
      horns: `<path d="M30 34 L26 12 L40 28 Z" fill="${p.c2}"/><path d="M70 34 L74 12 L60 28 Z" fill="${p.c2}"/>`,
      fins: `<path d="M16 60 L4 50 L8 70 Z" fill="${p.c2}"/><path d="M84 60 L96 50 L92 70 Z" fill="${p.c2}"/><path d="M50 22 Q58 10 66 16 L56 30 Z" fill="${p.c2}"/>`,
      antenna: `<path d="M40 30 Q34 14 26 10" stroke="${p.c2}" stroke-width="2.6" fill="none"/><path d="M60 30 Q66 14 74 10" stroke="${p.c2}" stroke-width="2.6" fill="none"/><circle cx="26" cy="10" r="4.4" fill="#ffe066"/><circle cx="74" cy="10" r="4.4" fill="#ffe066"/>`,
      // かめ：体より大きな甲羅をうしろに（ふちが見える）＋頭の上に甲羅の模様
      shell: `<circle cx="50" cy="60" r="38" fill="${p.c2}"/><path d="M50 22 l9 5 v10 l-9 5 l-9 -5 v-10 z" fill="none" stroke="#4e7a2a" stroke-width="2"/><path d="M18 52 l8 -3 M82 52 l-8 -3 M22 80 l7 -4 M78 80 l-7 -4" stroke="#4e7a2a" stroke-width="2.2" stroke-linecap="round"/>`,
      ears: `<ellipse cx="30" cy="26" rx="8" ry="14" fill="${B}" transform="rotate(-20 30 26)"/><ellipse cx="70" cy="26" rx="8" ry="14" fill="${B}" transform="rotate(20 70 26)"/><ellipse cx="30" cy="27" rx="3.4" ry="8" fill="${p.c2}" transform="rotate(-20 30 27)"/><ellipse cx="70" cy="27" rx="3.4" ry="8" fill="${p.c2}" transform="rotate(20 70 27)"/>`,
      // りす：くるんとした大きなしっぽ（丸の中に収める）＋小さな耳
      tail: `<path d="M66 82 Q92 72 88 46 Q84 26 66 30 Q80 42 72 62 Z" fill="${p.c2}"/><path d="M70 40 Q80 44 78 56" fill="none" stroke="#fff" stroke-width="2" opacity=".5"/><path d="M28 40 L26 28 L38 36 Z" fill="${B}"/><path d="M62 38 L66 26 L72 38 Z" fill="${B}"/>`,
      none: '',
    };
    let s = (behind[p.extra] || '') + (shapes[p.shape] || shapes.blob);
    if (p.belly) s += `<ellipse cx="50" cy="74" rx="16" ry="11" fill="${p.belly}"/>`;
    if (p.spots) s += `<circle cx="30" cy="52" r="4" fill="${p.c2}" opacity=".7"/><circle cx="72" cy="48" r="3" fill="${p.c2}" opacity=".7"/><circle cx="68" cy="72" r="3.6" fill="${p.c2}" opacity=".7"/>`;
    const Y = p.eyeY || 58;
    const one = p.eyes === 'one';
    if (expr === 'happy' || (p.eyes === 'happy' && expr === 'normal')) s += one ? closedHappy(50, Y + 2, 8) : closedHappy(39, Y + 1, 5.5) + closedHappy(61, Y + 1, 5.5);
    else if (one) s += `<circle cx="50" cy="${Y}" r="10" fill="#fff"/><circle cx="50" cy="${Y + 1}" r="6.4" fill="${DARK}"/>${shine(47.4, Y - 2.4, 1.1)}`;
    else s += [39, 61].map(x => `<ellipse cx="${x}" cy="${Y}" rx="5.6" ry="7" fill="${DARK}"/>${shine(x - 1.8, Y - 3, .9)}`).join('');
    if (expr === 'riichi' || expr === 'sad') s += one ? brow(50, Y - 13, expr).replace(/M(\S+) (\S+) L(\S+) (\S+)"/, (m, a, b, c, d) => `M42 ${expr === 'riichi' ? Y - 15 : Y - 11} L58 ${expr === 'riichi' ? Y - 15 : Y - 11}"`) : brow(39, Y - 10, expr) + brow(61, Y - 10, expr);
    s += `<ellipse cx="${one ? 32 : 30}" cy="${Y + 9}" rx="5" ry="3" fill="#ff7f9c" opacity=".55"/><ellipse cx="${one ? 68 : 70}" cy="${Y + 9}" rx="5" ry="3" fill="#ff7f9c" opacity=".55"/>`;
    if (expr === 'happy') s += `<path d="M44 ${Y + 10} Q50 ${Y + 18} 56 ${Y + 10} Z" fill="#c8384e"/>`;
    else if (expr === 'sad') s += `<path d="M45 ${Y + 15} Q50 ${Y + 10.6} 55 ${Y + 15}" fill="none" stroke="${DARK}" stroke-width="1.8" stroke-linecap="round"/>` + tear(one ? 36 : 30, Y + 2);
    else if (expr === 'riichi') s += `<path d="M45 ${Y + 12.4} L55 ${Y + 12}" stroke="${DARK}" stroke-width="1.9" stroke-linecap="round"/>`;
    else s += p.mouth === 'fang' ? `<path d="M44 ${Y + 11} Q50 ${Y + 16} 56 ${Y + 11}" fill="none" stroke="${DARK}" stroke-width="1.8" stroke-linecap="round"/><path d="M47 ${Y + 12.4} l1.4 3 1.4 -2.6 z" fill="#fff"/>`
      : p.mouth === 'o' ? `<ellipse cx="50" cy="${Y + 12}" rx="3" ry="3.4" fill="#c8384e"/>`
        : `<path d="M44 ${Y + 10} Q50 ${Y + 17} 56 ${Y + 10} Z" fill="#c8384e"/>`;
    s += expr === 'happy' ? sparkle : expr === 'riichi' ? fire : expr === 'sad' ? gloom : '';
    return wrap(s);
  }

  // ===== 一覧（id は a01〜a20・b01〜b15・c01〜c15） =====
  const LIST = [];
  const add = (cat, name, fn, o, color) => { const id = cat.toLowerCase() + String(LIST.filter(x => x.cat === cat).length + 1).padStart(2, '0'); LIST.push({ id, cat, name, color, draw: (e) => fn(o, e) }); };
  const G = (name, o) => add('A', name, girl, o, o.accC || o.collar);
  const M = (name, o) => add('B', name, mascot, o, o.color || o.body);
  const X = (name, o) => add('C', name, monster, o, o.color || o.body);
  G('元気なリーダー', { hair: '#ff7aa8', dark: '#d1477a', eye: '#d1477a', style: 'side', bangs: 'm', wear: 'sailor', outfit: '#fff', collar: '#e8434f', acc: 'star', accC: '#ffd23f', mouth: 'open', ahoge: true });
  G('無口な読書家', { hair: '#9fb4c8', dark: '#6b8094', eye: '#5c6f8a', style: 'short', bangs: 'straight', wear: 'sailor', outfit: '#fff', collar: '#2d4a8a', acc: 'glasses', accC: '#8a8a9a', mouth: 'line' });
  G('ふわふわ先輩', { hair: '#e9b77a', dark: '#b88446', eye: '#c0742a', style: 'wavy', bangs: 'swept', wear: 'blazer', outfit: '#5b6fb0', collar: '#e8434f', acc: 'flower', accC: '#ff9ec7', mouth: 'cat' });
  G('戦車長', { hair: '#3a2a1e', dark: '#20160e', eye: '#6b4a2a', style: 'short', bangs: 'swept', wear: 'military', outfit: '#4b5d3a', collar: '#e9c46a', acc: 'cap', accC: '#4b5d3a', mouth: 'line', ahoge: true });
  G('砲手', { hair: '#d8a24a', dark: '#a8761e', eye: '#2e7bd6', style: 'twin', bangs: 'm', wear: 'military', outfit: '#3c5a3c', collar: '#c9a24a', acc: 'helmet', accC: '#5a6b44', mouth: 'open' });
  G('通信手', { hair: '#2b2b38', dark: '#14141c', eye: '#c43a5a', style: 'long', bangs: 'straight', wear: 'military', outfit: '#2f3e57', collar: '#e9c46a', acc: 'phones', accC: '#e8434f', mouth: 'line' });
  G('装填手', { hair: '#e8434f', dark: '#b72634', eye: '#c42a3a', style: 'pony', bangs: 'm', wear: 'military', outfit: '#6b5a3a', collar: '#e9c46a', acc: 'beret', accC: '#3c5a3c', mouth: 'open' });
  G('操縦手', { hair: '#f2c14e', dark: '#c8952a', eye: '#3a8a5a', style: 'braid', bangs: 'swept', wear: 'military', outfit: '#3c5a3c', collar: '#fff', acc: 'clip', accC: '#e8434f', mouth: 'cat' });
  G('ねこみみ後輩', { hair: '#f4f1ea', dark: '#c9c2b2', eye: '#2f78c4', style: 'bob', bangs: 'm', wear: 'hoodie', outfit: '#ffd6e5', collar: '#ff7ab0', acc: 'cat', accC: '#ff7ab0', mouth: 'cat' });
  G('うさみみ', { hair: '#ff9ec7', dark: '#d46a96', eye: '#c43a7a', style: 'twin', bangs: 'straight', wear: 'blazer', outfit: '#2f3e57', collar: '#ff7ab0', acc: 'bunny', accC: '#ff9ec7', mouth: 'open' });
  G('魔女っ子', { hair: '#8a5bd6', dark: '#5a2fa6', eye: '#7b2cbf', style: 'long', bangs: 'swept', wear: 'plain', outfit: '#3b2a5c', collar: '#ffd23f', acc: 'witch', accC: '#ffd23f', mouth: 'cat' });
  G('おひめさま', { hair: '#ffd54d', dark: '#d1a000', eye: '#2e7bd6', style: 'wavy', bangs: 'm', wear: 'plain', outfit: '#ffc6e0', collar: '#ff7ab0', acc: 'crown', accC: '#ffd54d', mouth: 'open' });
  G('ゲーマー', { hair: '#5fc4f0', dark: '#2f95c8', eye: '#1a9be0', style: 'short', bangs: 'swept', wear: 'hoodie', outfit: '#2b2b38', collar: '#5fc4f0', acc: 'phones', accC: '#5fc4f0', mouth: 'cat', ahoge: true });
  G('おだんご', { hair: '#3a2a1e', dark: '#20160e', eye: '#c0742a', style: 'bun', bangs: 'straight', wear: 'sailor', outfit: '#fff', collar: '#e8434f', acc: 'bow', accC: '#e8434f', mouth: 'open' });
  G('三つ編み委員長', { hair: '#5a3a24', dark: '#3a2414', eye: '#3a8a5a', style: 'braid', bangs: 'straight', wear: 'blazer', outfit: '#2d4a8a', collar: '#e8434f', acc: 'glasses', accC: '#c9a24a', mouth: 'line' });
  G('ギャル', { hair: '#ffcf6b', dark: '#d19a2a', eye: '#c06a2a', style: 'side', bangs: 'swept', wear: 'blazer', outfit: '#fff', collar: '#ff7ab0', acc: 'star', accC: '#ff7ab0', mouth: 'open' });
  G('おっとり', { hair: '#b9e4c9', dark: '#7fbf98', eye: '#3a8a5a', style: 'long', bangs: 'm', wear: 'sailor', outfit: '#fff', collar: '#3a8a5a', acc: 'flower', accC: '#7fbf98', mouth: 'cat' });
  G('スポーツ少女', { hair: '#e8743f', dark: '#b84a1e', eye: '#c0742a', style: 'pony', bangs: 'swept', wear: 'hoodie', outfit: '#fff', collar: '#e8434f', acc: 'headband', accC: '#e8434f', mouth: 'open', ahoge: true });
  G('お嬢さま', { hair: '#f2c14e', dark: '#c8952a', eye: '#7b2cbf', style: 'wavy', bangs: 'swept', wear: 'blazer', outfit: '#7a2f4a', collar: '#ffd23f', acc: 'bow', accC: '#7a2f4a', mouth: 'cat' });
  G('ねむねむ', { hair: '#c7b8ff', dark: '#9580e0', eye: '#7b5cd6', style: 'bob', bangs: 'straight', wear: 'hoodie', outfit: '#e8e2ff', collar: '#9580e0', acc: 'clip', accC: '#ffd23f', mouth: 'cat' });
  M('ごろごろくま', { body: '#b9a8e0', ear0: 'round', eyes: 'sleepy', item: 'nightcap' });
  M('ミントくま', { body: '#9fdcc4', ear0: 'round', eyes: 'dot', item: 'scarf' });
  M('いちごくま', { body: '#ffb3c6', ear0: 'round', eyes: 'sparkle', item: 'ribbon' });
  M('ひよこ', { body: '#ffe066', ear0: 'tuft', eyes: 'dot', beak: '#ff9f43', muzzle: false, color: '#f0c020' });
  M('しろねこ', { body: '#ffffff', inner: '#ffe0e8', ear0: 'cat', eyes: 'sparkle', item: 'bowtie', color: '#c9c2b2' });
  M('くろねこ', { body: '#3a3a48', inner: '#ffb8c8', ear0: 'cat', eyes: 'sparkle', nose: '#ff8fa3', item: 'ribbon' });
  M('みけねこ', { body: '#fff3e0', inner: '#ffd0c0', ear0: 'cat', eyes: 'dot', mask: '#e8a050', item: 'flower', color: '#e8a050' });
  M('うさぎ', { body: '#ffffff', inner: '#ffd0dc', ear0: 'bunny', eyes: 'sparkle', item: 'flower', color: '#ff9ec7' });
  M('たれみみいぬ', { body: '#f2d3a8', ear0: 'droop', ear: '#b8865a', eyes: 'sparkle', item: 'bowtie', color: '#b8865a' });
  M('しばいぬ', { body: '#e8a050', inner: '#fff7ec', ear0: 'cat', eyes: 'dot', item: 'scarf' });
  M('パンダ', { body: '#ffffff', ear0: 'panda', eyes: 'dot', item: 'leaf', color: '#2b2b2b' });
  M('ペンギン', { body: '#2f3e57', inner: '#ffffff', ear0: 'none', eyes: 'sparkle', beak: '#ffb02e', item: 'scarf' });
  M('かえる', { body: '#8ed16f', inner: '#e8ffd8', ear0: 'frog', eyes: 'sparkle', item: 'hat' });
  M('きつね', { body: '#f08a3c', inner: '#fff7ec', ear0: 'fox', eyes: 'sleepy', item: 'tea' });
  M('ハムスター', { body: '#f5c98f', inner: '#fff7ec', ear0: 'round', eyes: 'sparkle', item: 'leaf' });
  X('ひだまりスライム', { shape: 'blob', body: '#7fd6ff', eyes: 'big', mouth: 'smile', extra: 'none' });
  X('ほのおのこ', { shape: 'round', body: '#ff8a4c', c2: '#ffcf3f', eyes: 'big', mouth: 'fang', extra: 'flame', belly: '#ffd9b0' });
  X('しずくん', { shape: 'drop', body: '#5ab8ff', eyes: 'big', mouth: 'o', extra: 'none', eyeY: 62 });
  X('はっぱっぱ', { shape: 'seed', body: '#a6e07a', eyes: 'happy', mouth: 'smile', extra: 'sprout' });
  X('ふわおばけ', { shape: 'ghost', body: '#f0ecff', eyes: 'big', mouth: 'o', extra: 'none', color: '#9580e0' });
  X('くもくも', { shape: 'cloud', body: '#ffffff', eyes: 'happy', mouth: 'smile', extra: 'none', color: '#8fb8ff' });
  X('きらぼし', { shape: 'star', body: '#ffd84d', eyes: 'big', mouth: 'smile', extra: 'none', eyeY: 54, color: '#f0b400' });
  X('ちびドラゴン', { shape: 'egg', body: '#7ed9a6', c2: '#3fae74', eyes: 'big', mouth: 'fang', extra: 'wings', belly: '#e8ffd8' });
  X('ひとつめくん', { shape: 'round', body: '#c08cff', c2: '#8a5bd6', eyes: 'one', mouth: 'smile', extra: 'horns' });
  X('うみうし', { shape: 'blob', body: '#ff9ec7', c2: '#ff5c9a', eyes: 'big', mouth: 'o', extra: 'fins', spots: true });
  X('でんきむし', { shape: 'egg', body: '#9fe0ff', c2: '#2f78c4', eyes: 'big', mouth: 'smile', extra: 'antenna' });
  X('かめっこ', { shape: 'round', body: '#b5e08a', c2: '#6b9a3f', eyes: 'happy', mouth: 'smile', extra: 'shell', eyeY: 60 });
  X('もちうさ', { shape: 'blob', body: '#fff4f8', c2: '#ffb8c8', eyes: 'big', mouth: 'o', extra: 'ears', color: '#ff9ec7' });
  X('こおりん', { shape: 'egg', body: '#d6f2ff', c2: '#7fc8ff', eyes: 'big', mouth: 'smile', extra: 'horns', spots: true, color: '#7fc8ff' });
  X('しっぽりす', { shape: 'seed', body: '#e8a86a', c2: '#b8763a', eyes: 'big', mouth: 'fang', extra: 'tail', belly: '#fff0dc' });

  // もとの6人のあとに足す。charSVG は追加のキャラなら新しい絵、そうでなければもとの絵
  for (const c of LIST) window.CHARACTERS.push({ id: c.id, name: c.name, color: c.color, cat: c.cat });
  const base = window.charSVG;
  window.charSVG = function (id, expr = 'normal') {
    const c = LIST.find(x => x.id === id);
    return c ? c.draw(expr) : base(id, expr);
  };
  window.CHAR_CATS = [['O', 'はじめの6人'], ['A', '女の子'], ['B', 'どうぶつ'], ['C', 'モンスター']];
})();

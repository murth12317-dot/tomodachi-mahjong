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
  window.CHARACTERS = CHARS.map(c => ({ id: c.id, name: c.name, color: c.collar }));
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

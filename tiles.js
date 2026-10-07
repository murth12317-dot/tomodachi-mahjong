// 牌の絵柄（SVG）。筒子は丸、索子は竹、萬子は漢数字＋萬、字牌は漢字
'use strict';
(function () {
  const COL = { b: '#1d4f9e', g: '#1c7a3c', r: '#c4232b', k: '#1b1b1b' };
  // 特殊な5の色（赤は伝統どおり真っ赤、金・青・虹は各色）
  const VARIANT = {
    red: { b: '#c4232b', g: '#c4232b', r: '#c4232b', k: '#c4232b' },
    gold: { b: '#a87700', g: '#a87700', r: '#a87700', k: '#a87700' },
    blue: { b: '#1a9be0', g: '#1a9be0', r: '#1a9be0', k: '#1a9be0' }, // 水色（4筒の紺と見分けやすく）
    rainbow: 'rainbow',
  };
  const RAINBOW = ['#d62828', '#f77f00', '#e0b000', '#2a9d3f', '#1d6fd1', '#7b2cbf'];
  const KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const cache = new Map();

  function colorFn(variant) {
    let i = 0;
    if (variant === 'rainbow') return () => RAINBOW[i++ % RAINBOW.length];
    const v = VARIANT[variant];
    return (c) => (v ? v[c] : COL[c]);
  }

  function pin(x, y, r, c) {
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>` +
      `<circle cx="${x}" cy="${y}" r="${(r * 0.7).toFixed(2)}" fill="#fff"/>` +
      `<circle cx="${x}" cy="${y}" r="${(r * 0.5).toFixed(2)}" fill="none" stroke="${c}" stroke-width="${(r * 0.14).toFixed(2)}"/>` +
      `<circle cx="${x}" cy="${y}" r="${(r * 0.2).toFixed(2)}" fill="${c}"/>`;
  }
  const PIN = {
    1: [[22, 30, 16, 'g']],
    2: [[22, 16, 10, 'g'], [22, 44, 10, 'b']],
    3: [[11, 12, 8.3, 'b'], [22, 30, 8.3, 'r'], [33, 48, 8.3, 'g']],
    4: [[13, 16, 8.5, 'b'], [31, 16, 8.5, 'g'], [13, 44, 8.5, 'g'], [31, 44, 8.5, 'b']],
    5: [[11, 12, 7.5, 'b'], [33, 12, 7.5, 'g'], [22, 30, 7.5, 'r'], [11, 48, 7.5, 'g'], [33, 48, 7.5, 'b']],
    6: [[14, 10, 7, 'g'], [30, 10, 7, 'g'], [14, 33, 7, 'r'], [30, 33, 7, 'r'], [14, 50, 7, 'r'], [30, 50, 7, 'r']],
    7: [[9, 8, 6.2, 'g'], [22, 14, 6.2, 'g'], [35, 20, 6.2, 'g'], [14, 36, 6.4, 'r'], [30, 36, 6.4, 'r'], [14, 51, 6.4, 'r'], [30, 51, 6.4, 'r']],
    8: [[14, 9, 6.4, 'b'], [30, 9, 6.4, 'b'], [14, 23, 6.4, 'b'], [30, 23, 6.4, 'b'], [14, 37, 6.4, 'b'], [30, 37, 6.4, 'b'], [14, 51, 6.4, 'b'], [30, 51, 6.4, 'b']],
    9: [[10, 12, 6.2, 'b'], [22, 12, 6.2, 'b'], [34, 12, 6.2, 'b'], [10, 30, 6.2, 'r'], [22, 30, 6.2, 'r'], [34, 30, 6.2, 'r'], [10, 48, 6.2, 'g'], [22, 48, 6.2, 'g'], [34, 48, 6.2, 'g']],
  };

  function stick(x, y, h, c, rot) {
    const w = 6.6, t = rot ? ` transform="rotate(${rot} ${x} ${y})"` : '';
    return `<g${t}><rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="2.4" fill="${c}"/>` +
      `<rect x="${x - w / 2 + 1.3}" y="${y - h / 2 + 1.6}" width="1.4" height="${h - 3.2}" rx=".5" fill="#fff" opacity=".55"/>` +
      `<rect x="${x - w / 2 - 0.4}" y="${y - 0.8}" width="${w + 0.8}" height="1.6" rx=".8" fill="${c}"/>` +
      `<rect x="${x - w / 2 - 0.4}" y="${y - h / 2 - 0.2}" width="${w + 0.8}" height="1.5" rx=".7" fill="${c}"/>` +
      `<rect x="${x - w / 2 - 0.4}" y="${y + h / 2 - 1.3}" width="${w + 0.8}" height="1.5" rx=".7" fill="${c}"/></g>`;
  }
  const SOU = {
    2: [[22, 16, 18, 'g'], [22, 44, 18, 'g']],
    3: [[22, 16, 18, 'g'], [13, 44, 18, 'g'], [31, 44, 18, 'g']],
    4: [[13, 16, 18, 'g'], [31, 16, 18, 'g'], [13, 44, 18, 'g'], [31, 44, 18, 'g']],
    5: [[11, 16, 18, 'g'], [33, 16, 18, 'g'], [22, 30, 18, 'r'], [11, 44, 18, 'g'], [33, 44, 18, 'g']],
    6: [[10, 16, 18, 'g'], [22, 16, 18, 'g'], [34, 16, 18, 'g'], [10, 44, 18, 'g'], [22, 44, 18, 'g'], [34, 44, 18, 'g']],
    7: [[22, 9, 13, 'r'], [10, 30, 13, 'g'], [22, 30, 13, 'g'], [34, 30, 13, 'g'], [10, 49, 13, 'g'], [22, 49, 13, 'g'], [34, 49, 13, 'g']],
    8: [[9, 16, 18, 'g', 18], [17, 16, 18, 'g', -18], [27, 16, 18, 'g', 18], [35, 16, 18, 'g', -18],
      [9, 44, 18, 'g', -18], [17, 44, 18, 'g', 18], [27, 44, 18, 'g', -18], [35, 44, 18, 'g', 18]],
    9: [[10, 11, 14, 'g'], [22, 11, 14, 'r'], [34, 11, 14, 'g'], [10, 30, 14, 'g'], [22, 30, 14, 'r'], [34, 30, 14, 'g'], [10, 49, 14, 'g'], [22, 49, 14, 'r'], [34, 49, 14, 'g']],
  };
  function bird(C) {
    // 一索（鳥）
    return `<path d="M13 48 Q4 40 10 30 Q14 22 22 24 Q30 26 29 36 Q28 46 18 49 Z" fill="${C('g')}"/>` +
      `<path d="M13 48 L6 56 L14 52 L12 58 L19 50 Z" fill="${C('r')}"/>` +
      `<path d="M15 40 Q20 34 26 36" stroke="${C('b')}" stroke-width="2" fill="none"/>` +
      `<circle cx="27" cy="18" r="6" fill="${C('g')}"/>` +
      `<path d="M32 17 L39 19 L32 21 Z" fill="${C('r')}"/>` +
      `<circle cx="28.5" cy="16.5" r="1.6" fill="#fff"/><circle cx="28.8" cy="16.6" r=".8" fill="#111"/>` +
      `<path d="M24 12 Q26 5 31 8" stroke="${C('r')}" stroke-width="2" fill="none"/>`;
  }
  function text(t, y, size, fill, weight) {
    return `<text x="22" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${size}" font-weight="${weight || 700}" fill="${fill}" font-family="'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP','Noto Serif CJK JP',serif">${t}</text>`;
  }

  window.tileSVG = function (kind, variant) {
    const key = kind + ':' + (variant || '');
    if (cache.has(key)) return cache.get(key);
    const C = colorFn(variant);
    let body = '';
    if (kind < 9) { // 萬子
      if (variant === 'rainbow') {
        // 虹の萬子：文字そのものを虹色のグラデーションにする（赤5萬と見分けやすく）
        body = `<defs><linearGradient id="rbw" x1="0" y1="0" x2="0" y2="1">` +
          RAINBOW.map((c, i) => `<stop offset="${(i / (RAINBOW.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('') +
          `</linearGradient></defs>` + text(KANJI[kind], 18, 22, 'url(#rbw)', 900) + text('萬', 43, 23, 'url(#rbw)', 900);
      } else {
        const numColor = variant ? C('k') : COL.k;
        body = text(KANJI[kind], 18, 22, numColor, 800) + text('萬', 43, 23, variant ? C('r') : COL.r, 800);
      }
    } else if (kind < 18) {
      const n = kind - 8;
      body = PIN[n].map(([x, y, r, c]) => pin(x, y, r, n === 1 ? (variant ? C(c) : COL.r) : C(c))).join('');
      if (n === 1) body = pin(22, 30, 17, variant ? C('g') : COL.g) + `<circle cx="22" cy="30" r="5" fill="${variant ? C('r') : COL.r}"/>`;
    } else if (kind < 27) {
      const n = kind - 17;
      body = n === 1 ? bird(C) : SOU[n].map(([x, y, hh, c, rot]) => stick(x, y, hh, C(c), rot)).join('');
    } else if (kind === 31) {
      body = `<rect x="9" y="11" width="26" height="38" rx="3" fill="none" stroke="#2f6fd6" stroke-width="2.4"/>` +
        `<rect x="12.5" y="14.5" width="19" height="31" rx="2" fill="none" stroke="#2f6fd6" stroke-width="1"/>`;
      if (variant === 'pocchi') {
        // 倍ぽっち：白の中に小さな丸いガラスを埋め込む（くぼみの中にはまっている感じ）
        body += `<defs>` +
          `<linearGradient id="sock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a8475"/><stop offset=".5" stop-color="#cfc8b4"/><stop offset="1" stop-color="#fffdf5"/></linearGradient>` +
          `<radialGradient id="gls" cx=".42" cy=".62" r=".7"><stop offset="0" stop-color="#e8f7ff"/><stop offset=".45" stop-color="#8fd0ff"/><stop offset="1" stop-color="#2f78c4"/></radialGradient>` +
          `<radialGradient id="glsIn" cx=".5" cy=".2" r=".7"><stop offset="0" stop-color="#062a4d" stop-opacity=".55"/><stop offset=".6" stop-color="#062a4d" stop-opacity="0"/></radialGradient>` +
          `</defs>` +
          `<circle cx="22" cy="30" r="6.4" fill="url(#sock)"/>` +
          `<circle cx="22" cy="30" r="5.3" fill="url(#gls)"/>` +
          `<circle cx="22" cy="30" r="5.3" fill="url(#glsIn)"/>` +
          `<ellipse cx="20.3" cy="31.4" rx="1.6" ry=".9" transform="rotate(-25 20.3 31.4)" fill="#fff" opacity=".85"/>` +
          `<path d="M18.2 32.8 A4.3 4.3 0 0 0 25.8 32.8" fill="none" stroke="#fff" stroke-width=".5" opacity=".6"/>`;
      }
    } else {
      const ch = '東南西北 發中'[kind - 27];
      const fill = kind === 32 ? COL.g : kind === 33 ? COL.r : COL.k;
      if ((kind === 32 || kind === 33) && variant === 'pocchi') {
        // 發ぽっち・中ぽっち：金色の文字（ゴールド發・ゴールド中）
        body = `<defs><linearGradient id="gldH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1a8"/><stop offset=".45" stop-color="#e2b400"/><stop offset=".55" stop-color="#b98a00"/><stop offset="1" stop-color="#8a6400"/></linearGradient></defs>` +
          text(ch, 31, 30, 'url(#gldH)', 900).replace('<text ', '<text stroke="#6b4a00" stroke-width=".6" ');
      } else body = text(ch, 31, 30, fill, 900);
    }
    // 左上に「赤・金・青・虹」の小さな札
    // ぽっちは星などのしるしなし（光る枠と背景の色で見分ける）
    // 特殊な5は枠と背景の色で見分ける（左上の「赤・金・青・虹」の文字はなし）
    const svg = `<svg viewBox="0 0 44 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
    cache.set(key, svg);
    return svg;
  };
})();

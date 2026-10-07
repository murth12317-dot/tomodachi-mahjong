// 大きな和了のエフェクト（祝儀30枚以上・50枚以上・100枚以上で段階的に派手に）
'use strict';
window.FX = (function () {
  let layer = null, raf = 0;

  function ensure() {
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'fx';
    layer.innerHTML = '<canvas></canvas><div class="fx-flash"></div><div class="fx-char"></div><div class="fx-text"></div>';
    document.body.append(layer);
    return layer;
  }

  // ギザギザの稲妻を1本描く（枝分かれあり）
  function bolt(ctx, x, y, x2, y2, w, depth) {
    const pts = [[x, y]];
    const segs = 14;
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const off = (Math.random() - 0.5) * 90 * (1 - t * 0.3);
      pts.push([x + (x2 - x) * t + off, y + (y2 - y) * t]);
    }
    pts.push([x2, y2]);
    for (const [lw, col, blur] of [[w * 5, 'rgba(120,160,255,.35)', 30], [w * 2.2, 'rgba(190,210,255,.8)', 14], [w, '#fff', 0]]) {
      ctx.save();
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.shadowColor = '#9bb8ff'; ctx.shadowBlur = blur;
      ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke();
      ctx.restore();
    }
    if (depth > 0) {
      for (let b = 0; b < 2; b++) {
        const [bx, by] = pts[3 + Math.floor(Math.random() * 8)];
        bolt(ctx, bx, by, bx + (Math.random() - 0.5) * 300, by + 120 + Math.random() * 200, w * 0.5, depth - 1);
      }
    }
  }

  // ch：和了した人のキャラ { html, color, word }（稲妻と紙吹雪の中に笑顔で出す）
  function run(tier, chips, name, ch) {
    const L = ensure();
    cancelAnimationFrame(raf);
    L.className = 'on tier' + tier;
    const cv = L.querySelector('canvas');
    const ctx = cv.getContext('2d');
    const W = cv.width = innerWidth, H = cv.height = innerHeight;
    const text = L.querySelector('.fx-text');
    text.innerHTML = `<div class="fx-sub">${name ? name + ' ' : ''}${ch && ch.word ? ch.word + '！ ' : ''}${tier === 3 ? '超' : tier === 2 ? '特大' : '大'}和了</div><div class="fx-big">祝儀 ${chips}枚</div>`;
    const cbox = L.querySelector('.fx-char');
    cbox.innerHTML = ch && ch.html ? ch.html : '';
    cbox.style.display = ch && ch.html ? '' : 'none';
    if (ch && ch.color) cbox.style.setProperty('--c', ch.color);
    document.body.classList.remove('fx-shake1', 'fx-shake2', 'fx-shake3');
    void document.body.offsetWidth;
    document.body.classList.add('fx-shake' + tier);

    // 紙吹雪（金色の粒）
    const n = tier === 1 ? 90 : tier === 2 ? 160 : 260;
    const parts = [...Array(n)].map(() => ({
      x: W / 2, y: H * 0.42, vx: (Math.random() - 0.5) * (tier * 9 + 6), vy: -Math.random() * (tier * 7 + 8) - 2,
      s: 3 + Math.random() * 5, c: ['#ffd65a', '#fff3b0', '#ff9b5a', '#9fe0ff', '#ff7ad9'][Math.floor(Math.random() * 5)], r: Math.random() * 6,
    }));
    // 稲妻の予定（2段目から）
    const strikes = tier === 1 ? [] : tier === 2 ? [150, 700] : [100, 450, 800, 1150, 1500, 1900];
    const dur = tier === 1 ? 2200 : tier === 2 ? 3200 : 4600;
    const t0 = performance.now();
    let nextStrike = 0, lastStrike = -9999;
    const flash = L.querySelector('.fx-flash');

    function frame(now) {
      const t = now - t0;
      ctx.clearRect(0, 0, W, H);
      // 3段目：暗い空
      if (tier === 3) { ctx.fillStyle = `rgba(10,12,40,${Math.min(0.55, t / 800)})`; ctx.fillRect(0, 0, W, H); }
      if (nextStrike < strikes.length && t >= strikes[nextStrike]) {
        lastStrike = t; nextStrike++;
        flash.style.opacity = tier === 3 ? '0.9' : '0.7';
        setTimeout(() => { flash.style.opacity = '0'; }, 90);
        if (window.SFX) SFX.play('thunder');
      }
      if (t - lastStrike < 260) {
        ctx.globalAlpha = 1 - (t - lastStrike) / 260;
        const count = tier === 3 ? 3 : 1;
        for (let i = 0; i < count; i++) {
          const x = W * (0.2 + Math.random() * 0.6);
          bolt(ctx, x, -10, x + (Math.random() - 0.5) * 200, H * (0.55 + Math.random() * 0.4), tier === 3 ? 4 : 3, 2);
        }
        ctx.globalAlpha = 1;
      }
      for (const p of parts) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += 0.2;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      }
      if (t < dur) raf = requestAnimationFrame(frame);
      else { L.className = ''; ctx.clearRect(0, 0, W, H); document.body.classList.remove('fx-shake' + tier); }
    }
    raf = requestAnimationFrame(frame);
    if (window.SFX) SFX.play(tier === 3 ? 'bigwin3' : tier === 2 ? 'bigwin2' : 'bigwin1');
  }

  // 結果から段階を決める（和了者が受け取る祝儀の枚数で判定）
  // 祝儀がいちばん多い和了と、その段階（0は演出なし）
  function tierFor(result) {
    if (!result || result.type !== 'agari' || !result.wins || !result.wins.length) return { tier: 0 };
    let best = null;
    for (const w of result.wins) if (!best || w.chips > best.chips) best = w;
    const c = best.chips || 0;
    return { tier: c >= 100 ? 3 : c >= 50 ? 2 : c >= 30 ? 1 : 0, best, chips: c };
  }
  function forResult(result, names, charOf) {
    const { tier, best, chips } = tierFor(result);
    if (!tier) return false;
    const ch = charOf ? charOf(best.seat) : null;
    if (ch) ch.word = best.tsumo ? 'ツモ' : 'ロン';
    run(tier, chips, names ? names[best.seat] : '', ch);
    return true;
  }
  return { run, forResult, tierFor };
})();

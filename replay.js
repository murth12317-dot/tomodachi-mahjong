// 牌譜の再生（対局後に1手ずつ見返す）
'use strict';
(function () {
  let RP = null; // { hands, hi, si, timer, names }
  const WINDS = ['東', '南', '西', '北'];

  async function open(no, names, data) {
    const j = data ? { replay: data } : await api('replay', { no });
    if (!j || !j.replay || !j.replay.length) return;
    RP = { hands: j.replay, hi: 0, si: 0, timer: null, names, no };
    let box = document.getElementById('replay');
    if (!box) { box = h('div', ''); box.id = 'replay'; document.body.append(box); }
    box.classList.remove('hidden');
    render();
  }
  function close() {
    stop();
    const box = document.getElementById('replay'); if (box) box.classList.add('hidden');
    RP = null;
  }
  function stop() { if (RP && RP.timer) { clearInterval(RP.timer); RP.timer = null; } }
  function go(si) {
    const steps = RP.hands[RP.hi].steps;
    RP.si = Math.max(0, Math.min(steps.length - 1, si));
    render();
  }
  function goHand(hi) { stop(); RP.hi = Math.max(0, Math.min(RP.hands.length - 1, hi)); RP.si = 0; render(); }

  function discardRow(ds) {
    const box = h('div', 'rp-pond');
    ds.forEach(([t, f]) => {
      const cls = (f & 1 ? 'side ' : '') + (f & 2 ? 'dim ' : '') + (f & 4 ? 'called ' : '');
      box.append(tileEl(t, cls));
    });
    return box;
  }

  function render() {
    const box = document.getElementById('replay');
    if (!box || !RP) return;
    box.innerHTML = '';
    const hand = RP.hands[RP.hi];
    const st = hand.steps[RP.si];
    const panel = h('div', 'rp-panel');
    // 見出し
    const top = h('div', 'rp-top');
    const sel = h('select', 'rp-sel');
    RP.hands.forEach((x, i) => { const o = h('option', '', `${i + 1}. ${x.title}`); o.value = i; if (i === RP.hi) o.selected = true; sel.append(o); });
    sel.onchange = () => goHand(+sel.value);
    const cl = h('button', 'small ghost', '閉じる'); cl.onclick = close;
    top.append(h('b', '', `第${RP.no}回 牌譜`), sel, cl);
    panel.append(top);
    // 局の情報
    const info = h('div', 'rp-info');
    info.append(h('span', 'rp-ev', st.ev));
    const dora = h('span', 'rp-dora'); dora.append(document.createTextNode('ドラ表示 '));
    st.dora.forEach(t => dora.append(tileEl(t)));
    info.append(dora, h('span', 'sub', `残り${st.wall}`));
    panel.append(info);
    // 4人（席順）
    for (let s = 0; s < 4; s++) {
      const row = h('div', 'rp-player' + (st.turn === s && !st.res ? ' turn' : ''));
      const head = h('div', 'rp-head');
      const nm = RP.names ? RP.names[s] : 'P' + (s + 1);
      head.append(h('b', '', nm), h('span', 'num', st.sc[s].toLocaleString() + '点'), h('span', 'num sub', `祝儀${st.ch[s] > 0 ? '+' : ''}${st.ch[s]}`));
      if (st.r[s]) head.append(h('span', 'tag', st.r[s] === 2 ? 'オープン' : 'リーチ'));
      row.append(head);
      const hd = h('div', 'rp-hand');
      st.h[s].forEach(t => hd.append(tileEl(t)));
      if (st.turn === s && st.dr != null) hd.append(tileEl(st.dr, 'drawn'));
      st.m[s].forEach(m => hd.append(meldEl({ type: m.t, tiles: m.tiles, called: m.c, from: m.f, added: m.t === 'kakan' ? m.tiles[3] : undefined })));
      row.append(hd, discardRow(st.d[s]));
      panel.append(row);
    }
    // 結果
    if (st.res) {
      const r = h('div', 'rp-res');
      if (st.res.type === 'agari') {
        st.res.wins.forEach(w => {
          const nm = RP.names ? RP.names[w.seat] : 'P' + (w.seat + 1);
          r.append(h('div', 'rp-win', `${nm} ${w.tsumo ? 'ツモ' : 'ロン'}　${w.points}　祝儀${w.tsumo ? w.chips * 3 + '枚（' + w.chips + '枚オール）' : w.chips + '枚'}`));
          if (w.desc) r.append(h('div', 'sub', w.desc));
          r.append(h('div', 'sub', w.yaku.map(y => `${y[0]}${y[1] ? ' ' + y[1] + '翻' : ''}`).join('・')));
          // 祝儀の元になった特殊牌など（例：虹5筒(変換)・中ぽっち・裏ドラ）と内訳
          if (w.units && w.units.length) r.append(h('div', 'sub', '祝儀牌：' + w.units.join('・')));
          const cd = w.chipsDetail || {}; const parts = [];
          if (cd.special) parts.push(`特殊牌${cd.special}`); if (cd.separate) parts.push(`役・打点${cd.separate}`); if (cd.oneHan) parts.push(`1翻${cd.oneHan}`);
          if (parts.length >= 2) r.append(h('div', 'sub', '内訳：' + parts.join('＋')));
        });
      } else {
        r.append(h('div', 'rp-win', st.res.reason || '流局'));
      }
      panel.append(r);
    }
    // 操作
    const ctl = h('div', 'rp-ctl');
    const b = (label, fn) => { const x = h('button', 'small', label); x.onclick = () => { stop(); fn(); }; ctl.append(x); return x; };
    b('◀◀局', () => goHand(RP.hi - 1));
    b('◀', () => go(RP.si - 1));
    const play = h('button', 'small primary', RP.timer ? '停止' : '再生');
    play.onclick = () => {
      if (RP.timer) { stop(); render(); return; }
      RP.timer = setInterval(() => {
        const n = RP.hands[RP.hi].steps.length;
        if (RP.si < n - 1) go(RP.si + 1);
        else if (RP.hi < RP.hands.length - 1) { RP.hi++; RP.si = 0; render(); }
        else { stop(); render(); }
      }, 700);
      render();
    };
    ctl.append(play);
    b('▶', () => go(RP.si + 1));
    b('局▶▶', () => goHand(RP.hi + 1));
    panel.append(ctl);
    const sl = h('input', 'rp-slider'); sl.type = 'range'; sl.min = 0; sl.max = hand.steps.length - 1; sl.value = RP.si;
    sl.oninput = () => { stop(); go(+sl.value); };
    panel.append(sl, h('div', 'sub rp-pos', `${RP.si + 1} / ${hand.steps.length} 手`));
    box.append(panel);
    if (window.fitNoScroll) setTimeout(window.fitNoScroll, 0);
  }
  window.openReplay = open;

  // 成績と牌譜をファイルに保存する
  async function save() {
    const hist = (ROOM && ROOM.history) || [];
    if (!hist.length) return;
    const games = [];
    for (const g of hist) {
      const j = await api('replay', { no: g.no });
      games.push({ no: g.no, at: g.at, names: g.names, rows: g.rows, replay: (j && j.replay) || [] });
    }
    const data = { app: 'tomodachi-mahjong', version: 1, room: ROOM.code, savedAt: Date.now(), games };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const filename = `mahjong-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
    // claude.ai の中で開いているときは、保存の確認を出してから保存する
    const dl = window.claude && window.claude.use ? await window.claude.use('downloads').catch(() => null) : null;
    if (dl) {
      try { await dl.save({ filename, data: blob }); toast('保存しました'); }
      catch (e) { if (e && e.code !== 'declined') toast('保存できませんでした'); }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  window.saveRecords = save;

  // 保存したファイルを開いて見る
  function openFile(file) {
    const rd = new FileReader();
    rd.onload = () => {
      let data;
      try { data = JSON.parse(rd.result); } catch (e) { toast('ファイルを読めませんでした'); return; }
      if (!data || data.app !== 'tomodachi-mahjong' || !Array.isArray(data.games) || !data.games.length) { toast('友達麻雀の記録ファイルではありません'); return; }
      showSaved(data);
    };
    rd.readAsText(file);
  }
  function showSaved(data) {
    let box = document.getElementById('replay');
    if (!box) { box = h('div', ''); box.id = 'replay'; document.body.append(box); }
    box.classList.remove('hidden');
    box.innerHTML = '';
    const panel = h('div', 'rp-panel');
    const top = h('div', 'rp-top');
    const cl = h('button', 'small ghost', '閉じる'); cl.onclick = close;
    top.append(h('b', '', `保存した記録（${data.games.length}回）`), cl);
    panel.append(top);
    const hb = h('div', '');
    const keep = ROOM;
    ROOM = Object.assign({}, ROOM || {}, { history: data.games.map(g => ({ no: g.no, at: g.at, rows: g.rows, names: g.names })) });
    renderHistory(hb);
    ROOM = keep;
    // 「牌譜を見る」はファイルの中身を使う
    hb.querySelectorAll('.histNo button').forEach((b, i) => {
      const g = data.games.slice().reverse()[i];
      b.onclick = () => open(g.no, g.names, g.replay);
    });
    const det = hb.querySelector('details'); if (det) det.open = true;
    panel.append(hb);
    box.append(panel);
  }
  window.openRecordFile = openFile;
})();

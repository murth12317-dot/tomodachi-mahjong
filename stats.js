// 成績表：終わった半荘をこの端末に記録して、週ごと・全期間の集計を出す（Excel用のCSVにも保存できる）
(function () {
  'use strict';
  const KEY = 'tomodachi-seiseki-v1';
  const DEFAULT_RATE = 100; // 祝儀1枚あたりの金額（半荘ごとに変えられる）
  const $ = (s) => document.querySelector(s);
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ---- 記録の読み書き（読めない・書けないときは空として扱う） ----
  function load() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* 保存できない環境は無視 */ }
  }

  // 部屋の成績（ROOM.history）に新しい半荘があれば記録に足す。同じ半荘は二重に入れない
  function recordFromRoom(room) {
    if (!room || !room.history || !room.history.length) return;
    const list = load();
    const have = new Set(list.map(g => g.id));
    let added = false;
    for (const g of room.history) {
      const id = `${room.code}-${g.at}`;
      if (have.has(id)) continue;
      list.push({
        id, at: g.at, room: room.code, rate: DEFAULT_RATE,
        rows: g.rows.map(r => ({ name: r.name, rank: r.rank, score: r.score, chips: r.chips, isBot: !!r.isBot })),
      });
      have.add(id); added = true;
    }
    if (added) save(list);
  }

  // ---- 週（日曜はじまり） ----
  const pad = (n) => String(n).padStart(2, '0');
  function weekStart(at) {
    const d = new Date(at); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay());
    return d.getTime();
  }
  function weekLabel(ws) {
    const a = new Date(ws), b = new Date(ws); b.setDate(b.getDate() + 6);
    return `${a.getFullYear()}/${a.getMonth() + 1}/${a.getDate()}〜${b.getMonth() + 1}/${b.getDate()}`;
  }
  const fmtAt = (at) => { const d = new Date(at); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const sign = (n) => (n > 0 ? '+' : '') + n.toLocaleString('ja-JP');
  const cls = (n) => (n > 0 ? 'plus' : n < 0 ? 'minus' : '');

  // 名前ごとの合計（集計＝祝儀×倍率の合計）
  function summarize(games) {
    const m = new Map();
    for (const g of games) for (const r of g.rows) {
      const s = m.get(r.name) || { name: r.name, games: 0, ranks: [0, 0, 0, 0], chips: 0, money: 0 };
      s.games++; s.ranks[r.rank - 1]++; s.chips += r.chips; s.money += r.chips * g.rate;
      m.set(r.name, s);
    }
    return [...m.values()].sort((a, b) => b.money - a.money || b.chips - a.chips);
  }

  // ---- 画面 ----
  let period = 'all';

  function render() {
    const all = load().sort((a, b) => b.at - a.at);
    const box = $('#statsBody'); box.innerHTML = '';

    const head = h('div', 'stHead');
    head.append(h('h2', 'stTitle', '成績表'), h('p', 'sub stSub', `全${all.length}半荘・週は日曜はじまり`));
    box.append(head);

    // 期間の選択と保存
    const weeks = [...new Set(all.map(g => weekStart(g.at)))].sort((a, b) => b - a);
    if (period !== 'all' && !weeks.includes(+period)) period = 'all';
    const ctl = h('div', 'stCtl');
    const sel = h('select', 'stSel');
    const opt = (v, t) => { const o = h('option', '', t); o.value = v; return o; };
    sel.append(opt('all', `全期間（${all.length}半荘）`));
    for (const w of weeks) sel.append(opt(String(w), `${weekLabel(w)}（${all.filter(g => weekStart(g.at) === w).length}半荘）`));
    sel.value = String(period);
    sel.onchange = () => { period = sel.value; render(); };
    const xl = h('button', 'primary stXl', 'Excel保存');
    ctl.append(sel, xl);
    box.append(ctl);

    const games = period === 'all' ? all : all.filter(g => weekStart(g.at) === +period);
    const label = period === 'all' ? '全期間' : weekLabel(+period);
    xl.onclick = () => exportCsv(games, label);
    xl.disabled = !games.length;

    if (!games.length) {
      box.append(h('p', 'sub stEmpty', 'まだ記録がありません。対局が終わると、この端末に自動で記録されます。'));
      return;
    }

    // 上：名前と集計だけ
    const sum = h('div', 'stCard');
    sum.append(h('h3', '', `${label} の集計（${games.length}半荘）`));
    const t = h('table', 'stTable');
    const hr = h('tr'); hr.append(h('th', '', '名前'), h('th', 'num', '集計')); t.append(hr);
    for (const s of summarize(games)) {
      const tr = h('tr');
      tr.append(h('td', 'stName', s.name), h('td', 'num stMoney ' + cls(s.money), sign(s.money)));
      t.append(tr);
    }
    sum.append(t);
    box.append(sum);

    // 下：半荘ごとの記録
    const rec = h('div', 'stCard');
    rec.append(h('h3', '', '半荘ごとの記録'));
    for (const g of games) {
      const gb = h('div', 'stGame');
      const meta = h('div', 'stMeta');
      meta.append(h('span', '', `${fmtAt(g.at)}　${g.room === 'CPU' ? '一人打ち' : 'ルーム ' + g.room}`));
      const rb = h('button', 'small ghost stRate', `倍率 ${g.rate}`);
      rb.title = '倍率を変える';
      rb.onclick = () => changeRate(g.id, g.rate);
      meta.append(rb);
      gb.append(meta);
      const gt = h('table', 'stTable stRows');
      for (const r of g.rows.slice().sort((a, b) => a.rank - b.rank)) {
        const tr = h('tr');
        tr.append(h('td', 'stRank', `${r.rank}着`), h('td', 'stName', r.name),
          h('td', 'num ' + cls(r.chips), `${sign(r.chips)}枚`), h('td', 'num ' + cls(r.chips), sign(r.chips * g.rate)));
        gt.append(tr);
      }
      gb.append(gt);
      rec.append(gb);
    }
    box.append(rec);
  }

  function changeRate(id, cur) {
    const v = prompt('この半荘の倍率（祝儀1枚あたりの金額）', String(cur));
    if (v == null) return;
    const n = Math.round(Number(v.replace(/[^\d.]/g, '')));
    if (!(n >= 0)) { alert('数字で入れてください'); return; }
    const list = load(); const g = list.find(x => x.id === id);
    if (g) { g.rate = n; save(list); render(); }
  }

  // Excelで開けるCSV（文字化けしないようBOM付き）
  function exportCsv(games, label) {
    const q = (v) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [];
    lines.push([`${label} の集計（${games.length}半荘）`].map(q).join(','));
    lines.push(['名前', '半荘', '1着', '2着', '3着', '4着', '祝儀計', '集計'].map(q).join(','));
    for (const s of summarize(games)) lines.push([s.name, s.games, ...s.ranks, s.chips, s.money].map(q).join(','));
    lines.push('');
    lines.push(['日時', 'ルーム', '倍率', '着順', '名前', '点数', '祝儀', '金額'].map(q).join(','));
    for (const g of games.slice().sort((a, b) => a.at - b.at)) {
      for (const r of g.rows.slice().sort((a, b) => a.rank - b.rank)) {
        lines.push([fmtAt(g.at), g.room === 'CPU' ? '一人打ち' : g.room, g.rate, r.rank, r.name, r.score, r.chips, r.chips * g.rate].map(q).join(','));
      }
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' });
    const d = new Date();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `seiseki_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.csv`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // 成績表は一番上に重ねて出すだけ（下の画面は対局の進み具合に合わせてそのまま切り替わる）
  function open() {
    $('#stats').classList.remove('hidden');
    render();
    $('#stats').scrollTop = 0;
  }
  function close() {
    $('#stats').classList.add('hidden');
  }

  $('#statsBack').onclick = close;
  window.STATS = { recordFromRoom, open, close };
})();

'use strict';
// ================= 基本 =================
const $ = (s) => document.querySelector(s);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* noop */ } } };

let token = ls.get('mj_token');
// LINEからSafariに移ったときなど、URLで渡された本人の印を引き継ぐ（対局中でもそのまま続きから打てる）
try {
  const q = new URLSearchParams(location.search);
  const t = q.get('t');
  if (t && /^[\w-]{8,64}$/.test(t)) {
    token = t; ls.set('mj_token', t);
    q.delete('t'); q.delete('openExternalBrowser');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
  }
} catch (e) { /* noop */ }
if (!token) { token = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)); ls.set('mj_token', token); }

let ROOM = null;   // 部屋情報
let S = null;      // 対局状態
let prevS = null;
let busy = false;
let riichiMode = false; // false | 'normal' | 'open'
let tickTimer = null;
let subMenu = null; // {type:'chi'|'pon', options}
let autoTimer = null;
let selTile = null;
let lastDrawnAnim = null;
let myMeldCount = null;
let resultSeenAt = null, modalDelay = null;
const uraStart = new Map(); // 和了ごとの演出開始時刻（状態が送り直されても同じ和了なら続きから）
const agariKey = (R) => JSON.stringify([S && S.gid, S && S.round, R.wins.map(w => [w.seat, w.tile, w.points, w.ura])]);
const finalShown = new WeakSet();
// （旧）裏ドラの平面めくりは和了演出の王牌の台に置き換え
 // ツモった牌のアニメーション用 // ダブルタップで切るための選択中の牌

const params = new URLSearchParams(location.search);
$('#name').value = ls.get('mj_name') || '';
if (params.get('room')) $('#code').value = params.get('room');
if (window.SOLO) document.querySelectorAll('.statlink').forEach(a => a.classList.add('hidden'));

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2500);
}

async function api(cmd, data = {}) {
  if (window.SOLO) { const j = await window.SOLO.api(cmd, data); if (j.error) toast(j.error); return j; }
  try {
    const r = await fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, cmd, ...data }) });
    const j = await r.json();
    if (j.error) toast(j.error);
    return j;
  } catch (e) { toast('通信エラー'); return { error: 'network' }; }
}

function show(id) {
  for (const s of ['#lobby', '#room', '#table']) $(s).classList.toggle('hidden', s !== id);
  document.body.classList.toggle('inGame', id === '#table');
  if (id !== '#table') $('#modal').classList.add('hidden');
}

// ================= 接続 =================
function onRoom(data) {
  ROOM = data;
  if (!ROOM.started) { S = null; prevS = null; $('#noCall').checked = false; $('#modal').classList.add('hidden'); renderRoom(); show('#room'); }
  else show('#table');
}
function onState(data) {
  prevS = S; S = data; busy = false;
  // 鳴きなしは次の局に引き継がない
  // （次の半荘に入ったときもずれないよう、サーバーの状態に合わせる）
  if (!prevS || prevS.gid !== S.gid || prevS.round.title !== S.round.title) myMeldCount = null; // 局・半荘が変わったら鳴きの演出の数え直し
  if (typeof S.noCall === 'boolean') $('#noCall').checked = S.noCall;
  else if (prevS && S.round && prevS.round && prevS.round.title !== S.round.title) $('#noCall').checked = false;
  // 選んだ牌は、手牌に残っている限り自分の番が来ても選んだまま（先に選んでおける）
  if (!(S.hand && (S.hand.includes(selTile) || S.drawn === selTile))) selTile = null;
  try { soundFor(prevS, S); } catch (e) { /* 音の失敗は無視 */ }
  if (!S.actions || S.phase !== 'discard') riichiMode = false;
  subMenu = null;
  show('#table');
  renderTable();
}
// 状態の変化から効果音を決める
let sndSnap = null;
function soundFor(a, b) {
  if (!b || !window.SFX) return;
  if (!a) a = { phase: null, actions: null, players: b.players };
  const cnt = (s, f) => s[f].reduce((n, x) => n + x.length, 0);
  const acts = (s) => s.actions || {};
  if (b.phase === 'result' && a.phase !== 'result') {
    const big = window.FX && b.result && FX.forResult(b.result, b.players.map(p => p.name));
    if (!big) { if (b.result && b.result.type === 'agari') SFX.play('win'); else SFX.play('draw'); }
    sndSnap = null;
    return;
  }
  const watching = !!(document.getElementById('watch') && document.getElementById('watch').checked);
  const ba = watching ? {} : acts(b), aa = watching ? {} : acts(a);
  const canCall = (x) => x.ron || x.pon || x.chi || x.minkan;
  if (b.phase === 'claim' && canCall(ba) && !(a.phase === 'claim' && canCall(aa))) SFX.play('alert');
  else if (!watching && b.phase === 'choose' && b.choose && b.choose.seat === b.you && a.phase !== 'choose') SFX.play('alert');
  else if (ba.discard && !aa.discard && !(b.players[b.you] && b.players[b.you].riichi && !ba.tsumo && !ba.ankan)) SFX.play('turn');
  // 一人用では配列が使い回されるので、枚数を自分で覚えておく
  const snap = { d: b.discards.map(x => x.length), m: cnt(b, 'melds') };
  const old = sndSnap; sndSnap = snap;
  if (!old) return;
  if (snap.m > old.m) SFX.play('call');
  for (let i = 0; i < 4; i++) {
    if (snap.d[i] > (old.d[i] || 0)) { const db = b.discards[i]; SFX.play(db[db.length - 1].riichi ? 'riichi' : 'discard'); break; }
  }
}
let es;
function connect() {
  if (window.SOLO) { setTimeout(() => window.SOLO.start({ room: onRoom, state: onState }), 0); return; }
  es = new EventSource('/events?token=' + encodeURIComponent(token));
  es.addEventListener('hello', (e) => {
    const d = JSON.parse(e.data);
    if (!d.code) {
      ROOM = null; S = null;
      show('#lobby');
    }
  });
  es.addEventListener('room', (e) => onRoom(JSON.parse(e.data)));
  es.addEventListener('state', (e) => onState(JSON.parse(e.data)));
  es.addEventListener('kicked', () => { toast('部屋から外されました'); ROOM = null; show('#lobby'); });
  es.onerror = () => { /* 自動で再接続される */ };
}
// スマホでアプリを裏に回して戻ったとき、切れていたらつなぎ直す
document.addEventListener('visibilitychange', () => {
  if (window.SOLO || document.visibilityState !== 'visible') return;
  if (!es || es.readyState === 2) connect();
});
connect();

// ================= ロビー =================
function myName() {
  const n = $('#name').value.trim();
  if (!n) { $('#lobbyMsg').textContent = '名前を入力してください'; $('#name').focus(); return null; }
  ls.set('mj_name', n); $('#lobbyMsg').textContent = ''; return n;
}
$('#btnCreate').onclick = async () => {
  const name = myName(); if (!name) return;
  await api('create', { name });
};
$('#btnJoin').onclick = async () => {
  const name = myName(); if (!name) return;
  const code = $('#code').value.trim();
  if (!/^\d{4}$/.test(code)) { $('#lobbyMsg').textContent = '4桁の部屋番号を入力してください'; return; }
  const r = await api('join', { name, code });
  if (r.error) $('#lobbyMsg').textContent = r.error;
};
$('#code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnJoin').click(); });

// ================= 待合室 =================
function renderRoom() {
  $('#roomCode').textContent = ROOM.code;
  // 席が全部うまっていたら招待リンクは出さない（CPUを外して空席ができたら出る）
  $('#btnCopy').classList.toggle('hidden', ROOM.seats.every(Boolean));
  const st = ROOM.settings;
  $('#roomRule').textContent = '東風戦・25000点持ち・祝儀あり（ルール定義書どおり）';
  const ul = $('#seats'); ul.innerHTML = '';
  ROOM.seats.forEach((s, i) => {
    const li = h('li', s ? '' : 'empty');
    if (!s) { li.textContent = '空席'; ul.append(li); return; }
    const dot = h('span', 'dot' + (s.online ? '' : ' off'));
    li.append(dot, h('span', 'nm', s.name));
    if (i === ROOM.you) li.append(h('span', 'tag', 'あなた'));
    if (s.isBot) li.append(h('span', 'tag', 'CPU'));
    else li.append(h('span', 'tag ' + (s.ready ? 'ok' : 'wait'), s.ready ? '準備OK' : '準備中'));
    if (ROOM.isHost && i !== ROOM.you) {
      const b = h('button', 'small ghost', '外す'); b.onclick = () => api('kick', { seat: i }); li.append(b);
    }
    ul.append(li);
  });
  const hb = $('#roomHistory'); hb.innerHTML = ''; renderHistory(hb);
  renderRate();
  if (ROOM.spectators && ROOM.spectators.length) hb.prepend(h('p', 'sub', `観戦：${ROOM.spectators.join('・')}`));
  $('#hostCtl').classList.toggle('hidden', !ROOM.isHost);
  const mine = ROOM.you >= 0 ? ROOM.seats[ROOM.you] : null;
  $('#guestWait').classList.toggle('hidden', ROOM.isHost || !mine || !mine.ready);
  $('#btnReady').classList.toggle('hidden', ROOM.isHost || !mine);
  if (mine && !ROOM.isHost) {
    $('#btnReady').textContent = mine.ready ? '準備OKを取り消す' : '準備OK';
    $('#btnReady').className = mine.ready ? 'ghost' : 'primary';
  }
  setTimeout(fitNoScroll, 0);
  if (ROOM.isHost) {
    const full = ROOM.seats.every(Boolean);
    const waiting = ROOM.seats.filter(s => s && !s.ready);
    $('#btnBot').disabled = full;
    $('#btnStart').disabled = !full || waiting.length > 0;
    $('#btnStart').textContent = !full ? `対局開始（あと${ROOM.seats.filter(x => !x).length}人）`
      : waiting.length ? `準備OK待ち（${waiting.map(s => s.name).join('・')}）` : '対局開始';
  }
}
// 倍率（成績表に祝儀×倍率で記録）。ルームを作った人だけが入力できる
function renderRate() {
  const box = $('#rateRow');
  // 入力中に画面が書き換わっても、入れかけの数字を残す
  const ri = $('#rate'), typing = ri && document.activeElement === ri ? ri.value : null;
  box.innerHTML = '';
  box.append(h('b', '', '倍率'));
  if (ROOM.isHost) {
    // ↑↓のボタンが出ないよう、ふつうの文字入力にして数字のキーボードを出す
    const inp = h('input'); inp.id = 'rate'; inp.type = 'text'; inp.inputMode = 'decimal'; inp.autocomplete = 'off';
    inp.value = typing != null ? typing : ROOM.rate;
    // 全角の数字やカンマが入っても受け付ける
    inp.onchange = () => api('setRate', { rate: inp.value.replace(/[０-９．]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[,，\s]/g, '') });
    box.append(inp);
    if (typing != null) inp.focus();
  } else box.append(h('span', '', String(ROOM.rate)));
  box.append(h('small', '', '祝儀×倍率を成績表に記録'));
}
$('#btnBot').onclick = () => api('addBot');
$('#recordFile').onchange = (e) => { const f = e.target.files[0]; if (f && window.openRecordFile) window.openRecordFile(f); e.target.value = ''; };
$('#btnStart').onclick = () => api('start');
$('#btnReady').onclick = () => { const me = ROOM && ROOM.seats[ROOM.you]; api('ready', { ready: !(me && me.ready) }); };
$('#btnLeave').onclick = async () => { await api('leave'); ROOM = null; show('#lobby'); };
$('#btnCopy').onclick = async () => {
  // openExternalBrowser=1：LINEで開いたとき、LINEの中ではなくSafariなどのブラウザで開く（画面が広くなる）
  const url = `${location.origin}${location.pathname}?room=${ROOM.code}&openExternalBrowser=1`;
  try { await navigator.clipboard.writeText(url); toast('招待リンクをコピーしました'); }
  catch (e) { prompt('このリンクを友達に送ってください', url); }
};

// ================= 牌の描画 =================
const KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const HONOR = ['東', '南', '西', '北', '', '發', '中'];
const FIVE_KINDS = new Set([4, 13, 22]);
const POCCHI_IDS = new Set([124, 128, 132]);
const kindOf = (id) => Math.floor(id / 4);
const isPocchi = (id) => POCCHI_IDS.has(id) || !!(S && S.pocchiKinds && S.pocchiKinds.includes(kindOf(id)));

const TILE_SUIT = ['萬', '筒', '索'];
function tileLabel(k, variant) {
  const base = k < 27 ? `${(k % 9) + 1}${TILE_SUIT[Math.floor(k / 9)]}` : '東南西北白發中'[k - 27];
  return (variant ? { red: '赤', gold: '金', blue: '青', rainbow: '虹' }[variant] : '') + base;
}
function tileEl(id, extra = '', plain = false) {
  const e = h('div', 'tile ' + extra);
  if (id == null || id < 0) { e.classList.add('back'); return e; }
  const k = kindOf(id);
  // plain：待ち牌の表示など「牌の種類」だけを見せるときは色を付けない
  if (!plain && FIVE_KINDS.has(k)) e.classList.add('c-' + ['red', 'gold', 'blue', 'rainbow'][id % 4]);
  const poc = !plain && k >= 31 && isPocchi(id);
  if (poc) e.classList.add('pocchi', ['p-bai', 'p-hatsu', 'p-chun'][k - 31]);
  const variant = plain ? null : FIVE_KINDS.has(k) ? ['red', 'gold', 'blue', 'rainbow'][id % 4] : poc ? 'pocchi' : null;
  e.innerHTML = window.tileSVG(k, variant);
  e.title = tileLabel(k, variant);
  e.dataset.id = id;
  return e;
}

function meldEl(m) {
  const box = h('div', 'meld');
  if (m.type === 'ankan') {
    m.tiles.forEach((t, i) => box.append(tileEl(i === 0 || i === 3 ? null : t)));
    return box;
  }
  // 鳴いた牌を横向きに（上家=左, 対面=中央, 下家=右）
  const others = m.tiles.filter(t => t !== m.called && t !== m.added);
  const called = tileEl(m.called, 'side');
  const list = others.map(t => tileEl(t));
  const pos = m.from === 3 ? 0 : m.from === 2 ? 1 : list.length;
  list.splice(pos, 0, called);
  if (m.added != null) list.splice(pos + 1, 0, tileEl(m.added, 'side'));
  box.append(...list);
  return box;
}

// ================= 対局画面 =================
const rel = (seat) => (seat - S.you + 4) % 4;
const bySide = (arr) => { const out = []; for (let s = 0; s < 4; s++) out[rel(s)] = s; return out.map(s => arr ? arr[s] : s); };

// 接続が切れた人を待っている表示（残り秒数）
let waitTimer = null;
function renderWait() {
  let el = document.getElementById('waitBanner');
  if (!el) { el = h('div', ''); el.id = 'waitBanner'; document.body.append(el); }
  clearInterval(waitTimer);
  const list = (S && S.waitFor) || [];
  if (!list.length || S.phase === 'result') { el.classList.add('hidden'); return; }
  const until = list.map(w => ({ name: w.name, at: Date.now() + w.left }));
  const draw = () => {
    el.textContent = until.map(w => `${w.name}さんの接続を待っています（残り${Math.max(0, Math.ceil((w.at - Date.now()) / 1000))}秒）`).join('\n');
  };
  draw(); el.classList.remove('hidden');
  waitTimer = setInterval(draw, 500);
}

function renderTable() {
  renderWait();
  setTimeout(landHint, 0);
  renderBoard();
  renderMe();
  flashCalls();
  fitLayout();
  renderModal();
  autoPlay();
}

// アニメーション用：前回描いたときの河・鳴き・リーチの状態（一人用では配列が使い回されるので数を覚える）
let animMem = null;
function renderBoard() {
  const b = $('#board'); b.innerHTML = '';
  const memKey = `${S.gid}|${S.round.title}`;
  const mem = animMem && animMem.key === memKey ? animMem : null;
  const nowMem = { key: memKey, d: S.discards.map(x => x.length), m: S.melds.map(x => x.length), r: S.players.map(p => p.riichi) };
  const c = h('div', 'center');
  c.append(h('div', 'rt', `${S.round.wind}${S.round.kyoku}局`));
  c.append(h('div', 'sticks', `${S.round.honba}本場 供託${S.round.kyotaku}${S.round.kyotakuChips ? `+${S.round.kyotakuChips}枚` : ''}`));
  c.append(h('div', 'sticks', `残り${S.wall}`));
  const dora = h('div', 'dora');
  for (let i = 0; i < 5; i++) { const t = tileEl(i < S.dora.length ? S.dora[i] : null); t.style.setProperty('--w', '17px'); dora.append(t); }
  c.append(dora);
  b.append(c);
  // 横向き：ドラ表示は左上に大きく出す（枠は4つ。5枚目がめくれたら5つ）
  let db = $('#doraBox');
  if (!db) { db = h('div', ''); db.id = 'doraBox'; $('#boardWrap').append(db); }
  db.innerHTML = ''; db.append(h('span', 'dl', 'ドラ'));
  for (let i = 0; i < Math.max(4, S.dora.length); i++) db.append(tileEl(i < S.dora.length ? S.dora[i] : null));

  for (let seat = 0; seat < 4; seat++) {
    const r = rel(seat);
    const p = S.players[seat];
    const side = h('div', 'side'); side.dataset.rel = r;
    // ラベル
    const lbl = h('div', 'lbl' + (S.turn === seat && S.phase !== 'result' ? ' turn' : ''));
    if (p.riichi) lbl.append(h('div', 'rstick' + (mem && !mem.r[seat] ? ' enter' : '')));
    const l1 = h('div'); l1.append(h('span', 'w', p.wind), document.createTextNode(p.name));
    if (p.away) l1.append(h('span', 'off', ' (離席)'));
    lbl.append(l1, h('div', 'sc', p.score.toLocaleString()), h('div', 'chip', `祝儀 ${p.chips > 0 ? '+' : ''}${p.chips}`));
    side.append(lbl);
    if (p.openWaits && p.openWaits.length) {
      // オープンリーチ：待ちの形（例：2-5待ちなら34）と待ち牌を見せる
      const ow = h('div', 'openWaits'); ow.append(h('span', '', `オープンリーチ：${p.name}`));
      const sh = h('div', 'ows'); (p.openShape || []).forEach(t => sh.append(tileEl(t))); ow.append(sh);
      const ww = h('div', 'oww'); ww.append('待ち'); p.openWaits.forEach(k => ww.append(tileEl(k * 4 + 1, '', true))); ow.append(ww);
      side.append(ow);
    }
    // 河
    const pond = h('div', 'pond');
    const ds = S.discards[seat];
    let sideNext = false;
    const visible = [];
    ds.forEach((d, i) => {
      let sideways = false;
      if (d.riichi) { if (d.called) sideNext = true; else sideways = true; }
      else if (sideNext && !d.called) { sideways = true; sideNext = false; }
      if (d.called) return;
      const isLast = S.lastDiscard && S.lastDiscard.seat === seat && i === ds.length - 1 && S.phase === 'claim';
      const isNew = mem && i >= mem.d[seat]; // いま切られた牌は手元からすべり込む
      visible.push(tileEl(d.tile, (sideways ? 'side ' : '') + (d.tsumogiri ? 'dim ' : '') + (isLast ? 'last ' : '') + (isNew ? 'enter' : '')));
    });
    for (let row = 0; row < 4 && visible.length; row++) {
      const pr = h('div', 'prow');
      pr.append(...(row < 3 ? visible.splice(0, 6) : visible.splice(0)));
      pond.append(pr);
      if (row === 3 && visible.length) { const x = h('div', 'prow'); x.append(...visible.splice(0)); pond.append(x); }
    }
    side.append(pond);
    // 他家の手牌
    if (r !== 0) {
      const oh = h('div', 'ohand');
      const backs = h('div', 'backs');
      let n = p.handCount;
      const drew = S.turn === seat && n % 3 === 2 && S.phase === 'discard';
      for (let i = 0; i < n; i++) { const t = tileEl(null); if (drew && i === n - 1) t.style.marginLeft = '6px'; backs.append(t); }
      const ms = h('div', 'ms');
      S.melds[seat].forEach((m, mi) => { const e = meldEl(m); if (mem && mi >= mem.m[seat]) e.classList.add('enter'); ms.append(e); });
      oh.append(backs, ms);
      side.append(oh);
    }
    b.append(side);
  }
  animMem = nowMem;
}

function renderMe() {
  const hand = $('#hand'); hand.innerHTML = '';
  const a = S.actions || {};
  const inDiscard = S.phase === 'discard' && S.turn === S.you && a.discard;
  const allowed = new Set(riichiMode ? (a.riichi || []) : (a.discard || []));
  const tiles = (S.hand || []).slice().sort((x, y) => x - y);
  const add = (t, extra) => {
    const e = tileEl(t, extra);
    if (inDiscard) {
      if (allowed.has(t)) {
        e.classList.add(riichiMode ? 'ok' : 'can');
        if (S.discardWaits && S.discardWaits[kindOf(t)]) e.classList.add('tcut'); // 切るとテンパイ
        if (selTile === t) e.classList.add('sel');
        // 1回目のタップで選ぶ（牌が上がる）、同じ牌をもう一度タップで切る
        e.onclick = () => { if (selTile === t) { selTile = null; discard(t); } else { selTile = t; renderMe(); fitLayout(); } };
      } else e.classList.add('ng');
    } else if (!S.spectator && t != null) {
      // 自分の番でないときも、切る牌を先に選んでおける（別の牌をタップで選び直し）
      if (selTile === t) e.classList.add('sel');
      e.onclick = () => { if (selTile === t) return; selTile = t; renderMe(); fitLayout(); };
    }
    hand.append(e);
  };
  tiles.forEach(t => add(t, ''));
  if (S.drawn != null) add(S.drawn, 'drawn' + (S.drawn !== lastDrawnAnim ? ' drawIn' : ''));
  lastDrawnAnim = S.drawn;
  if (S.spectator) {
    // 観戦中：手牌は見えない
    const n = S.players[S.you].handCount;
    for (let i = 0; i < n; i++) hand.append(tileEl(null));
  }
  const mm = $('#myMelds'); mm.innerHTML = '';
  S.melds[S.you].forEach((m, mi) => { const e = meldEl(m); if (myMeldCount != null && mi >= myMeldCount) e.classList.add('enter'); mm.append(e); });
  myMeldCount = S.melds[S.you].length;

  // 操作ボタン
  const box = $('#actions'); box.innerHTML = '';
  const btn = (label, cls, fn) => { const b = h('button', cls, label); b.onclick = fn; box.append(b); return b; };
  if (S.phase === 'result' || S.phase === 'choose' || S.gameOver) { /* モーダルで操作 */ }
  else if (subMenu) {
    subMenu.options.forEach(opt => {
      const b = h('button', 'opt');
      opt.forEach(t => b.append(tileEl(t)));
      b.append(tileEl(S.claimTile, 'side'));
      b.onclick = () => send({ type: subMenu.type, tiles: opt });
      box.append(b);
    });
    btn('戻る', 'pass', () => { subMenu = null; renderMe(); });
  } else if (S.phase === 'claim' && S.actions) {
    if (a.ron) btn('ロン', 'win', () => send({ type: 'ron' }));
    if (a.pon) btn('ポン', 'pon', () => a.pon.length > 1 ? (subMenu = { type: 'pon', options: a.pon }, renderMe()) : send({ type: 'pon', tiles: a.pon[0] }));
    if (a.chi) btn('チー', 'chi', () => a.chi.length > 1 ? (subMenu = { type: 'chi', options: a.chi }, renderMe()) : send({ type: 'chi', tiles: a.chi[0] }));
    if (a.minkan) btn('カン', 'kan', () => send({ type: 'minkan' }));
    btn('スキップ', 'pass', () => send({ type: 'pass' }));
  } else if (inDiscard) {
    if (a.tsumo) btn(a.wild ? 'ツモ（オールマイティ）' : 'ツモ', 'win', () => send({ type: 'tsumo' }));
    if (a.riichi) {
      btn(riichiMode === 'normal' ? 'リーチ取消' : 'リーチ', 'riichi', () => { riichiMode = riichiMode === 'normal' ? false : 'normal'; renderMe(); });
      btn(riichiMode === 'open' ? 'オープン取消' : 'オープンリーチ', 'riichi', () => { riichiMode = riichiMode === 'open' ? false : 'open'; renderMe(); });
    }
    (a.ankan || []).forEach(k => btn('カン', 'kan', () => send({ type: 'ankan', kind: k })).prepend(tileEl(k * 4 + 1, '', true)));
    (a.kakan || []).forEach(k => btn('加カン', 'kan', () => send({ type: 'kakan', kind: k })).prepend(tileEl(k * 4 + 1, '', true)));
    if (a.kyuushu) btn('九種九牌', '', () => send({ type: 'kyuushu' }));
    if (riichiMode) box.append(h('span', 'hint', riichiMode === 'open' ? '光っている牌を切るとオープンリーチ（待ちを公開）' : '光っている牌を切るとリーチ'));
  } else if (S.phase === 'claim') {
    box.append(h('span', 'hint', '他家の選択を待っています…'));
  }
  box.querySelectorAll('button .tile').forEach(t => t.style.setProperty('--w', '20px'));

  // ステータス（待ち牌）
  const st = $('#status'); st.innerHTML = '';
  // 待ち牌と残り枚数（全員に見えている河・鳴き・ドラ表示牌から数えた枚数）
  const showWaits = (label, list) => {
    st.append(h('span', '', label));
    let sum = 0;
    list.forEach(({ k, left }) => { const wb = h('span', 'wl' + (left ? '' : ' none')); wb.append(tileEl(k * 4 + 1, '', true), h('span', 'wn', `${left}`)); st.append(wb); sum += left; });
    st.append(h('span', 'wsum', `計${sum}枚`));
  };
  st.style.color = '';
  const dw = S.discardWaits || {};
  const selK = selTile != null ? kindOf(selTile) : null;
  const furi = () => st.append(h('span', 'furiten', 'フリテン'));
  if (selK != null && dw[selK]) { if (dw[selK].f) furi(); showWaits('切ると待ち:', dw[selK].w); }
  else if (S.waitsLeft && S.waitsLeft.length) {
    if (S.furiten) furi();
    showWaits('待ち:', S.waitsLeft);
  }
  if (S.spectator) { st.style.color = ''; st.append(h('span', '', '観戦中（手牌は見えません）')); }
}

function discard(t) {
  if (busy) return;
  send(riichiMode ? { type: 'riichi', tile: t, open: riichiMode === 'open' } : { type: 'discard', tile: t });
  riichiMode = false;
}

async function send(action) {
  if (busy) return;
  busy = true;
  subMenu = null;
  $('#actions').innerHTML = '';
  const r = await api('act', { action });
  if (r.error) { busy = false; if (!window.SOLO) api('sync'); } // 画面と実際の状態がずれていたら取り直す
}

// 鳴き・リーチの演出
function flashCalls() {
  if (!prevS || prevS.round.title !== S.round.title) return;
  for (let s = 0; s < 4; s++) {
    let text = null;
    if (S.melds[s].length > prevS.melds[s].length) {
      const m = S.melds[s][S.melds[s].length - 1];
      text = { chi: 'チー', pon: 'ポン', minkan: 'カン', ankan: 'カン' }[m.type];
    } else if (S.melds[s].some((m, i) => m.type === 'kakan' && prevS.melds[s][i] && prevS.melds[s][i].type === 'pon')) text = 'カン';
    else if (S.players[s].riichi && !prevS.players[s].riichi) text = S.players[s].open ? 'オープンリーチ' : 'リーチ';
    if (text) callFlash(s, text);
  }
  // 和了の瞬間：「ロン」「ツモ」を大きく出してから結果画面
  if (S.phase === 'result' && S.result && S.result.type === 'agari' && prevS.phase !== 'result') {
    S.result.wins.forEach(w => callFlash(w.seat, w.tsumo ? 'ツモ' : 'ロン'));
  }
}
function callFlash(s, text) {
  const cls = { 'チー': 'cf-chi', 'ポン': 'cf-pon', 'カン': 'cf-kan', 'リーチ': 'cf-riichi', 'オープンリーチ': 'cf-riichi', 'ロン': 'cf-win', 'ツモ': 'cf-win' }[text] || '';
  const side = document.querySelector(`.side[data-rel="${rel(s)}"]`);
  if (!side) return;
  const f = h('div', 'claimFlash ' + cls);
  f.append(h('span', '', text));
  side.append(f);
  setTimeout(() => f.remove(), cls === 'cf-win' ? 1300 : 1000);
}

// 自動操作（鳴きなし・自動和了・リーチ後のツモ切り）
function autoPlay() {
  clearTimeout(autoTimer);
  const a = S.actions;
  if (!a || S.phase === 'result' || S.phase === 'choose') return;
  if ($('#autoWin').checked && (a.ron || a.tsumo)) { autoTimer = setTimeout(() => send({ type: a.ron ? 'ron' : 'tsumo' }), 300); return; }
  if (S.phase === 'claim' && $('#noCall').checked && !a.ron) { autoTimer = setTimeout(() => send({ type: 'pass' }), 200); return; }
  if (S.phase === 'discard' && S.players[S.you].riichi && !a.tsumo && !a.ankan && a.discard && a.discard.length === 1) {
    autoTimer = setTimeout(() => send({ type: 'discard', tile: a.discard[0] }), 500);
  }
}
$('#autoWin').onchange = () => S && autoPlay();
// 鳴きなし：サーバーに伝えて、ポン・チーの選択肢そのものを出さないようにする（ほかの人も待たされない）
$('#noCall').onchange = () => { if (S) { api('act', { action: { type: 'noCall', on: $('#noCall').checked } }); autoPlay(); } };
if (window.SFX) { $('#sound').value = SFX.mode; $('#sound').onchange = (e) => { SFX.setMode(e.target.value); if (e.target.value !== 'off') SFX.play('turn'); }; }
if (window.SOLO) {
  $('#watchOpt').classList.remove('hidden');
  $('#watch').onchange = () => window.SOLO.setWatch($('#watch').checked);
}

// ================= 結果・選択モーダル =================
function countdown(el, deadline, prefix) {
  clearInterval(tickTimer);
  const upd = () => { const sec = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); el.textContent = `${prefix}（残り${sec}秒）`; };
  upd(); tickTimer = setInterval(upd, 500);
}
const chipText = (n) => `${n > 0 ? '+' : ''}${n}枚`;

// 部屋の成績（合計と1回ごと）
let histPage = 0, histOpen = false;
function rerenderHist() { if (S && S.gameOver && !$('#modal').classList.contains('hidden')) renderModal(); else if (ROOM) renderRoom(); setTimeout(fitNoScroll, 0); }
function renderHistory(box) {
  const hist = (ROOM && ROOM.history) || [];
  if (!hist.length) return;
  const sum = new Map();
  for (const g of hist) for (const r of g.rows) {
    const t = sum.get(r.pid) || { name: r.name, n: 0, chips: 0, ranks: [0, 0, 0, 0] };
    t.name = r.name; t.n++; t.chips += r.chips; t.ranks[r.rank - 1]++;
    sum.set(r.pid, t);
  }
  const sec = h('div', 'history');
  sec.append(h('h3', '', `この部屋の成績（${hist.length}回）`));
  const tb = h('table', 'sc');
  const hd = h('tr'); ['名前', '回数', '平均順位', '1-2-3-4着', '祝儀'].forEach(x => hd.append(h('td', 'hd', x))); tb.append(hd);
  [...sum.values()].sort((a, b) => b.chips - a.chips).forEach(t => {
    const avg = t.ranks.reduce((a, c, i) => a + c * (i + 1), 0) / t.n;
    const tr = h('tr');
    tr.append(h('td', '', t.name), h('td', 'num', String(t.n)), h('td', 'num', avg.toFixed(2)),
      h('td', 'num', t.ranks.join('-')),
      h('td', 'num ' + (t.chips >= 0 ? 'plus' : 'minus'), chipText(t.chips)));
    tb.append(tr);
  });
  sec.append(tb);
  const det = h('details', 'histDetail');
  det.append(h('summary', '', '1回ごとの成績'));
  det.open = histOpen; det.addEventListener('toggle', () => { histOpen = det.open; });
  // 1回ごとの成績は4回分ずつ（スクロールしないように、前へ・次へで切り替える）
  const all = hist.slice().reverse(), per = 4, pages = Math.ceil(all.length / per);
  if (histPage >= pages) histPage = pages - 1;
  if (pages > 1) {
    const nav = h('div', 'histNav');
    const prev = h('button', 'small', '◀ 新しい回'); prev.disabled = histPage <= 0; prev.onclick = (e) => { e.preventDefault(); histPage--; rerenderHist(); };
    const next = h('button', 'small', '前の回 ▶'); next.disabled = histPage >= pages - 1; next.onclick = (e) => { e.preventDefault(); histPage++; rerenderHist(); };
    nav.append(prev, h('span', 'sub', `${histPage + 1} / ${pages}`), next);
    det.append(nav);
  }
  const grid = h('div', 'histGrid'); det.append(grid);
  for (const g of all.slice(histPage * per, histPage * per + per)) {
    const d = new Date(g.at);
    const no = h('div', 'histNo', `第${g.no}回（${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}）`);
    const rb = h('button', 'small ghost', '牌譜を見る');
    rb.onclick = () => window.openReplay && window.openReplay(g.no, g.names);
    no.append(' ', rb);
    const gb = h('div', 'histGame'); gb.append(no);
    const t = h('table', 'sc');
    g.rows.forEach(r => {
      const tr = h('tr');
      tr.append(h('td', '', `${r.rank}位 ${r.name}`), h('td', 'num', r.score.toLocaleString()),
        h('td', 'num ' + (r.chips >= 0 ? 'plus' : 'minus'), chipText(r.chips)));
      t.append(tr);
    });
    gb.append(t); grid.append(gb);
  }
  sec.append(det);
  box.append(sec);
}

function renderChoose(body) {
  const C = S.choose;
  const name = (s) => S.players[s].name;
  if (C.seat !== S.you || !C.cands) {
    body.append(h('h2', '', `${name(C.seat)} が和了の取り方を選んでいます`));
    const p = h('p', 'sub'); body.append(p); countdown(p, C.deadline, '選択中');
    return;
  }
  body.append(h('h2', '', '和了の取り方を選んでください'));
  const p = h('p', 'sub'); body.append(p); countdown(p, C.deadline, '時間切れは祝儀が一番多いものを選びます');
  let maxPts = 0, maxChips = -1;
  C.cands.forEach(c => { maxPts = Math.max(maxPts, c.base); maxChips = Math.max(maxChips, c.chips); });
  const list = h('div', 'cands');
  C.cands.forEach((c, i) => {
    const b = h('button', 'cand');
    const top = h('div', 'ct');
    top.append(h('span', 'cd', c.desc || '通常'));
    if (c.base === maxPts) top.append(h('span', 'tag', '点数最高'));
    if (c.chips === maxChips) top.append(h('span', 'tag gold', '祝儀最多'));
    b.append(top);
    const hanTxt = c.yakuman ? c.limit : `${c.han}翻${c.fu}符${c.limit ? ' ' + c.limit : ''}`;
    b.append(h('div', 'cv', `${hanTxt}　${c.points}　祝儀${c.chips}枚`));
    b.append(h('div', 'cy', c.yaku.map(y => y[0]).join('・')));
    b.onclick = () => send({ type: 'choose', index: i });
    list.append(b);
  });
  body.append(list);
}

function fitRow(el) {
  const W = el.clientWidth; if (!W) return;
  const tiles = el.querySelectorAll('.tile').length, sides = el.querySelectorAll('.tile.side').length;
  const gaps = el.querySelectorAll('.gap').length, items = el.children.length;
  let inMeld = 0; el.querySelectorAll('.meld').forEach(m => { inMeld += Math.max(0, m.children.length - 1); });
  const fixed = 2 * Math.max(0, items - 1) + inMeld + 6 * gaps + 2;
  const w = Math.max(14, Math.min(34, Math.floor((W - fixed) / (tiles + 0.36 * sides))));
  el.style.setProperty('--tw', w + 'px');
}

function renderModal() {
  const m = $('#modal'), body = $('#modalBody');
  clearInterval(tickTimer);
  if (S.phase === 'choose' && S.choose) {
    m.classList.remove('hidden'); body.innerHTML = '';
    renderChoose(body);
    return;
  }
  if (S.phase !== 'result' || !S.result) { m.classList.add('hidden'); resultSeenAt = null; return; }
  // 和了の「ロン」「ツモ」の演出を見せてから結果を出す
  // 同じ結果なら、状態が送り直されても（誰かがOKを押しても）出し直さない
  const RK = JSON.stringify([S.gid, S.round, S.result.type, S.result.reason, S.result.delta]);
  if (resultSeenAt === null || resultSeenAt.r !== RK) resultSeenAt = { r: RK, t: Date.now() };
  const wait = S.result.type === 'agari' ? 1100 - (Date.now() - resultSeenAt.t) : 0;
  if (wait > 0) { m.classList.add('hidden'); clearTimeout(modalDelay); modalDelay = setTimeout(() => { if (S && resultSeenAt && resultSeenAt.r === RK) renderModal(); }, wait); return; }
  m.classList.remove('hidden');
  body.innerHTML = '';
  body.classList.remove('frGold', 'frRainbow', 'frBlink', 'gover'); body.style.zoom = '';
  const R = S.result;
  const name = (s) => S.players[s].name;
  let longest = 0, aElapsed = 0; // 和了演出の長さ（点数表はその後に出す）
  if (R.type === 'agari') {
    // 和了の演出（MJ風）：王牌の台で裏ドラを1枚ずつ引き出してめくる → 役が1行ずつ流れ込む → 「跳満」などを大きく出す
    // 画面が描き直されても途中から続くように、始まった時刻を覚えておく（負のanimation-delayで続きから再生）
    const AK = agariKey(R);
    const first = !uraStart.has(AK);
    if (first) { if (uraStart.size > 50) uraStart.clear(); uraStart.set(AK, Date.now()); }
    const elapsed = (Date.now() - uraStart.get(AK)) / 1000; aElapsed = elapsed;
    R.wins.forEach(w => {
      const nU = w.ura.length, nY = w.yaku.length;
      const uraAt = (i) => 0.5 + i * 0.9;                 // i枚目の裏ドラを引き出し始める時刻
      const uraEnd = nU ? uraAt(nU) + 0.2 : 0.15;
      const yakuAt = (j) => uraEnd + 0.35 + j * 0.5;      // 役の行（シュッ、シュッと1行ずつ）
      const stampAt = yakuAt(nY) + 0.35;                  // 最後に「満貫 8000点」
      const restAt = stampAt + 1.0;                       // 内訳・点数表
      const done = restAt + 0.5;
      longest = Math.max(longest, done);
      const anim = elapsed < done;                        // まだ演出中か
      const at = (el, t, cls = 'reveal') => { if (anim) { el.classList.add(cls); el.style.animationDelay = (t - elapsed) + 's'; } return el; };
      const box = h('div', 'win');
      box.append(h('h2', '', `${name(w.seat)} ${w.tsumo ? 'ツモ' : 'ロン'}${w.from != null ? `（${name(w.from)}）` : ''}`));
      if (w.desc) box.append(h('p', 'sub', w.desc));
      // 裏ドラで乗った牌を光らせるため、裏ドラ表示牌の「次の牌」を出しておく
      const nextKind = (k) => k < 27 ? Math.floor(k / 9) * 9 + (k % 9 + 1) % 9 : k < 31 ? 27 + (k - 27 + 1) % 4 : 31 + (k - 31 + 1) % 3;
      const hitAt = new Map(); // 種類 → 光り始める時刻
      w.ura.forEach((t, i) => { const k = nextKind(kindOf(t)); if (!hitAt.has(k)) hitAt.set(k, uraAt(i) + 0.85); });
      // オールマイティ（ぽっち）で和了ったときは、和了牌は「何として使ったか」で裏ドラを判定する（例：發ぽっちを7筒として → 7筒が裏ドラなら光る、白の次の發としては光らない）
      const kindFor = (t) => (t === w.tile && w.wildKind != null ? w.wildKind : kindOf(t));
      const handTile = (t, extra) => { const e = tileEl(t, extra); const kk = kindFor(t); if (hitAt.has(kk)) at(e, hitAt.get(kk), 'hit'); if (!anim && hitAt.has(kk)) e.classList.add('hitDone'); return e; };
      const tl = h('div', 'wtiles');
      w.hand.forEach(t => tl.append(handTile(t)));
      tl.append(h('span', 'gap'), handTile(w.tile, 'last'));
      if (w.melds.length) tl.append(h('span', 'gap'));
      w.melds.forEach(mm => tl.append(meldEl(mm)));
      box.append(tl);
      // 裏ドラ表示牌が虹の5なら、その色の6のうち1枚だけが虹の効果を持つ → その1枚は虹色に光らせる
      w.ura.forEach((t, i) => {
        const k = kindOf(t);
        if (!FIVE_KINDS.has(k) || t % 4 !== 3) return;
        const six = k + 1;
        const all = [...tl.querySelectorAll('.tile')];
        if (all.some(e => +e.dataset.id >= 0 && kindOf(+e.dataset.id) === k && +e.dataset.id % 4 === 3)) return; // 同じ種類の虹をもう持っている
        const target = all.find(e => e.dataset.id != null && kindFor(+e.dataset.id) === six && !e.classList.contains('rbHit'));
        if (!target) return;
        target.classList.add('rbHit');
        if (anim) { target.classList.add('hit'); target.style.animationDelay = (uraAt(i) + 0.85 - elapsed) + 's'; }
      });
      // 横向きでダブロンのときは、画面に収まるように王牌の台を出さず、表示牌を1行で出す
      const compact = R.wins.length > 1 && document.body.classList.contains('landscape');
      if (nU && !compact) {
        // 王牌の台（斜めから見た3D）。上段にドラ表示牌、その下の段から裏ドラを引き出してめくる
        const stage = h('div', 'stage'); const plane = h('div', 'plane');
        const nStacks = Math.max(7, w.dora.length + 3);
        for (let x = 0; x < nStacks; x++) {
          const di = x - 2; // 左から3つ目からドラ表示
          const stk = h('div', 'stk');
          const hasDora = di >= 0 && di < w.dora.length;
          stk.append(h('div', 'side'));
          stk.append(tileEl(hasDora ? w.dora[di] : null, 'hi'));
          if (hasDora && di < nU) {
            const u = h('div', 'ura'); const inner = h('div', 'inner');
            inner.append(tileEl(w.ura[di], 'face front'), tileEl(null, 'face backside'));
            u.append(inner);
            if (anim) { u.style.animationDelay = (uraAt(di) - elapsed) + 's'; inner.style.animationDelay = (uraAt(di) + 0.4 - elapsed) + 's'; u.classList.add('go'); }
            stk.append(u);
            if (first) setTimeout(() => { if (window.SFX) SFX.play('discard'); }, (uraAt(di) + 0.6) * 1000);
          }
          plane.append(stk);
        }
        stage.append(plane);
        stage.append(h('div', 'stageLbl', `ドラ表示 ${w.dora.length}枚　裏ドラ ${nU}枚`));
        box.append(stage);
      } else {
        const d = h('div', 'doras'); d.append('ドラ表示');
        w.dora.forEach(t => d.append(tileEl(t)));
        if (nU) { d.append('裏ドラ表示'); w.ura.forEach(t => d.append(tileEl(t))); }
        box.append(d);
      }
      const yl = h('div', 'yakulist');
      w.yaku.forEach(([n, v], j) => {
        const val = w.yakuman ? (v >= 39 ? 'トリプル役満' : v >= 26 ? 'ダブル役満' : '役満') : `${v}翻`;
        yl.append(at(h('span', 'yk', n), yakuAt(j), 'slideIn'), at(h('span', 'yv', val), yakuAt(j), 'slideIn'));
      });
      box.append(yl);
      if (first) w.yaku.forEach((_, j) => setTimeout(() => { if (window.SFX) SFX.play('swish'); }, yakuAt(j) * 1000));
      // 最後に「満貫 8000点」を大きく
      const fin = h('div', 'finale');
      if (w.limit) fin.append(h('span', 'stamp ' + (w.yakuman ? 'ym' : ''), w.limit));
      fin.append(h('span', 'finPts', /点/.test(String(w.points)) ? String(w.points) : w.points + '点'));
      box.append(at(fin, stampAt, 'stampIn'));
      if (first) setTimeout(() => { if (window.SFX) SFX.play('stamp'); }, stampAt * 1000);
      if (!w.yakuman) box.append(at(h('div', 'total sm', `${w.fu}符 ${w.han}翻`), restAt));
      const cd = w.chipsDetail || {};
      const parts = [];
      if (cd.special) parts.push(`特殊牌${cd.special}`);
      if (cd.separate) parts.push(`役・打点${cd.separate}`);
      if (cd.oneHan) parts.push(`1翻${cd.oneHan}`);
      // 祝儀の枚数も大きく（ツモは合計と「○枚オール」）
      const fc = h('div', 'finChips');
      fc.append(h('span', 'fcl', '祝儀'), h('span', 'fcn', `${w.tsumo ? w.chips * 3 : w.chips}枚`));
      if (w.tsumo) fc.append(h('span', 'fca', `（${w.chips}枚オール）`));
      const chipN = w.tsumo ? w.chips * 3 : w.chips;
      if (chipN >= 50) fc.querySelector('.fcn').classList.add('rb'); // 50枚以上は枚数をレインボーに
      // 15枚以下は揺らさずにふわっと出す。30枚以上は枠を金、50枚以上は枠を虹に
      box.append(at(fc, stampAt + 0.4, chipN > 15 ? 'stampIn' : 'reveal'));
      const fr = chipN >= 100 ? 'frBlink' : chipN >= 50 ? 'frRainbow' : chipN >= 30 ? 'frGold' : null;
      if (fr && !body.classList.contains('frBlink') && !(fr !== 'frBlink' && body.classList.contains('frRainbow'))) {
        body.classList.remove('frGold', 'frRainbow'); body.classList.add(fr);
        body.style.setProperty('--frDelay', (anim ? Math.max(0, stampAt + 0.4 - elapsed) : 0) + 's');
      }
      // 祝儀の枚数が画面の下に隠れていたら、出たときに見える所までスクロール
      if (anim) setTimeout(() => { if (fc.isConnected) fc.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, Math.max(0, (stampAt + 0.5 - elapsed) * 1000));
      // 祝儀の内訳は、2つ以上に分かれるときだけ小さく出す
      if (parts.length >= 2) box.append(at(h('div', 'chipline', `内訳：${parts.join('＋')}`), restAt));
      if (w.units && w.units.length) box.append(at(h('div', 'units', w.units.join('・')), restAt));
      if (w.pao != null) box.append(h('div', 'units', `包：${name(w.pao)}`));
      body.append(box);
    });
    if (elapsed < longest) {
      // 演出を飛ばす
      const sk = h('button', 'small skip', 'スキップ');
      sk.style.animationDelay = (longest - elapsed) + 's';
      sk.onclick = () => { uraStart.set(AK, Date.now() - 600000); renderModal(); };
      body.prepend(sk);
    }
  } else {
    body.append(h('h2', '', R.reason));
    if (R.nagashi && R.nagashi.length) body.append(h('p', 'sub', `流し満貫：${R.nagashi.map(name).join('・')}`));
    const th = h('div', 'tenpaiHands');
    R.tenpai.forEach((t, s) => {
      const row = h('div');
      row.append(h('div', '', `${name(s)}：${t ? 'テンパイ' : 'ノーテン'}`));
      if (t && R.hands[s]) {
        const tl = h('div', 'wtiles'); R.hands[s].forEach(x => tl.append(tileEl(x)));
        // 鳴いている面子も並べる
        const ms = (R.melds && R.melds[s]) || [];
        if (ms.length) { tl.append(h('span', 'gap')); ms.forEach(mm => tl.append(meldEl(mm))); }
        row.append(tl);
      }
      th.append(row);
    });
    body.append(th);
  }
  // 手牌は折り返さず1列に並べる（入りきるように牌の大きさを決める）
  body.querySelectorAll('.wtiles').forEach(fitRow);
  if (R.endReason) body.append(h('p', 'sub', R.endReason === 'トビ' ? `トビ：${R.bust.map(name).join('・')}` : R.endReason === 'コールド' ? `コールド：${R.cold.map(name).join('・')}（55000点）` : R.endReason));
  // 点数・祝儀の表
  const tb = h('table', 'sc');
  const hd = h('tr'); ['', '点数', '', '祝儀', ''].forEach(x => hd.append(h('td', 'hd', x))); tb.append(hd);
  for (let s = 0; s < 4; s++) {
    const tr = h('tr');
    const d = R.delta[s], cd = R.chipDelta[s];
    tr.append(h('td', '', `${S.players[s].wind} ${name(s)}${s === S.you && name(s) !== 'あなた' ? '（あなた）' : ''}`));
    tr.append(h('td', 'num ' + (d > 0 ? 'plus' : d < 0 ? 'minus' : ''), d ? (d > 0 ? '+' : '') + d.toLocaleString() : ''));
    tr.append(h('td', 'num', R.scores[s].toLocaleString()));
    tr.append(h('td', 'num ' + (cd > 0 ? 'plus' : cd < 0 ? 'minus' : ''), cd ? chipText(cd) : ''));
    tr.append(h('td', 'num', `${R.chips[s]}枚`));
    tb.append(tr);
  }
  if (aElapsed < longest) { tb.classList.add('reveal'); tb.style.animationDelay = (longest - 0.5 - aElapsed) + 's'; }
  body.append(tb);

  if (S.gameOver && !finalShown.has(R)) {
    // 最後の局の結果（裏ドラの演出も）を先に見せて、ボタンで終局の順位表へ
    const nb = h('button', 'primary sticky', '終局の結果を見る');
    nb.onclick = () => { finalShown.add(R); renderModal(); };
    body.append(nb);
    landModal(body);
    return;
  }
  if (S.gameOver) {
    // 終局の順位表を一番上に出す（最後の局の内容はその下）
    const lastHand = [...body.childNodes];
    body.innerHTML = '';
    body.classList.add('gover'); setTimeout(fitNoScroll, 0);
    body.append(h('h2', '', '終局'));
    const ft = h('table', 'sc');
    const fh = h('tr'); ['順位', '点数', '着順祝儀', '祝儀合計'].forEach(x => fh.append(h('td', 'hd', x))); ft.append(fh);
    S.gameOver.forEach(r => {
      const tr = h('tr');
      tr.append(h('td', '', `${r.rank}位 ${r.name}`), h('td', 'num', r.score.toLocaleString()),
        h('td', 'num ' + (r.rankChips >= 0 ? 'plus' : 'minus'), chipText(r.rankChips)),
        h('td', 'num ' + (r.chips >= 0 ? 'plus' : 'minus'), chipText(r.chips)));
      ft.append(tr);
    });
    body.append(ft);
    body.append(h('p', 'sub', '着順祝儀 1着+30枚・2着+10枚・3着−10枚・4着−30枚（祝儀合計に含む）'));
    const lh = h('details', 'lastHand'); lh.append(h('summary', '', '最後の局の結果'));
    lastHand.forEach(n => lh.append(n)); body.append(lh);
    renderHistory(body);
    const row = h('div', 'row sticky');
    const hist = (ROOM && ROOM.history) || [];
    if (hist.length && window.openReplay) { const rb = h('button', '', 'この対局の牌譜'); rb.onclick = () => window.openReplay(hist[hist.length - 1].no, hist[hist.length - 1].names); row.append(rb); }
    if (hist.length && window.saveRecords) { const sb = h('button', '', '成績と牌譜を保存'); sb.onclick = () => window.saveRecords(); row.append(sb); }
    if (ROOM && ROOM.solo && window.openRecordFile) {
      const lb = h('label', 'fileOpen small', '保存した成績・牌譜を開く');
      const fi = h('input'); fi.type = 'file'; fi.accept = '.json,application/json'; fi.hidden = true;
      fi.onchange = () => { if (fi.files[0]) window.openRecordFile(fi.files[0]); };
      lb.append(fi); body.append(lb);
    }
    if (ROOM && ROOM.solo) { const b = h('button', 'primary', 'もう一度対局する'); b.onclick = () => api('rematch'); row.append(b); }
    else {
      { const b = h('button', 'primary', '部屋に戻る'); b.onclick = () => api('rematch'); row.append(b); }
      const lv = h('button', '', 'ロビーへ'); lv.onclick = async () => { await api('leave'); ROOM = null; show('#lobby'); }; row.append(lv);
    }
    body.append(row);
    return;
  }
  const a = S.actions || {};
  if (a.dealerChoice) {
    const p = h('p', 'sub'); body.append(p); countdown(p, R.dealerDeadline, '親を続けますか？ 時間切れは続行');
    const row = h('div', 'row sticky');
    const b1 = h('button', 'primary', '続行（連荘）'); b1.onclick = () => send({ type: 'dealer', cont: true });
    const b2 = h('button', '', '親を流す'); b2.onclick = () => send({ type: 'dealer', cont: false });
    row.append(b1, b2); body.append(row);
  } else if (a.ready) {
    if (R.needDealerChoice && !R.dealerChoiceMade) body.append(h('p', 'sub', `親（${name(S.round.dealer)}）が続行するか選んでいます`));
    const b = h('button', 'primary sticky', `OK（${S.ready.length}/4）`); b.onclick = () => send({ type: 'ready' });
    body.append(b);
  } else {
    const waitDealer = R.needDealerChoice && !R.dealerChoiceMade;
    body.append(h('p', 'sub', waitDealer ? `親（${name(S.round.dealer)}）が続行するか選んでいます` : `他のプレイヤーを待っています（${S.ready.length}/4）`));
  }
  if (R.dealerChoiceMade) body.append(h('p', 'sub', R.dealerContinue ? '親は続行（連荘）します' : '親を流します'));
  landModal(body);
}

// 横向き：結果画面を左右2列にしてスクロールなしで見られるようにする
// 左：手牌・王牌の台・役　右：満貫などの結果・祝儀・点数表・ボタン
function landModal(body) {
  body.classList.remove('land2');
  if (!document.body.classList.contains('landscape')) return;
  const kids = [...body.children];
  const ti = kids.findIndex(e => e.matches('table.sc'));
  if (ti < 0) return;
  body.classList.add('land2');
  const top = [], left = [], right = [];
  kids.forEach((e, i) => {
    if (e.matches('.skip')) top.push(e);
    else if (i < ti && e.matches('h2') && !left.length) top.push(e);
    else if (i < ti) left.push(e);
    else right.push(e);
  });
  // 和了が1人なら、結果（満貫 8000点・祝儀）は右の列の上へ
  const wins = left.filter(e => e.matches('.win'));
  const moved = [];
  if (wins.length === 1) wins[0].querySelectorAll(':scope > .finale, :scope > .finChips, :scope > .total, :scope > .chipline, :scope > .units').forEach(e => moved.push(e));
  const cols = h('div', 'lcols'), lc = h('div', 'lcol'), rc = h('div', 'rcol');
  // 左の列：手牌・王牌・役（役は全部見えるように左の列いっぱいに使う）
  // 右の列：結果・祝儀・点数表、いちばん下にOKなどのボタン（ボタンは常に見える。入りきらないときは結果と点数表の部分だけ中でスクロール）
  const tail = right.filter(e => !e.matches('table.sc'));
  const tbl = right.filter(e => e.matches('table.sc'));
  const foot = h('div', 'lfoot'); foot.append(...tail);
  // ダブロンは2人目の和了を右の列（点数表の上）へ
  const second = wins.length === 2 ? [wins[1]] : [];
  const rbody = h('div', 'rbody'), rin = h('div', 'rin'); rin.append(...moved, ...second, ...tbl); rbody.append(rin);
  const lin = h('div', 'lin'); lin.append(...left.filter(e => !second.includes(e)));
  lc.append(lin); rc.append(rbody, foot);
  cols.append(lc, rc);
  body.innerHTML = ''; body.append(...top, cols);
  body.querySelectorAll('.wtiles').forEach(fitRow);
  // スクロールさせない：入りきらないときは、その列の中身を少しずつ縮めて画面に収める
  const fit = (box, inner) => {
    inner.style.zoom = 1;
    const avail = box.clientHeight, need = inner.scrollHeight;
    if (avail > 0 && need > avail) inner.style.zoom = Math.max(0.45, (avail / need) * 0.98).toFixed(3);
  };
  fit(lc, lin); fit(rbody, rin);
}

// ================= レイアウト =================
function fitLayout() {
  if (!S) return;
  const W = document.documentElement.clientWidth;
  const H0 = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  // 横向き（スマホを横にしたとき）：盤を画面いっぱいに使い、手牌は下の帯に大きく重ねる
  const land = W > H0 * 1.25 && H0 < 700;
  document.body.classList.toggle('landscape', land);
  // 手牌サイズ
  const meldTiles = S.melds[S.you].reduce((a, m) => a + m.tiles.length, 0);
  const units = (S.hand ? S.hand.length : 13) + (S.drawn != null ? 1.4 : 0) + meldTiles * 0.8 + S.melds[S.you].length * 0.3 + 0.5;
  const hw = Math.max(20, Math.min(land ? Math.floor(H0 * 0.16) : 46, Math.floor((W - (land ? 40 : 8)) / (units * (land ? 1.06 : 1.03)))));
  document.documentElement.style.setProperty('--hw', hw + 'px');
  // 卓の縮尺
  const meH = $('#me').offsetHeight;
  const appH = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  const H = Math.min(document.documentElement.clientHeight, appH);
  const b = $('#board');
  if (land) {
    // 盤の中で見せる範囲：上は対面の手牌・鳴いた牌（y=0）から、下は自分の河の下（y=560）まで
    const top = 0, bottom = 560;
    const scale = Math.max(0.3, Math.min(W / 600, (H - meH - 4) / (bottom - top)));
    b.style.transformOrigin = 'top center';
    b.style.top = `${-top * scale}px`;
    b.style.transform = `translate(-50%, 0) scale(${scale})`;
    $('#boardWrap').style.flex = `0 0 ${H}px`;
    // ドラの枠が上家の手牌にかからない大きさにする
    const db = $('#doraBox'), oh = document.querySelector('.side[data-rel="3"] .ohand');
    if (db && oh) {
      let w = 28; db.style.setProperty('--dw', w + 'px');
      const lim = oh.getBoundingClientRect().left - 8;
      while (w > 14 && db.getBoundingClientRect().right > lim) { w--; db.style.setProperty('--dw', w + 'px'); }
    }
  } else {
    const availH = H - meH - 4;
    const scale = Math.max(0.3, Math.min(W / 600, availH / 600));
    b.style.transformOrigin = '';
    b.style.top = '';
    b.style.transform = `translate(-50%, -50%) scale(${scale})`;
    $('#boardWrap').style.flex = `0 0 ${availH}px`;
  }
}
// 画面の実際の高さ（LINEなどアプリ内ブラウザで下が隠れないように）
function setAppHeight() {
  const hgt = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  document.documentElement.style.setProperty('--appH', Math.round(hgt) + 'px');
  // スマホ横向き（ロビー・待合室・牌譜でも使う）
  const W = document.documentElement.clientWidth;
  document.body.classList.toggle('wide', W > hgt * 1.25 && hgt < 700);
  fitNoScroll();
}
// 横向きでは画面をスクロールさせない：入りきらないときは中身を少し縮めて収める
function fitNoScroll() {
  const wide = document.body.classList.contains('wide');
  const H = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  const targets = [['#lobby .card', 16], ['#room .card', 16], ['#modalBody.gover', 24], ['#replay .rp-panel', 8]];
  for (const [sel, pad] of targets) {
    const el = document.querySelector(sel); if (!el) continue;
    el.style.zoom = 1;
    if (!wide || !el.getClientRects().length) continue;
    const need = el.scrollHeight, avail = H - pad;
    if (need > avail) el.style.zoom = Math.max(0.5, (avail / need) * 0.98).toFixed(3);
  }
}
setAppHeight();
// 「1回ごとの成績」などを開いたときも、画面に収まるように縮め直す
document.addEventListener('toggle', () => fitNoScroll(), true);
window.addEventListener('resize', () => { setAppHeight(); fitLayout(); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { setAppHeight(); fitLayout(); });
window.addEventListener('orientationchange', () => setTimeout(() => { setAppHeight(); fitLayout(); }, 300));

// LINEの中のブラウザで開いているときは、ふつうのブラウザで開き直す案内を出す（上下のバーがなくなって広くなる）
(function lineNotice() {
  if (window.SOLO || !/\bLine\//i.test(navigator.userAgent)) return;
  const bar = h('div', ''); bar.id = 'lineBar';
  const a = h('a', '', 'Safariで開く（画面が広くなります）');
  // 押した時点の部屋と本人の印を付けて開く → 対局中でもSafariでそのまま続きから
  const link = () => {
    const u = new URL(location.origin + location.pathname);
    if (ROOM && ROOM.code) u.searchParams.set('room', ROOM.code);
    u.searchParams.set('t', token);
    u.searchParams.set('openExternalBrowser', '1');
    return u.toString();
  };
  a.href = link();
  a.addEventListener('pointerdown', () => { a.href = link(); });
  a.addEventListener('touchstart', () => { a.href = link(); }, { passive: true });
  const x = h('button', 'small ghost', '×'); x.onclick = () => bar.remove();
  bar.append(a, x);
  document.body.append(bar);
})();

// 設定（鳴きなし・自動和了・音・観戦）は歯車ボタンで開く。盤の上をすっきりさせる
(function optsToggle() {
  const opts = document.getElementById('opts');
  if (!opts) return;
  const btn = h('button', 'small', '設定'); btn.id = 'optsBtn';
  btn.onclick = (e) => { e.stopPropagation(); opts.classList.toggle('open'); };
  document.getElementById('table').append(btn);
  document.addEventListener('click', (e) => { if (!opts.contains(e.target) && e.target !== btn) opts.classList.remove('open'); });
})();

// 縦向きのとき、一度だけ「横向きがおすすめ」の案内を出す
function landHint() {
  if (document.body.classList.contains('landscape') || !S || ls.get('mj_landHint')) return;
  if (document.getElementById('landHint')) return;
  const el = h('div', ''); el.id = 'landHint';
  el.append(h('span', '', 'スマホを横向きにすると、牌が大きくなって打ちやすくなります'));
  const x = h('button', 'small ghost', '×'); x.onclick = () => { ls.set('mj_landHint', '1'); el.remove(); };
  el.append(x);
  document.body.append(el);
  setTimeout(() => { if (el.isConnected) { ls.set('mj_landHint', '1'); el.remove(); } }, 8000);
}

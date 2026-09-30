'use strict';
// ================= 基本 =================
const $ = (s) => document.querySelector(s);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* noop */ } } };

let token = ls.get('mj_token');
if (!token) { token = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)); ls.set('mj_token', token); }

let ROOM = null;   // 部屋情報
let S = null;      // 対局状態
let prevS = null;
let busy = false;
let riichiMode = false; // false | 'normal' | 'open'
let tickTimer = null;
let subMenu = null; // {type:'chi'|'pon', options}
let autoTimer = null;
let selTile = null; // ダブルタップで切るための選択中の牌

const params = new URLSearchParams(location.search);
$('#name').value = ls.get('mj_name') || '';
if (params.get('room')) $('#code').value = params.get('room');

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
  if (id !== '#table') $('#modal').classList.add('hidden');
}

// ================= 接続 =================
function onRoom(data) {
  ROOM = data;
  if (!ROOM.started) { S = null; prevS = null; renderRoom(); show('#room'); }
  else show('#table');
}
function onState(data) {
  prevS = S; S = data; busy = false;
  if (!(S.phase === 'discard' && S.turn === S.you && S.hand && (S.hand.includes(selTile) || S.drawn === selTile))) selTile = null;
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
  if (ROOM.spectators && ROOM.spectators.length) hb.prepend(h('p', 'sub', `観戦：${ROOM.spectators.join('・')}`));
  $('#hostCtl').classList.toggle('hidden', !ROOM.isHost);
  const mine = ROOM.you >= 0 ? ROOM.seats[ROOM.you] : null;
  $('#guestWait').classList.toggle('hidden', ROOM.isHost || !mine || !mine.ready);
  $('#btnReady').classList.toggle('hidden', ROOM.isHost || !mine);
  if (mine && !ROOM.isHost) {
    $('#btnReady').textContent = mine.ready ? '準備OKを取り消す' : '準備OK';
    $('#btnReady').className = mine.ready ? 'ghost' : 'primary';
  }
  if (ROOM.isHost) {
    const full = ROOM.seats.every(Boolean);
    const waiting = ROOM.seats.filter(s => s && !s.ready);
    $('#btnBot').disabled = full;
    $('#btnStart').disabled = !full || waiting.length > 0;
    $('#btnStart').textContent = !full ? `対局開始（あと${ROOM.seats.filter(x => !x).length}人）`
      : waiting.length ? `準備OK待ち（${waiting.map(s => s.name).join('・')}）` : '対局開始';
  }
}
$('#btnBot').onclick = () => api('addBot');
$('#recordFile').onchange = (e) => { const f = e.target.files[0]; if (f && window.openRecordFile) window.openRecordFile(f); e.target.value = ''; };
$('#btnStart').onclick = () => api('start');
$('#btnReady').onclick = () => { const me = ROOM && ROOM.seats[ROOM.you]; api('ready', { ready: !(me && me.ready) }); };
$('#btnLeave').onclick = async () => { await api('leave'); ROOM = null; show('#lobby'); };
$('#btnCopy').onclick = async () => {
  const url = `${location.origin}${location.pathname}?room=${ROOM.code}`;
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
  renderBoard();
  renderMe();
  flashCalls();
  fitLayout();
  renderModal();
  autoPlay();
}

function renderBoard() {
  const b = $('#board'); b.innerHTML = '';
  const c = h('div', 'center');
  c.append(h('div', 'rt', `${S.round.wind}${S.round.kyoku}局`));
  c.append(h('div', 'sticks', `${S.round.honba}本場 供託${S.round.kyotaku}${S.round.kyotakuChips ? `+${S.round.kyotakuChips}枚` : ''}`));
  c.append(h('div', 'sticks', `残り${S.wall}`));
  const dora = h('div', 'dora');
  for (let i = 0; i < 5; i++) { const t = tileEl(i < S.dora.length ? S.dora[i] : null); t.style.setProperty('--w', '17px'); dora.append(t); }
  c.append(dora);
  b.append(c);

  for (let seat = 0; seat < 4; seat++) {
    const r = rel(seat);
    const p = S.players[seat];
    const side = h('div', 'side'); side.dataset.rel = r;
    // ラベル
    const lbl = h('div', 'lbl' + (S.turn === seat && S.phase !== 'result' ? ' turn' : ''));
    if (p.riichi) lbl.append(h('div', 'rstick'));
    const l1 = h('div'); l1.append(h('span', 'w', p.wind), document.createTextNode(p.name));
    if (p.away) l1.append(h('span', 'off', ' (離席)'));
    lbl.append(l1, h('div', 'sc', p.score.toLocaleString()), h('div', 'chip', `祝儀 ${p.chips > 0 ? '+' : ''}${p.chips}`));
    side.append(lbl);
    if (p.openWaits && p.openWaits.length) {
      const ow = h('div', 'openWaits'); ow.append(h('span', '', 'オープン'));
      p.openWaits.forEach(k => ow.append(tileEl(k * 4 + 1, '', true)));
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
      visible.push(tileEl(d.tile, (sideways ? 'side ' : '') + (d.tsumogiri ? 'dim ' : '') + (isLast ? 'last' : '')));
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
      S.melds[seat].slice().reverse().forEach(m => ms.prepend(meldEl(m)));
      oh.append(backs, ms);
      side.append(oh);
    }
    b.append(side);
  }
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
        if (selTile === t) e.classList.add('sel');
        // 1回目のタップで選ぶ（牌が上がる）、同じ牌をもう一度タップで切る
        e.onclick = () => { if (selTile === t) { selTile = null; discard(t); } else { selTile = t; renderMe(); fitLayout(); } };
      } else e.classList.add('ng');
    }
    hand.append(e);
  };
  tiles.forEach(t => add(t, ''));
  if (S.drawn != null) add(S.drawn, 'drawn');
  if (S.spectator) {
    // 観戦中：手牌は見えない
    const n = S.players[S.you].handCount;
    for (let i = 0; i < n; i++) hand.append(tileEl(null));
  }
  const mm = $('#myMelds'); mm.innerHTML = '';
  S.melds[S.you].forEach(m => mm.append(meldEl(m)));

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
    if (a.pon) btn('ポン', '', () => a.pon.length > 1 ? (subMenu = { type: 'pon', options: a.pon }, renderMe()) : send({ type: 'pon', tiles: a.pon[0] }));
    if (a.chi) btn('チー', '', () => a.chi.length > 1 ? (subMenu = { type: 'chi', options: a.chi }, renderMe()) : send({ type: 'chi', tiles: a.chi[0] }));
    if (a.minkan) btn('カン', '', () => send({ type: 'minkan' }));
    btn('スキップ', 'pass', () => send({ type: 'pass' }));
  } else if (inDiscard) {
    if (a.tsumo) btn(a.wild ? 'ツモ（オールマイティ）' : 'ツモ', 'win', () => send({ type: 'tsumo' }));
    if (a.riichi) {
      btn(riichiMode === 'normal' ? 'リーチ取消' : 'リーチ', 'riichi', () => { riichiMode = riichiMode === 'normal' ? false : 'normal'; renderMe(); });
      btn(riichiMode === 'open' ? 'オープン取消' : 'オープンリーチ', 'riichi', () => { riichiMode = riichiMode === 'open' ? false : 'open'; renderMe(); });
    }
    (a.ankan || []).forEach(k => btn('カン', '', () => send({ type: 'ankan', kind: k })).prepend(tileEl(k * 4 + 1, '', true)));
    (a.kakan || []).forEach(k => btn('加カン', '', () => send({ type: 'kakan', kind: k })).prepend(tileEl(k * 4 + 1, '', true)));
    if (a.kyuushu) btn('九種九牌', '', () => send({ type: 'kyuushu' }));
    if (riichiMode) box.append(h('span', 'hint', riichiMode === 'open' ? '光っている牌を切るとオープンリーチ（待ちを公開）' : '光っている牌を切るとリーチ'));
  } else if (S.phase === 'claim') {
    box.append(h('span', 'hint', '他家の選択を待っています…'));
  }
  box.querySelectorAll('button .tile').forEach(t => t.style.setProperty('--w', '20px'));

  // ステータス（待ち牌）
  const st = $('#status'); st.innerHTML = '';
  if (S.waits && S.waits.length) {
    st.append(h('span', '', S.furiten ? 'フリテン 待ち:' : '待ち:'));
    S.waits.forEach(k => st.append(tileEl(k * 4 + 1, '', true)));
    if (S.furiten) st.style.color = '#ff9b8a'; else st.style.color = '';
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
    if (text) {
      const side = document.querySelector(`.side[data-rel="${rel(s)}"]`);
      const f = h('div', 'claimFlash', text);
      side.append(f);
      setTimeout(() => f.remove(), 900);
    }
  }
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
$('#noCall').onchange = $('#autoWin').onchange = () => S && autoPlay();
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
  for (const g of hist.slice().reverse()) {
    const d = new Date(g.at);
    const no = h('div', 'histNo', `第${g.no}回（${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}）`);
    const rb = h('button', 'small ghost', '牌譜を見る');
    rb.onclick = () => window.openReplay && window.openReplay(g.no, g.names);
    no.append(' ', rb);
    det.append(no);
    const t = h('table', 'sc');
    g.rows.forEach(r => {
      const tr = h('tr');
      tr.append(h('td', '', `${r.rank}位 ${r.name}`), h('td', 'num', r.score.toLocaleString()),
        h('td', 'num ' + (r.chips >= 0 ? 'plus' : 'minus'), chipText(r.chips)));
      t.append(tr);
    });
    det.append(t);
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

function renderModal() {
  const m = $('#modal'), body = $('#modalBody');
  clearInterval(tickTimer);
  if (S.phase === 'choose' && S.choose) {
    m.classList.remove('hidden'); body.innerHTML = '';
    renderChoose(body);
    return;
  }
  if (S.phase !== 'result' || !S.result) { m.classList.add('hidden'); return; }
  m.classList.remove('hidden');
  body.innerHTML = '';
  const R = S.result;
  const name = (s) => S.players[s].name;
  if (R.type === 'agari') {
    R.wins.forEach(w => {
      const box = h('div', 'win');
      box.append(h('h2', '', `${name(w.seat)} ${w.tsumo ? 'ツモ' : 'ロン'}${w.from != null ? `（${name(w.from)}）` : ''}`));
      if (w.desc) box.append(h('p', 'sub', w.desc));
      const tl = h('div', 'wtiles');
      w.hand.forEach(t => tl.append(tileEl(t)));
      tl.append(h('span', 'gap'), tileEl(w.tile, 'last'));
      if (w.melds.length) tl.append(h('span', 'gap'));
      w.melds.forEach(mm => tl.append(meldEl(mm)));
      box.append(tl);
      const yl = h('div', 'yakulist');
      w.yaku.forEach(([n, v]) => { yl.append(h('span', '', n), h('span', '', w.yakuman ? (v >= 39 ? 'トリプル役満' : v >= 26 ? 'ダブル役満' : '役満') : `${v}翻`)); });
      box.append(yl);
      const tot = w.yakuman ? `${w.limit} ${w.points}` : `${w.fu}符 ${w.han}翻 ${w.limit ? w.limit + ' ' : ''}${w.points}`;
      box.append(h('div', 'total', tot));
      const cd = w.chipsDetail || {};
      const parts = [];
      if (cd.special) parts.push(`特殊牌${cd.special}`);
      if (cd.separate) parts.push(`役・打点${cd.separate}`);
      if (cd.oneHan) parts.push(`1翻${cd.oneHan}`);
      box.append(h('div', 'chipline', `祝儀 ${w.chips}枚${w.tsumo ? '（3人それぞれ）' : ''}${parts.length ? '　' + parts.join('＋') : ''}`));
      if (w.units && w.units.length) box.append(h('div', 'units', w.units.join('・')));
      if (w.pao != null) box.append(h('div', 'units', `包：${name(w.pao)}`));
      const d = h('div', 'doras'); d.append('ドラ表示');
      w.dora.forEach(t => d.append(tileEl(t)));
      if (w.ura.length) { d.append(' 裏ドラ表示'); w.ura.forEach(t => d.append(tileEl(t))); }
      box.append(d);
      body.append(box);
    });
  } else {
    body.append(h('h2', '', R.reason));
    if (R.nagashi && R.nagashi.length) body.append(h('p', 'sub', `流し満貫：${R.nagashi.map(name).join('・')}`));
    const th = h('div', 'tenpaiHands');
    R.tenpai.forEach((t, s) => {
      const row = h('div');
      row.append(h('div', '', `${name(s)}：${t ? 'テンパイ' : 'ノーテン'}`));
      if (t && R.hands[s]) { const tl = h('div', 'wtiles'); R.hands[s].forEach(x => tl.append(tileEl(x))); row.append(tl); }
      th.append(row);
    });
    body.append(th);
  }
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
  body.append(tb);

  if (S.gameOver) {
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
    renderHistory(body);
    const row = h('div', 'row');
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
      if (ROOM && ROOM.isHost) { const b = h('button', 'primary', 'もう一度（部屋に戻る）'); b.onclick = () => api('rematch'); row.append(b); }
      const lv = h('button', '', 'ロビーへ'); lv.onclick = async () => { await api('leave'); ROOM = null; show('#lobby'); }; row.append(lv);
    }
    body.append(row);
    return;
  }
  const a = S.actions || {};
  if (a.dealerChoice) {
    const p = h('p', 'sub'); body.append(p); countdown(p, R.dealerDeadline, '親を続けますか？ 時間切れは続行');
    const row = h('div', 'row');
    const b1 = h('button', 'primary', '続行（連荘）'); b1.onclick = () => send({ type: 'dealer', cont: true });
    const b2 = h('button', '', '親を流す'); b2.onclick = () => send({ type: 'dealer', cont: false });
    row.append(b1, b2); body.append(row);
  } else if (a.ready) {
    if (R.needDealerChoice && !R.dealerChoiceMade) body.append(h('p', 'sub', `親（${name(S.round.dealer)}）が続行するか選んでいます`));
    const b = h('button', 'primary', `OK（${S.ready.length}/4）`); b.onclick = () => send({ type: 'ready' });
    body.append(b);
  } else {
    const waitDealer = R.needDealerChoice && !R.dealerChoiceMade;
    body.append(h('p', 'sub', waitDealer ? `親（${name(S.round.dealer)}）が続行するか選んでいます` : `他のプレイヤーを待っています（${S.ready.length}/4）`));
  }
  if (R.dealerChoiceMade) body.append(h('p', 'sub', R.dealerContinue ? '親は続行（連荘）します' : '親を流します'));
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
  const hw = Math.max(20, Math.min(land ? Math.floor(H0 * 0.16) : 46, Math.floor((W - (land ? 40 : 20)) / (units * 1.06))));
  document.documentElement.style.setProperty('--hw', hw + 'px');
  // 卓の縮尺
  const meH = $('#me').offsetHeight;
  const appH = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  const H = Math.min(document.documentElement.clientHeight, appH);
  const b = $('#board');
  if (land) {
    // 盤の中で見せる範囲：上は対面の河の3段目あたり（y=40）から、下は自分の河の下（y=556）まで
    const top = 40, bottom = 560;
    const scale = Math.max(0.3, Math.min(W / 600, (H - meH - 4) / (bottom - top)));
    b.style.transformOrigin = 'top center';
    b.style.top = `${-top * scale}px`;
    b.style.transform = `translate(-50%, 0) scale(${scale})`;
    $('#boardWrap').style.flex = `0 0 ${H}px`;
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
}
setAppHeight();
window.addEventListener('resize', () => { setAppHeight(); fitLayout(); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { setAppHeight(); fitLayout(); });
window.addEventListener('orientationchange', () => setTimeout(() => { setAppHeight(); fitLayout(); }, 300));

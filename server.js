// 友達対戦用 麻雀サーバー（依存パッケージなし：Node.js標準モジュールのみ）
// 通信: サーバー→ブラウザは Server-Sent Events、ブラウザ→サーバーは POST /api
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Game, botAction } = require('./game');
const records = require('./records');

// 画面のファイルは public フォルダに置く。フォルダごとアップロードできなかった場合に備えて、
// public がなければ server.js と同じ場所から配る（サーバー側のファイルは配らない）
const PUBLIC = fs.existsSync(path.join(__dirname, 'public', 'index.html')) ? path.join(__dirname, 'public') : __dirname;
const HIDDEN = new Set(['server.js', 'game.js', 'yaku.js', 'rules.js', 'records.js', 'package.json', 'render.yaml', 'README.md']);
const BOT_DELAY = +(process.env.BOT_DELAY || 600);
const rooms = new Map(); // code -> room
const clients = new Map(); // token -> { res, code }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

function newCode() {
  let c;
  do { c = String(crypto.randomInt(1000, 10000)); } while (rooms.has(c));
  return c;
}

const online = (token) => clients.has(token);

function send(token, event, data) {
  const c = clients.get(token);
  if (c) c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const pidOf = (token) => crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 10);

// 成績ページ用に、半荘の生の結果を保存する（records.js → GitHub の data ブランチ）
// 場代：1半荘ごとにトップから祝儀 FEE_CHIPS 枚（×倍率）を引き、FEE_TO の人に足す。記録した時点の値で残す
const FEE_CHIPS = +(process.env.FEE_CHIPS ?? 1), FEE_TO = process.env.FEE_TO || 'あつや';
const DEFAULT_RATE = 100; // 部屋を作ったときの倍率
function saveRecord(room) {
  const g = room.game;
  records.add({
    id: room.gameKey, at: new Date().toISOString(), room: room.code, rate: room.gameRate || DEFAULT_RATE,
    ...(FEE_CHIPS > 0 ? { fee: FEE_CHIPS, feeTo: FEE_TO } : {}),
    players: g.gameOver.slice().sort((a, b) => a.seat - b.seat).map(r => ({ name: r.name, rank: r.rank, score: r.score, chips: r.chips, cpu: !!room.seats[r.seat].isBot })),
  });
}

// 対局が終わったら部屋の成績に記録する
function recordGame(room) {
  const g = room.game;
  if (!g || !g.gameOver || g.recorded) return;
  g.recorded = true;
  saveRecord(room);
  if (!room.history) room.history = [];
  room.history.push({
    no: room.history.length + 1, at: Date.now(),
    replay: g.replay || [], names: g.players.map(p => p.name),
    rows: g.gameOver.map(r => ({ pid: pidOf(room.seats[r.seat].token), name: r.name, isBot: !!room.seats[r.seat].isBot, rank: r.rank, score: r.score, rankChips: r.rankChips, chips: r.chips })),
  });
}

function roomSummary(room) {
  recordGame(room);
  return {
    history: (room.history || []).map(x => ({ no: x.no, at: x.at, rows: x.rows, names: x.names })), // 牌譜は別に取りに来る
    code: room.code,
    settings: room.settings,
    rate: room.rate || DEFAULT_RATE,
    seats: room.seats.map(s => s && { name: s.name, char: s.char, isBot: !!s.isBot, online: !!s.isBot || online(s.token), ready: !!s.isBot || s.token === room.hostToken || !!s.ready }),
    spectators: (room.spectators || []).filter(v => online(v.token)).map(v => v.name),
    started: !!room.game,
  };
}

// ホストの接続が切れて30秒たったら、つながっている別の人をホストにする（「もう一度」「対局開始」を押せる人がいなくならないように）
function maybeTransferHost(room) {
  if (online(room.hostToken)) return;
  const host = room.seats.find(s => s && s.token === room.hostToken);
  if (host && host.offlineAt && Date.now() - host.offlineAt < GRACE_MS) return;
  const next = room.seats.find(s => s && !s.isBot && online(s.token));
  if (next) room.hostToken = next.token;
}

function broadcast(room) {
  room.lastActive = Date.now();
  maybeTransferHost(room);
  const summary = roomSummary(room);
  room.seats.forEach((s, i) => {
    if (!s || s.isBot) return;
    send(s.token, 'room', { ...summary, you: i, isHost: s.token === room.hostToken });
    if (room.game) { const v = room.game.viewFor(i); v.waitFor = waitingFor(room); send(s.token, 'state', v); }
  });
  // 観戦者：手牌は見えない（東家から見た向きで表示）
  for (const v of room.spectators || []) {
    if (!online(v.token)) continue;
    send(v.token, 'room', { ...summary, you: -1, spectator: true, isHost: false });
    if (room.game) { const sv = spectatorView(room.game); sv.waitFor = waitingFor(room); send(v.token, 'state', sv); }
  }
  scheduleBots(room);
}

function spectatorView(g) {
  const v = g.viewFor(-1);
  v.you = 0; v.spectator = true; v.hand = null; v.drawn = null; v.actions = null; v.waits = []; v.furiten = false;
  if (v.choose) v.choose.cands = null;
  return v;
}

const GRACE_MS = +(process.env.GRACE_MS || 30000); // 接続が切れた人の番は30秒待ってからCPUが代わりに打つ

function isAuto(room, seat) {
  const s = room.seats[seat];
  return !s || s.isBot || !online(s.token);
}
// 接続が切れてからの待ち時間の残り（ms）。0ならCPUが代わりに打つ
function graceLeft(room, seat) {
  const s = room.seats[seat];
  if (!s || s.isBot || online(s.token)) return 0;
  if (!s.offlineAt) s.offlineAt = Date.now();
  return Math.max(0, s.offlineAt + GRACE_MS - Date.now());
}
// 待っている人（自分の番なのに接続が切れていて、まだ30秒たっていない人）
function waitingFor(room) {
  const g = room.game;
  if (!g || g.gameOver) return [];
  const out = [];
  for (let seat = 0; seat < 4; seat++) {
    const left = graceLeft(room, seat);
    if (left > 0 && g.actionsFor(seat) && g.phase !== 'result') out.push({ seat, name: room.seats[seat].name, left });
  }
  return out;
}

function scheduleBots(room) {
  const g = room.game;
  if (!g) return;
  clearTimeout(room.botTimer);
  clearTimeout(room.autoTimer);
  clearTimeout(room.graceTimer);
  if (g.gameOver) return;
  if (!room.seats.some(s => s && !s.isBot && online(s.token))) return; // 誰もいなければ一時停止
  for (let seat = 0; seat < 4; seat++) g.players[seat].away = !room.seats[seat].isBot && !online(room.seats[seat].token);
  const delay = g.phase === 'result' ? 1500 : g.phase === 'claim' || g.phase === 'choose' ? 250 : BOT_DELAY;
  // CPUと、接続が切れて30秒たった人の番はCPUが打つ。30秒たっていない人は待つ
  const botSeat = [0, 1, 2, 3].find(s => isAuto(room, s) && g.actionsFor(s) && graceLeft(room, s) === 0);
  const waits = waitingFor(room);
  if (waits.length) room.graceTimer = setTimeout(() => broadcast(room), Math.min(...waits.map(w => w.left)) + 50);
  if (botSeat !== undefined) {
    room.botTimer = setTimeout(() => {
      const act = botAction(g, botSeat);
      if (act && g.act(botSeat, act)) return; // act -> onUpdate -> broadcast
      const a = g.actionsFor(botSeat);
      if (a && a.pass) g.act(botSeat, { type: 'pass' });
      else if (a && a.discard) g.act(botSeat, { type: 'discard', tile: a.discard[a.discard.length - 1] });
    }, delay);
  }
  if (g.phase === 'choose' && g.choose) {
    // 和了の取り方の選択：20秒で祝儀優先の候補を自動選択（R-28）
    const seat = g.choose.seat;
    room.autoTimer = setTimeout(() => {
      if (g.phase === 'choose' && g.choose && g.choose.seat === seat) g.act(seat, { type: 'choose' });
    }, Math.max(0, g.choose.deadline - Date.now()));
  } else if (g.phase === 'result') {
    const r = g.result;
    if (r && r.needDealerChoice && !r.dealerChoiceMade) {
      // 親の選択：30秒で「続行」（B-19）
      room.autoTimer = setTimeout(() => {
        if (g.phase === 'result' && g.result === r && !r.dealerChoiceMade) g.act(g.kyoku, { type: 'dealer', cont: true });
      }, Math.max(0, r.dealerDeadline - Date.now()));
    }
    // 結果画面は自動で進めない：全員がOKを押したら次の局（接続が切れた人の分はCPUが押す）
  }
}

function startGame(room) {
  // 席順（起家）をランダムに
  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) { const j = crypto.randomInt(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  room.seats = order.map(i => room.seats[i]);
  room.gameKey = room.code + '-' + Date.now();
  room.gameRate = room.rate || DEFAULT_RATE; // 対局中に変わらないよう、開始時の倍率で記録する
  room.game = new Game(room.seats.map(s => ({ name: s.name, isBot: !!s.isBot })), {}, () => broadcast(room));
  broadcast(room);
}

const cleanName = n => String(n || '').trim().slice(0, 12);
// キャラ（chars.js と同じ並び）。選んでいなければ空いているキャラ
const CHAR_IDS = ['rin', 'kohaku', 'shizuku', 'nanami', 'pochi', 'daiya'];
const cleanChar = c => (CHAR_IDS.includes(c) ? c : null);
const freeChar = (room) => { const used = new Set(room.seats.filter(Boolean).map(s => s.char)); const free = CHAR_IDS.filter(c => !used.has(c)); return free[crypto.randomInt(free.length || 1)] || CHAR_IDS[crypto.randomInt(CHAR_IDS.length)]; };

// ============ コマンド処理 ============
function handle(token, msg) {
  const c = clients.get(token);
  let room = c && c.code ? rooms.get(c.code) : null;
  const seatIndex = () => room ? room.seats.findIndex(s => s && s.token === token) : -1;
  const isHost = () => room && room.hostToken === token;
  const bind = (r) => { const cl = clients.get(token); if (cl) cl.code = r.code; };

  switch (msg.cmd) {
    case 'create': {
      const name = cleanName(msg.name);
      if (!name) return { error: '名前を入力してください' };
      const code = newCode();
      const st = msg.settings || {};
      room = {
        code, hostToken: token,
        settings: { length: 'tonpuu', aka: true }, // ルールは固定（東風戦・定義書どおり）
        seats: [{ token, name, char: cleanChar(msg.char) || CHAR_IDS[crypto.randomInt(CHAR_IDS.length)] }, null, null, null],
        game: null, lastActive: Date.now(),
      };
      rooms.set(code, room);
      bind(room); broadcast(room);
      return { ok: true, code };
    }
    case 'join': {
      const r = rooms.get(String(msg.code || '').trim());
      if (!r) return { error: '部屋が見つかりません' };
      const existing = r.seats.findIndex(s => s && s.token === token);
      if (!r.spectators) r.spectators = [];
      if (existing >= 0) r.seats[existing].left = false; // 終局後にロビーへ行って同じ部屋に戻ってきた
      if (existing < 0) {
        const name = cleanName(msg.name);
        if (!name) return { error: '名前を入力してください' };
        // 接続が切れた人が、同じ名前で入り直したら元の席に戻る（別のブラウザ・端末からでもOK）
        const back = r.seats.find(s => s && !s.isBot && s.name === name && !online(s.token));
        if (back) {
          if (r.hostToken === back.token) r.hostToken = token;
          back.token = token;
          back.offlineAt = null; back.left = false;
          if (cleanChar(msg.char)) back.char = cleanChar(msg.char);
          if (r.spectators) r.spectators = r.spectators.filter(v => v.token !== token);
          room = r; bind(r); broadcast(r);
          return { ok: true, code: r.code };
        }
        // 同じ名前の人がいると、落ちたときにどちらの席か分からなくなるので断る
        if (r.seats.some(s => s && s.name === name)) return { error: `「${name}」はもう使われています。別の名前にしてください` };
        const free = r.seats.findIndex(s => !s);
        const sp = r.spectators.find(v => v.token === token);
        if (r.game || free < 0) {
          // 満員・対局中は観戦として入る
          if (sp) sp.name = name; else r.spectators.push({ token, name });
        } else {
          if (sp) r.spectators = r.spectators.filter(v => v !== sp);
          r.seats[free] = { token, name, char: cleanChar(msg.char) || freeChar(r) };
        }
      } else if (!r.game && cleanName(msg.name)) {
        r.seats[existing].name = cleanName(msg.name);
        if (cleanChar(msg.char)) r.seats[existing].char = cleanChar(msg.char);
      }
      room = r; bind(r); broadcast(r);
      return { ok: true, code: r.code };
    }
    case 'addBot': {
      if (!isHost() || room.game) return { error: 'ホストのみ操作できます' };
      const free = room.seats.findIndex(s => !s);
      if (free < 0) return { error: '満員です' };
      const n = room.seats.filter(s => s && s.isBot).length + 1;
      room.seats[free] = { token: 'bot-' + crypto.randomUUID(), name: 'CPU' + n, isBot: true, char: freeChar(room) };
      broadcast(room); return { ok: true };
    }
    case 'kick': {
      if (!isHost() || room.game) return { error: 'ホストのみ操作できます' };
      const s = room.seats[msg.seat];
      if (!s || s.token === room.hostToken) return { error: 'できません' };
      if (!s.isBot) { send(s.token, 'kicked', {}); const cl = clients.get(s.token); if (cl) cl.code = null; }
      room.seats[msg.seat] = null;
      broadcast(room); return { ok: true };
    }
    case 'settings': {
      if (!isHost() || room.game) return { error: 'ホストのみ操作できます' };
      room.settings.length = msg.length === 'tonpuu' ? 'tonpuu' : 'hanchan';
      room.settings.aka = !!msg.aka;
      broadcast(room); return { ok: true };
    }
    // 倍率（成績表に祝儀×倍率で記録する）。ルームを作った人だけが変えられる
    case 'setRate': {
      if (!room || room.game) return { error: '対局中は変えられません' };
      if (!isHost()) return { error: '倍率を変えられるのはルームを作った人です' };
      const n = Number(msg.rate);
      if (!(n > 0 && n <= 1000000)) return { error: '倍率は0より大きい数字で入れてください' };
      room.rate = Math.round(n * 1000) / 1000;
      broadcast(room); return { ok: true };
    }
    case 'start': {
      if (!isHost() || room.game) return { error: 'ホストのみ操作できます' };
      if (room.seats.some(s => !s)) return { error: '4人そろっていません（CPUを追加できます）' };
      // 人間のプレイヤー全員の「準備OK」がそろってから（ホストは開始ボタンが準備OKの代わり、CPUは自動でOK）
      const notReady = room.seats.filter(s => !s.isBot && s.token !== room.hostToken && !(s.ready && online(s.token)));
      if (notReady.length) return { error: `準備OKを待っています（${notReady.map(s => s.name).join('・')}）` };
      startGame(room); return { ok: true };
    }
    // CPUが入っている対局は、途中でやめて部屋に戻れる（成績表・部屋の成績には残さない）
    case 'abort': {
      if (!room || !room.game || room.game.gameOver) return { error: '対局中ではありません' };
      if (seatIndex() < 0) return { error: '席がありません' };
      if (!room.seats.some(s => s && s.isBot)) return { error: 'CPUがいる対局だけ途中でやめられます' };
      clearTimeout(room.botTimer); clearTimeout(room.autoTimer); clearTimeout(room.graceTimer);
      room.game = null;
      room.seats = room.seats.map(s => (s && s.left ? null : s));
      room.seats.forEach(s => { if (s) s.ready = false; });
      broadcast(room); return { ok: true };
    }
    case 'rematch': {
      // 終局後は誰でも部屋に戻せる（ホストを待たなくていい）
      if (!room.game || !room.game.gameOver || seatIndex() < 0) return { error: 'できません' };
      room.game = null;
      room.seats = room.seats.map(s => (s && s.left ? null : s)); // 終局後にロビーへ行った人の席は空ける
      room.seats.forEach(s => { if (s) s.ready = false; }); // 次の対局も全員の準備OKから
      broadcast(room); return { ok: true };
    }
    case 'leave': {
      if (!room) return { ok: true };
      const i = seatIndex();
      if (room.spectators) room.spectators = room.spectators.filter(v => v.token !== token);
      if (i >= 0 && room.game && room.game.gameOver) {
        // 終局後にロビーへ：部屋に戻るときに席を空ける。ホストなら残っている人に引き継ぐ
        room.seats[i].left = true;
        if (isHost()) { const next = room.seats.find(s => s && !s.isBot && !s.left); if (next) room.hostToken = next.token; }
      }
      if (i >= 0 && !room.game) {
        room.seats[i] = null;
        if (isHost()) {
          const next = room.seats.find(s => s && !s.isBot);
          if (next) room.hostToken = next.token; else rooms.delete(room.code);
        }
      }
      const cl = clients.get(token); if (cl) cl.code = null;
      if (rooms.has(room.code)) broadcast(room);
      return { ok: true };
    }
    case 'replay': {
      const hs = room && room.history;
      const e = hs && hs.find(x => x.no === +msg.no);
      if (!e) return { error: '牌譜がありません' };
      return { ok: true, replay: e.replay };
    }
    case 'ready': {
      if (!room || room.game) return { error: 'いまは押せません' };
      const i = seatIndex();
      if (i < 0) return { error: '席がありません' };
      room.seats[i].ready = msg.ready !== false;
      broadcast(room); return { ok: true };
    }
    case 'sync': {
      if (room) broadcast(room);
      else send(token, 'hello', { code: null });
      return { ok: true };
    }
    case 'act': {
      if (!room || !room.game) return { error: '対局中ではありません' };
      const i = seatIndex();
      if (i < 0) return { error: '席がありません' };
      if (!room.game.act(i, msg.action)) { send(token, 'state', room.game.viewFor(i)); return { error: 'その操作はできません' }; }
      return { ok: true };
    }
    default:
      return { error: 'unknown command' };
  }
}

// ============ HTTPサーバー ============
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/events') {
    const token = String(url.searchParams.get('token') || '');
    if (!/^[\w-]{8,64}$/.test(token)) { res.writeHead(400); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    const prev = clients.get(token);
    if (prev) { try { prev.res.end(); } catch (e) { /* noop */ } }
    // 既に座っている部屋があれば再接続
    let code = null;
    for (const r of rooms.values()) if (r.seats.some(s => s && !s.left && s.token === token) || (r.spectators || []).some(v => v.token === token)) { code = r.code; break; }
    const entry = { res, code };
    clients.set(token, entry);
    if (code) { const st = rooms.get(code).seats.find(s => s && s.token === token); if (st) st.offlineAt = null; }
    send(token, 'hello', { code });
    if (code) broadcast(rooms.get(code));
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(ping);
      if (clients.get(token) === entry) {
        clients.delete(token);
        const r = entry.code && rooms.get(entry.code);
        if (r) {
          const st = r.seats.find(s => s && s.token === token);
          if (st) st.offlineAt = Date.now(); // ここから30秒は待つ
          setTimeout(() => { if (!online(token) && rooms.has(r.code)) broadcast(r); }, 1500);
          setTimeout(() => { if (!online(token) && rooms.has(r.code)) broadcast(r); }, GRACE_MS + 200); // ホストの引き継ぎ確認
        }
      }
    });
    return;
  }
  if (url.pathname === '/api' && req.method === 'POST') {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      let out;
      try {
        const msg = JSON.parse(body);
        const token = String(msg.token || '');
        if (!clients.has(token)) out = { error: '接続が切れています。再読み込みしてください' };
        else out = handle(token, msg);
      } catch (e) { console.error(e); out = { error: 'サーバーエラー' }; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  if (url.pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
  // 成績ページ（みんなで見られる管理表）・ルールのページと、成績の生データ
  if (url.pathname === '/stats' || url.pathname === '/rules') {
    return fs.readFile(path.join(PUBLIC, url.pathname.slice(1) + '.html'), (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' }); res.end(data);
    });
  }
  if (url.pathname === '/api/records') {
    records.list().then(list => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ enabled: records.enabled, records: list }));
    }).catch(() => { res.writeHead(500); res.end('{}'); });
    return;
  }
  // 静的ファイル
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC) || (PUBLIC === __dirname && (HIDDEN.has(path.basename(file)) || path.dirname(file) !== __dirname))) { res.writeHead(404); return res.end('not found'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// 放置された部屋の掃除（6時間）
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    const any = r.seats.some(s => s && !s.isBot && online(s.token));
    if (!any && now - r.lastActive > 6 * 3600 * 1000) rooms.delete(code);
  }
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`麻雀サーバー起動: http://localhost:${PORT}`));

// 四人麻雀 対局エンジン（友達麻雀ルール：ルール定義書 B-12〜B-19 / R-17〜R-43）
'use strict';
const crypto = require('crypto');
const Y = require('./yaku');
const R = require('./rules');

const kindOf = R.kindOf;
const WIND_NAMES = ['東', '南', '西', '北'];
const ROUND_WINDS = [27, 29]; // 常に東西場
const START_POINTS = 25000;
const RANK_CHIPS = [30, 10, -10, -30]; // 着順の祝儀（ポイントはなし）
const HONBA_POINTS = 1500;
const COLD_POINTS = 55000;
const CHOICE_SECONDS = 20;
const DEALER_SECONDS = 30; // 親を続けるか流すかの選択（時間切れは続行）

// 乱数の種（学習用：同じ種なら同じ山になる）
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng ? Math.floor(rng() * (i + 1)) : crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const sortTiles = arr => arr.slice().sort((a, b) => a - b);
const isYaochuKind = k => k >= 27 || k % 9 === 0 || k % 9 === 8;

class Game {
  /**
   * players: [{name, isBot}] 4人（席順 = 起家から）
   * onUpdate: 状態が変わった時に呼ばれる
   */
  constructor(players, opts, onUpdate) {
    this.players = players.map(p => ({ ...p }));
    this.gid = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); // 半荘ごとの目印（画面側で前の半荘と区別する）
    this.onUpdate = onUpdate || (() => {});
    this.seed = opts && opts.seed != null ? opts.seed : null;
    this.scores = [START_POINTS, START_POINTS, START_POINTS, START_POINTS];
    this.chips = [0, 0, 0, 0];
    this.kyoku = 0; // 親の席（東風戦のみ）
    this.honba = 0;
    this.kyotaku = 0; // リーチ棒の本数
    this.kyotakuChips = 0; // オープンリーチの供託祝儀
    this.gameOver = null;
    this.handNo = 0;
    this.startHand();
  }

  seatWind(seat) { return 27 + ((seat - this.kyoku + 4) % 4); }

  // ============ 局の開始 ============
  startHand(wall) {
    this.handNo++;
    const rng = this.seed != null ? mulberry32((this.seed * 1000003 + this.handNo * 7919 + this.kyoku * 31 + this.honba) | 0) : null;
    wall = wall ? wall.slice() : shuffle([...Array(136).keys()], rng);
    this.dead = wall.splice(0, 14);
    this.live = wall; // 122枚
    this.kanCount = 0;
    this.doraCount = 1;
    this.pocchiKinds = new Set();
    this.checkPocchiIndicator(this.dead[4]);
    this.hands = [[], [], [], []];
    this.melds = [[], [], [], []];
    this.discards = [[], [], [], []];
    this.discardKinds = [new Set(), new Set(), new Set(), new Set()];
    this.riichi = [0, 1, 2, 3].map(() => ({ state: 0, ippatsu: false, pending: false, open: false }));
    this.furitenTemp = [false, false, false, false];
    this.noCall = [false, false, false, false]; // 鳴きなし（局ごとに解除）
    this.furitenRiichi = [false, false, false, false];
    this.hasDiscarded = [false, false, false, false];
    this.pao = [0, 1, 2, 3].map(() => ({ dragon: null, wind: null }));
    this.anyCall = false;
    this.kuikae = null;
    this.result = null;
    this.choose = null;
    this.ready = new Set();
    this.extraIndicators = []; // 和了時に追加でめくった表示牌 [{omote, ura}]
    for (let r = 0; r < 3; r++) for (let s = 0; s < 4; s++) {
      this.hands[(this.kyoku + s) % 4].push(...this.live.splice(0, 4));
    }
    for (let s = 0; s < 4; s++) this.hands[(this.kyoku + s) % 4].push(this.live.shift());
    this.turn = this.kyoku;
    this.lastDiscard = null;
    this.claim = null;
    this.message = `東${this.kyoku + 1}局 ${this.honba}本場`;
    if (!this.replay) this.replay = [];
    this.replay.push({ title: this.message, steps: [] });
    this.drawTile(this.turn, false);
    this.snap('配牌');
  }

  // ============ 牌譜（1手ずつの記録） ============
  snap(ev) {
    if (!this.replay || !this.replay.length) return;
    const cur = this.replay[this.replay.length - 1];
    const d = this.discards.map(ds => ds.map(x => [x.tile, (x.riichi ? 1 : 0) | (x.tsumogiri ? 2 : 0) | (x.called ? 4 : 0) | (x.open ? 8 : 0)]));
    const step = {
      ev, turn: this.turn,
      h: this.hands.map((hd, i) => hd.filter(t => !(i === this.turn && t === this.drawn)).sort((a, b) => a - b)),
      dr: this.drawn != null && this.hands[this.turn] && this.hands[this.turn].includes(this.drawn) ? this.drawn : null,
      m: this.melds.map(ms => ms.map(x => ({ t: x.type, tiles: x.tiles.slice(), c: x.called, f: x.from }))),
      d, sc: this.scores.slice(), ch: this.chips.slice(),
      r: this.riichi.map(x => x.state > 0 ? (x.open ? 2 : 1) : 0),
      dora: this.omoteIndicators(), wall: this.live.length,
    };
    if (this.phase === 'result' && this.result) {
      const R0 = this.result;
      step.res = R0.type === 'agari'
        ? { type: 'agari', wins: R0.wins.map(w => ({ seat: w.seat, from: w.from, tsumo: w.tsumo, tile: w.tile, yaku: w.yaku, han: w.han, fu: w.fu, limit: w.limit, points: w.points, chips: w.chips, ura: w.ura, hand: w.hand, desc: w.desc, units: w.units, chipsDetail: w.chipsDetail })), delta: R0.delta, chipDelta: R0.chipDelta }
        : { type: 'draw', reason: R0.reason, tenpai: R0.tenpai, hands: R0.hands, delta: R0.delta, chipDelta: R0.chipDelta };
    }
    cur.steps.push(step);
  }

  recordAct(seat, action, prevPhase, prevResult, prevMelds) {
    const t = action.type;
    if (t === 'ready' || t === 'dealer' || t === 'noCall') return;
    if (prevPhase === 'claim') {
      if (this.phase === 'claim') return;
      const who = [0, 1, 2, 3].find(i => this.melds[i].length > prevMelds[i]);
      if (who != null) {
        const m = this.melds[who][this.melds[who].length - 1];
        this.snap(`${this.players[who].name} ${{ pon: 'ポン', chi: 'チー', minkan: '大明槓' }[m.type] || m.type}`);
      }
    } else if (!(['tsumo', 'choose'].includes(t) && (this.phase === 'choose' || this.phase === 'result'))) {
      this.snap(this.describeAct(seat, action, prevPhase));
    }
    if (this.phase === 'result' && this.result && this.result !== prevResult) {
      const R0 = this.result;
      this.snap(R0.type === 'agari'
        ? R0.wins.map(w => `${this.players[w.seat].name} ${w.tsumo ? 'ツモ' : 'ロン'}`).join('・')
        : (R0.reason || '流局'));
    }
  }

  describeAct(seat, a, prevPhase) {
    const nm = this.players[seat].name;
    const tn = (id) => tileName(kindOf(id));
    switch (a.type) {
      case 'discard': return `${nm} 打${tn(a.tile)}`;
      case 'riichi': return `${nm} ${a.open ? 'オープンリーチ' : 'リーチ'} 打${tn(a.tile)}`;
      case 'tsumo': return `${nm} ツモ`;
      case 'ron': return `${nm} ロン`;
      case 'pon': return `${nm} ポン`;
      case 'chi': return `${nm} チー`;
      case 'minkan': return `${nm} 大明槓`;
      case 'ankan': return `${nm} 暗槓（${tileName(a.kind)}）`;
      case 'kakan': return `${nm} 加槓（${tileName(a.kind)}）`;
      case 'choose': return `${nm} 和了の取り方を決定`;
      default: return `${nm} ${a.type}`;
    }
  }

  // 表ドラ・槓ドラにぽっちがめくれたら、その種類すべてがぽっち（R-33）
  checkPocchiIndicator(id) {
    const t = R.pocchiType(id, null);
    if (t) this.pocchiKinds.add(kindOf(id));
  }
  omoteIndicators() { return this.dead.slice(4, 4 + this.doraCount); }
  uraIndicators() { return this.dead.slice(9, 9 + this.doraCount); }

  // 和了時に追加でめくる槓ドラ1組（オープンリーチ・中ぽっち）
  takeExtraPair() {
    const idx = this.doraCount + this.extraIndicators.length;
    let pair;
    if (idx < 5) pair = { omote: this.dead[4 + idx], ura: this.dead[9 + idx] };
    else {
      const pool = this.live.length >= 2 ? this.live : this.dead.slice(this.kanCount, 4);
      pair = { omote: pool.pop(), ura: pool.pop() };
    }
    this.extraIndicators.push(pair);
    return pair;
  }

  drawTile(seat, rinshan) {
    let t;
    if (rinshan) {
      t = this.dead[this.kanCount - 1];
      this.live.pop();
    } else {
      t = this.live.shift();
    }
    this.hands[seat].push(t);
    this.drawn = t;
    this.turn = seat;
    this.phase = 'discard';
    this.rinshanFlag = !!rinshan;
    this.furitenTemp[seat] = false;
    // リーチ後に倍ぽっち・中ぽっちをツモったら必ず和了（R-21・R-26）
    const w = this.wildTypeFor(seat);
    if (w === 'bai' || w === 'chun') this.doTsumo(seat, w);
  }

  // ============ 補助 ============
  closedKinds(seat) { return this.hands[seat].map(kindOf); }
  isMenzen(seat) { return this.melds[seat].every(m => m.type === 'ankan'); }
  meldsForEval(seat) {
    return this.melds[seat].map(m => ({ type: m.type, kind: Math.min(...m.tiles.map(kindOf)) }));
  }
  waitsOf(seat, kinds) {
    return Y.getWaits(kinds || this.closedKinds(seat), this.melds[seat].length);
  }
  // オープンリーチで見せる「待ちの形」（例：2-5待ちなら34、5単騎なら5）
  openWaitInfo(seat) {
    let ids = this.hands[seat].slice();
    if (ids.length % 3 === 2 && this.drawn != null && ids.includes(this.drawn)) ids = ids.filter(t => t !== this.drawn);
    const kinds = ids.map(kindOf), mc = this.melds[seat].length;
    const waits = Y.getWaits(kinds, mc);
    const own = new Array(34).fill(0); kinds.forEach(k => own[k]++);
    // 隠せる面子・雀頭をできるだけ隠し、残りの牌だけで「すべての待ち」が説明できる一番少ない形を見せる
    // 例：2-5待ち（34＋東東）→ 34、延べ単 2345 → 2345、シャンポン 55＋東東 → 55東東、56778萬（6-9待ち）→ 78
    let chiitoiTanki = null, whole = false;
    for (const w of waits) {
      const c = own.slice(); c[w]++;
      if (Y.decompose(c).length) continue;
      if (mc === 0 && own[w] === 1 && Y.isChiitoi(c)) { (chiitoiTanki = chiitoiTanki || []).push(w); continue; }
      whole = true;
    }
    const common = !whole && !chiitoiTanki;
    // 面子（と雀頭）だけで完成しているか
    const complete = (c, needPair) => {
      const rec = (i, pair) => {
        while (i < 34 && c[i] === 0) i++;
        if (i >= 34) return pair === 0;
        if (pair && c[i] >= 2) { c[i] -= 2; const r = rec(i, 0); c[i] += 2; if (r) return true; }
        if (c[i] >= 3) { c[i] -= 3; const r = rec(i, pair); c[i] += 3; if (r) return true; }
        if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) { c[i]--; c[i + 1]--; c[i + 2]--; const r = rec(i, pair); c[i]++; c[i + 1]++; c[i + 2]++; if (r) return true; }
        return false;
      };
      return rec(0, needPair ? 1 : 0);
    };
    const hide = new Array(34).fill(0);
    if (common) {
      let best = null;
      const shownOk = (shown, pairHidden) => waits.every(w => { shown[w]++; const r = complete(shown, !pairHidden); shown[w]--; return r; });
      const hidden = new Array(34).fill(0);
      const rec = (i, pairHidden, nHidden) => {
        while (i < 34 && own[i] - hidden[i] === 0) i++;
        if (i >= 34) {
          const shown = own.map((n, k) => n - hidden[k]);
          if ((!best || nHidden > best.n) && shownOk(shown, pairHidden)) best = { n: nHidden, h: hidden.slice() };
          return;
        }
        const left = own[i] - hidden[i];
        if (!pairHidden && left >= 2) { hidden[i] += 2; rec(i, true, nHidden + 2); hidden[i] -= 2; }
        if (left >= 3) { hidden[i] += 3; rec(i, pairHidden, nHidden + 3); hidden[i] -= 3; }
        if (i < 27 && i % 9 <= 6 && own[i + 1] - hidden[i + 1] > 0 && own[i + 2] - hidden[i + 2] > 0) {
          hidden[i]++; hidden[i + 1]++; hidden[i + 2]++; rec(i, pairHidden, nHidden + 3); hidden[i]--; hidden[i + 1]--; hidden[i + 2]--;
        }
        // この種類の残りは見せることにして次の種類へ
        recNext(i + 1, pairHidden, nHidden);
      };
      const recNext = (i, pairHidden, nHidden) => {
        // i より前の種類はもう触らない
        if (i >= 34) { const shown = own.map((n, k) => n - hidden[k]); if ((!best || nHidden > best.n) && shownOk(shown, pairHidden)) best = { n: nHidden, h: hidden.slice() }; return; }
        rec(i, pairHidden, nHidden);
      };
      rec(0, false, 0);
      if (best) best.h.forEach((n, k) => { hide[k] = n; });
    }
    if (chiitoiTanki && !whole) return { waits, shape: ids.filter(t => chiitoiTanki.includes(kindOf(t))).sort((x, y) => x - y) };
    // 同じ種類の牌が何枚かあるときは、祝儀の枚数が少ない牌から見せる（例：45566索で4-7待ちなら、56の5は一番祝儀の少ない5）
    const val = (t) => { const fc = R.fiveColor(t); if (fc === 'rainbow') return R.BASE_VALUE['rainbow_' + R.SUIT_OF_FIVE[kindOf(t)]] || 0; if (fc) return R.BASE_VALUE[fc] || 0; return this.pocchiOf(t) ? R.BASE_VALUE.pocchi : 0; };
    const shape = [];
    const byKind = {};
    for (const t of ids) (byKind[kindOf(t)] = byKind[kindOf(t)] || []).push(t);
    for (const [k, ts] of Object.entries(byKind)) {
      ts.sort((x, y) => val(x) - val(y) || x - y);
      shape.push(...ts.slice(0, Math.max(0, ts.length - hide[+k])));
    }
    shape.sort((x, y) => x - y);
    return { waits, shape };
  }
  // オープンリーチの待ちを見せるか：宣言牌を切った時点（ほかの人がポン・チー・ロンを選ぶ前）から見せる
  openShown(i) { const r = this.riichi[i]; return (r.state > 0 && r.open) || (!!r.pending && !!r.pendingOpen); }
  // 全員が見えている牌（河・鳴いた牌・ドラ表示牌）から、その種類があと何枚残っているか
  visibleCounts() {
    const c = new Array(34).fill(0);
    for (const ds of this.discards) for (const d of ds) if (!d.called) c[kindOf(d.tile)]++;
    for (const ms of this.melds) for (const m of ms) for (const t of m.tiles) c[kindOf(t)]++;
    for (const t of this.omoteIndicators()) c[kindOf(t)]++;
    // オープンリーチで見せている待ちの形の牌も、全員に見えている
    for (let i = 0; i < 4; i++) if (this.openShown(i)) for (const t of this.openWaitInfo(i).shape) c[kindOf(t)]++;
    return c;
  }
  waitsWithLeft(waits, vis, extraKind) {
    return waits.map(k => ({ k, left: Math.max(0, 4 - vis[k] - (extraKind === k ? 1 : 0)) }));
  }
  // 自分の番：どの牌を切ると何待ちになるか（種類ごと）
  discardWaits(seat) {
    const out = {};
    const vis = this.visibleCounts();
    const kinds = this.closedKinds(seat);
    for (const k of new Set(kinds)) {
      const rest = kinds.slice(); rest.splice(rest.indexOf(k), 1);
      const w = this.waitsOf(seat, rest);
      if (w.length) {
        // f：切ったあとフリテンになるか（自分の河に待ち牌がある・切る牌そのものが待ち牌）
        out[k] = { w: this.waitsWithLeft(w, vis, k), f: w.some(x => x === k || this.discardKinds[seat].has(x)) };
      }
    }
    return out;
  }
  isFuriten(seat) {
    if (this.furitenTemp[seat] || this.furitenRiichi[seat]) return true;
    return this.waitsOf(seat).some(k => this.discardKinds[seat].has(k));
  }
  pocchiOf(id) { return R.pocchiType(id, this.pocchiKinds); }

  baseCtx(seat, isTsumo, extra = {}) {
    const r = this.riichi[seat];
    const noCalls = !this.anyCall;
    return {
      melds: this.meldsForEval(seat),
      isTsumo,
      riichi: r.state,
      openRiichi: r.open,
      ippatsu: r.ippatsu,
      seatWind: this.seatWind(seat),
      roundWinds: ROUND_WINDS,
      isDealer: seat === this.kyoku,
      haitei: isTsumo && this.live.length === 0 && !this.rinshanFlag,
      houtei: !isTsumo && this.live.length === 0 && !extra.chankan,
      rinshan: isTsumo && this.rinshanFlag,
      chankan: !!extra.chankan,
      tenhou: isTsumo && noCalls && seat === this.kyoku && !this.hasDiscarded[seat],
      chiihou: isTsumo && noCalls && seat !== this.kyoku && !this.hasDiscarded[seat],
      renhou: !isTsumo && noCalls && seat !== this.kyoku && !this.hasDiscarded[seat],
    };
  }

  // 役があるか（ドラなし）だけの簡易判定
  hasYakuWith(seat, closedKinds, winKind, isTsumo, extra) {
    const ctx = Object.assign(this.baseCtx(seat, isTsumo, extra), { closedKinds, winKind, doraKinds: [], uraKinds: [], akaCount: 0 });
    const r = Y.evaluate(ctx);
    return !!(r && r.hasYaku);
  }
  canWinNormal(seat, tile, isTsumo, extra) {
    const kinds = this.closedKinds(seat);
    if (!isTsumo) kinds.push(kindOf(tile));
    return this.hasYakuWith(seat, kinds, kindOf(tile), isTsumo, extra);
  }

  // ツモった牌がオールマイティか（R-21, R-25, R-26）
  wildTypeFor(seat) {
    const t = this.drawn;
    if (t == null || this.turn !== seat) return null;
    const type = this.pocchiOf(t);
    if (!type) return null;
    const rest = this.closedKinds(seat); rest.splice(rest.indexOf(kindOf(t)), 1);
    const waits = this.waitsOf(seat, rest);
    if (!waits.length) return null;
    if (type === 'bai' || type === 'chun') {
      if (this.riichi[seat].state > 0) return type;
      return null;
    }
    // 發ぽっち：役ありで聴牌
    for (const k of waits) if (this.hasYakuWith(seat, rest.concat([k]), k, true, {})) return 'hatsu';
    return null;
  }

  // オープンリーチの当たり牌（他家は捨てられない）
  forbiddenKinds(seat) {
    const out = new Set();
    for (let s = 0; s < 4; s++) {
      if (s === seat) continue;
      const r = this.riichi[s];
      if (r.state > 0 && r.open && !this.isFuriten(s)) for (const k of this.waitsOf(s)) out.add(k);
    }
    return out;
  }

  // ============ 行動の候補 ============
  actionsFor(seat) {
    if (this.gameOver && this.phase === 'result') return null;
    if (this.phase === 'result') {
      const a = {};
      if (this.result && this.result.needDealerChoice && !this.result.dealerChoiceMade && seat === this.kyoku) a.dealerChoice = true;
      if (!this.ready.has(seat)) a.ready = true;
      return Object.keys(a).length ? a : null;
    }
    if (this.phase === 'choose') {
      if (this.choose && this.choose.seat === seat) return { choose: true };
      return null;
    }
    if (this.phase === 'discard' && seat === this.turn) return this.discardActions(seat);
    if (this.phase === 'claim' && this.claim && this.claim.options[seat] && !(seat in this.claim.responses)) {
      return this.claim.options[seat];
    }
    return null;
  }

  discardActions(seat) {
    const a = {};
    const hand = this.hands[seat];
    const r = this.riichi[seat];
    const hasDraw = this.drawn != null;
    if (r.state) a.discard = [this.drawn];
    else {
      let list = hand.slice();
      if (this.kuikae) list = list.filter(t => !this.kuikae.includes(kindOf(t)));
      const forb = this.forbiddenKinds(seat);
      const ok = list.filter(t => !forb.has(kindOf(t)));
      a.discard = ok.length ? ok : list;
    }
    // ツモ和了（オールマイティ含む）
    if (hasDraw) {
      const wild = this.wildTypeFor(seat);
      if (wild) { a.tsumo = true; a.wild = wild; }
      else if (this.canWinNormal(seat, this.drawn, true, {})) a.tsumo = true;
    }
    // 立直・オープン立直
    if (!r.state && this.isMenzen(seat) && this.scores[seat] >= 1000 && this.live.length >= 4) {
      const riichiTiles = [];
      const kinds = this.closedKinds(seat);
      const tried = new Map();
      for (const t of a.discard) {
        const k = kindOf(t);
        if (!tried.has(k)) {
          const rest = kinds.slice(); rest.splice(rest.indexOf(k), 1);
          tried.set(k, this.waitsOf(seat, rest).length > 0);
        }
        if (tried.get(k)) riichiTiles.push(t);
      }
      if (riichiTiles.length) a.riichi = riichiTiles;
    }
    // 槓（1局4回まで）
    if (hasDraw && this.live.length > 0 && this.kanCount < 4) {
      const c = Y.toCounts(this.closedKinds(seat));
      const ankan = [];
      for (let k = 0; k < 34; k++) if (c[k] === 4) {
        if (r.state) {
          if (kindOf(this.drawn) !== k) continue;
          const before = this.closedKinds(seat); before.splice(before.indexOf(kindOf(this.drawn)), 1);
          const w1 = this.waitsOf(seat, before);
          const after = this.closedKinds(seat).filter(x => x !== k);
          const w2 = Y.getWaits(after, this.melds[seat].length + 1);
          if (w1.join() !== w2.join()) continue;
        }
        ankan.push(k);
      }
      if (ankan.length) a.ankan = ankan;
      if (!r.state) {
        const kakan = this.melds[seat].filter(m => m.type === 'pon' && c[kindOf(m.tiles[0])] > 0).map(m => kindOf(m.tiles[0]));
        if (kakan.length) a.kakan = kakan;
      }
    }
    return a;
  }

  // ============ 行動の実行 ============
  act(seat, action) {
    try {
      const prevPhase = this.phase, prevHandNo = this.handNo, prevResult = this.result;
      const prevMelds = this.melds.map(m => m.length);
      const ok = this._act(seat, action);
      if (ok !== false && action && prevHandNo === this.handNo) this.recordAct(seat, action, prevPhase, prevResult, prevMelds);
      if (ok !== false) this.onUpdate();
      return ok !== false;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  _act(seat, action) {
    // 鳴きなしの設定（いつでも切り替えられる。鳴きなしの人にはポン・チー・カンの選択肢を出さず、待たせない）
    if (action && action.type === 'noCall') {
      this.noCall[seat] = !!action.on;
      if (this.noCall[seat] && this.phase === 'claim' && this.claim && this.claim.options[seat] && !this.claim.options[seat].ron && !(seat in this.claim.responses)) {
        this.claim.responses[seat] = { type: 'pass' }; this.tryResolveClaim();
      }
      return true;
    }
    const avail = this.actionsFor(seat);
    if (!avail || !action) return false;
    const t = action.type;
    if (this.phase === 'result') {
      if (t === 'dealer' && avail.dealerChoice) { this.dealerDecide(!!action.cont); this.ready.add(seat); this.tryNextHand(); return true; }
      if (t !== 'ready' || !avail.ready) return false;
      this.ready.add(seat);
      this.tryNextHand();
      return true;
    }
    if (this.phase === 'choose') {
      if (t !== 'choose') return false;
      const i = action.index == null ? this.choose.defaultIndex : action.index;
      if (!(i >= 0 && i < this.choose.cands.length)) return false;
      this.finishChoose(i);
      return true;
    }
    if (this.phase === 'discard') {
      if (t === 'discard' || t === 'riichi') {
        const tile = action.tile;
        const list = t === 'riichi' ? avail.riichi : avail.discard;
        if (!list || !list.includes(tile)) return false;
        return this.doDiscard(seat, tile, t === 'riichi', !!action.open);
      }
      if (t === 'tsumo' && avail.tsumo) return this.doTsumo(seat, avail.wild || null);
      if (t === 'ankan' && avail.ankan && avail.ankan.includes(action.kind)) return this.doAnkan(seat, action.kind);
      if (t === 'kakan' && avail.kakan && avail.kakan.includes(action.kind)) return this.doKakan(seat, action.kind);
      return false;
    }
    if (this.phase === 'claim') {
      if (t === 'pass') { this.claim.responses[seat] = { type: 'pass' }; }
      else if (t === 'ron' && avail.ron) this.claim.responses[seat] = { type: 'ron' };
      else if (t === 'pon' && avail.pon && avail.pon.some(o => o.join() === (action.tiles || []).join())) this.claim.responses[seat] = { type: 'pon', tiles: action.tiles };
      else if (t === 'minkan' && avail.minkan) this.claim.responses[seat] = { type: 'minkan' };
      else if (t === 'chi' && avail.chi && avail.chi.some(o => o.join() === (action.tiles || []).join())) this.claim.responses[seat] = { type: 'chi', tiles: action.tiles };
      else return false;
      this.tryResolveClaim();
      return true;
    }
    return false;
  }

  doDiscard(seat, tile, riichi, open) {
    const hand = this.hands[seat];
    const r = this.riichi[seat];
    // オープンリーチの当たり牌を捨てるしかなかった（R-32：役満払い）
    const forced = !r.state && this.forbiddenKinds(seat).has(kindOf(tile));
    hand.splice(hand.indexOf(tile), 1);
    const tsumogiri = tile === this.drawn;
    this.drawn = null;
    this.kuikae = null;
    if (r.state) r.ippatsu = false;
    if (riichi) {
      r.pending = true;
      r.pendingOpen = !!open;
      r.pendingDouble = !this.anyCall && !this.hasDiscarded[seat];
    }
    this.hasDiscarded[seat] = true;
    this.discards[seat].push({ tile, riichi, open: !!(riichi && open), tsumogiri, called: false, forced });
    this.discardKinds[seat].add(kindOf(tile));
    this.lastDiscard = { seat, tile };
    this.rinshanFlag = false;
    this.openClaim(seat, tile, false, forced);
    return true;
  }

  openClaim(from, tile, isChankan, forced) {
    const k = kindOf(tile);
    const options = {};
    for (let s = 0; s < 4; s++) {
      if (s === from) continue;
      const o = {};
      if (isChankan === 'ankan') {
        if (!this.isFuriten(s) && this.kokushiWith(s, k)) o.ron = true;
      } else if (!this.isFuriten(s) && this.waitsOf(s).includes(k)) {
        if (this.canWinNormal(s, tile, false, { chankan: isChankan })) o.ron = true;
      }
      if (!isChankan && !this.riichi[s].state && !(this.noCall && this.noCall[s]) && this.live.length > 0) {
        const same = this.hands[s].filter(t => kindOf(t) === k);
        // 見た目が同じ牌（色なしの同じ種類）は1つの選択肢にまとめる。特殊な5・ぽっちは別の選択肢
        const vk = (t) => R.fiveColor(t) || this.pocchiOf(t) || 'n';
        if (same.length >= 2) {
          const variants = new Map();
          for (let i = 0; i < same.length; i++) for (let j = i + 1; j < same.length; j++) {
            const pair = [same[i], same[j]];
            const key = pair.map(vk).sort().join();
            if (!variants.has(key)) variants.set(key, pair);
          }
          const pon = [...variants.values()].filter(p => this.canDiscardAfterCall(s, p, [k]));
          if (pon.length) o.pon = pon;
        }
        if (same.length >= 3 && this.kanCount < 4) o.minkan = true;
        if (s === (from + 1) % 4 && k < 27) {
          const chi = [];
          const n = k % 9;
          const pats = [];
          if (n >= 2) pats.push([k - 2, k - 1]);
          if (n >= 1 && n <= 7) pats.push([k - 1, k + 1]);
          if (n <= 6) pats.push([k + 1, k + 2]);
          for (const [a, b] of pats) {
            const ta = this.hands[s].filter(t => kindOf(t) === a);
            const tb = this.hands[s].filter(t => kindOf(t) === b);
            if (!ta.length || !tb.length) continue;
            const seen = new Set();
            for (const x of ta) for (const y of tb) {
              const key = vk(x) + ',' + vk(y);
              if (seen.has(key)) continue;
              seen.add(key);
              const forbid = [k];
              const lo = Math.min(a, b, k);
              if (k === lo && (k % 9) <= 5) forbid.push(k + 3);
              if (k === lo + 2 && (lo % 9) >= 1) forbid.push(lo - 1);
              if (this.canDiscardAfterCall(s, [x, y], forbid)) chi.push([x, y]);
            }
          }
          if (chi.length) o.chi = chi;
        }
      }
      if (!o.ron && isChankan !== 'ankan' && this.waitsOf(s).includes(k)) {
        this.furitenTemp[s] = true;
        if (this.riichi[s].state) this.furitenRiichi[s] = true;
      }
      if (Object.keys(o).length) { o.pass = true; options[s] = o; }
    }
    this.claim = { from, tile, isChankan, forced: !!forced, options, responses: {} };
    this.phase = 'claim';
    this.tryResolveClaim();
  }

  canDiscardAfterCall(seat, used, forbidKinds) {
    const rest = this.hands[seat].filter(t => !used.includes(t));
    return rest.some(t => !forbidKinds.includes(kindOf(t)));
  }

  tryResolveClaim() {
    const c = this.claim;
    const seats = Object.keys(c.options).map(Number);
    // 誰かがロンしたら、ロンできない人（ポン・チーだけの人）の返事は待たない
    if (seats.some(s => c.responses[s] && c.responses[s].type === 'ron')) {
      for (const s of seats) if (!(s in c.responses) && !c.options[s].ron) c.responses[s] = { type: 'pass' };
    }
    if (!seats.every(s => s in c.responses)) return;
    for (const s of seats) {
      if (c.options[s].ron && c.responses[s].type !== 'ron') {
        this.furitenTemp[s] = true;
        if (this.riichi[s].state) this.furitenRiichi[s] = true;
      }
    }
    const order = [1, 2, 3].map(d => (c.from + d) % 4);
    const rons = order.filter(s => c.responses[s] && c.responses[s].type === 'ron');
    if (rons.length) {
      // 槍槓：加槓した牌はロンした人のもの。加槓はなかったことにしてポンに戻す（結果画面で牌が二重に見えないように）
      if (c.isChankan === true) {
        const m = this.melds[c.from].find(x => x.type === 'kakan' && x.added === c.tile);
        if (m) { m.type = 'pon'; m.tiles = m.tiles.filter(t => t !== c.tile); delete m.added; }
      }
      this.doRon(rons, c.from, c.tile, c.isChankan, c.forced); return;
    }
    if (c.isChankan === 'ankan') { this.claim = null; this.hands[c.from].push(c.tile); this.completeAnkan(c.from, kindOf(c.tile)); return; }
    if (c.isChankan) { this.claim = null; this.finishKakan(c.from); return; }
    const pk = order.find(s => c.responses[s] && (c.responses[s].type === 'pon' || c.responses[s].type === 'minkan'));
    this.establishRiichi(c.from);
    if (pk !== undefined) {
      const resp = c.responses[pk];
      if (resp.type === 'pon') this.doPon(pk, c.from, c.tile, resp.tiles);
      else this.doMinkan(pk, c.from, c.tile);
      return;
    }
    const chiSeat = order.find(s => c.responses[s] && c.responses[s].type === 'chi');
    if (chiSeat !== undefined) { this.doChi(chiSeat, c.from, c.tile, c.responses[chiSeat].tiles); return; }
    this.claim = null;
    this.afterDiscardPass(c.from);
  }

  establishRiichi(seat) {
    const r = this.riichi[seat];
    if (!r.pending) return;
    r.pending = false;
    r.state = r.pendingDouble ? 2 : 1;
    r.open = !!r.pendingOpen;
    r.ippatsu = true;
    this.scores[seat] -= 1000;
    this.kyotaku++;
    if (r.open) { this.chips[seat] -= 2; this.kyotakuChips += 2; }
  }

  afterDiscardPass(from) {
    if (this.live.length === 0) return this.exhaustiveDraw();
    this.drawTile((from + 1) % 4, false);
  }

  breakIppatsu() { for (const r of this.riichi) r.ippatsu = false; this.anyCall = true; }
  markCalled(from) { const d = this.discards[from]; d[d.length - 1].called = true; }

  // 包（大三元・大四喜）の判定
  checkPao(seat, from, k) {
    const kinds = this.melds[seat].filter(m => m.type !== 'chi').map(m => kindOf(m.tiles[0]));
    if (k >= 31 && kinds.filter(x => x >= 31).length === 3) this.pao[seat].dragon = from;
    if (k >= 27 && k <= 30 && kinds.filter(x => x >= 27 && x <= 30).length === 4) this.pao[seat].wind = from;
  }

  doPon(seat, from, tile, tiles) {
    this.claim = null;
    this.breakIppatsu();
    this.markCalled(from);
    for (const t of tiles) this.hands[seat].splice(this.hands[seat].indexOf(t), 1);
    this.melds[seat].push({ type: 'pon', tiles: [...tiles, tile], called: tile, from: (from - seat + 4) % 4 });
    this.checkPao(seat, from, kindOf(tile));
    this.kuikae = [kindOf(tile)];
    this.turn = seat; this.phase = 'discard'; this.drawn = null;
  }

  doChi(seat, from, tile, tiles) {
    this.claim = null;
    this.breakIppatsu();
    this.markCalled(from);
    for (const t of tiles) this.hands[seat].splice(this.hands[seat].indexOf(t), 1);
    const k = kindOf(tile);
    const lo = Math.min(k, ...tiles.map(kindOf));
    this.melds[seat].push({ type: 'chi', tiles: [tile, ...sortTiles(tiles)], called: tile, from: 3 });
    const forbid = [k];
    if (k === lo && (k % 9) <= 5) forbid.push(k + 3);
    if (k === lo + 2 && (lo % 9) >= 1) forbid.push(lo - 1);
    this.kuikae = forbid;
    this.turn = seat; this.phase = 'discard'; this.drawn = null;
  }

  doMinkan(seat, from, tile) {
    this.claim = null;
    this.breakIppatsu();
    this.markCalled(from);
    const k = kindOf(tile);
    const used = this.hands[seat].filter(t => kindOf(t) === k);
    this.hands[seat] = this.hands[seat].filter(t => kindOf(t) !== k);
    this.melds[seat].push({ type: 'minkan', tiles: [...used, tile], called: tile, from: (from - seat + 4) % 4 });
    this.checkPao(seat, from, k);
    this.addKan(seat);
    this.drawTile(seat, true);
  }

  // 国士無双の聴牌で、kを加えると国士無双になるか（暗槓の槍槓用）
  kokushiWith(seat, k) {
    if (this.melds[seat].length) return false;
    const ks = this.closedKinds(seat).concat([k]);
    const Yk = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
    return ks.length === 14 && ks.every(x => Yk.includes(x)) && Yk.every(x => ks.includes(x));
  }

  doAnkan(seat, k) {
    // 国士無双だけは暗槓でもロンできる（槍槓）
    const robbers = [0, 1, 2, 3].filter(s => s !== seat && !this.isFuriten(s) && this.kokushiWith(s, k));
    if (robbers.length) {
      const tile = this.hands[seat].filter(t => kindOf(t) === k).pop();
      this.hands[seat].splice(this.hands[seat].indexOf(tile), 1);
      this.drawn = null;
      this.openClaim(seat, tile, 'ankan', false);
      return true;
    }
    return this.completeAnkan(seat, k);
  }

  completeAnkan(seat, k) {
    this.breakIppatsu();
    const used = this.hands[seat].filter(t => kindOf(t) === k);
    this.hands[seat] = this.hands[seat].filter(t => kindOf(t) !== k);
    this.melds[seat].push({ type: 'ankan', tiles: used, from: 0 });
    this.addKan(seat);
    this.drawTile(seat, true);
    return true;
  }

  doKakan(seat, k) {
    const tile = this.hands[seat].find(t => kindOf(t) === k);
    this.hands[seat].splice(this.hands[seat].indexOf(tile), 1);
    const m = this.melds[seat].find(x => x.type === 'pon' && kindOf(x.tiles[0]) === k);
    m.type = 'kakan';
    m.tiles.push(tile);
    m.added = tile;
    this.drawn = null;
    this.openClaim(seat, tile, true, false);
    return true;
  }

  finishKakan(seat) {
    this.breakIppatsu();
    this.addKan(seat);
    this.drawTile(seat, true);
  }

  addKan() {
    this.kanCount++;
    this.doraCount = Math.min(5, 1 + this.kanCount);
    this.checkPocchiIndicator(this.dead[4 + this.doraCount - 1]);
  }

  // ============ 和了の評価（候補の列挙） ============
  /*
   winTile: 和了牌, isTsumo, opts: { wild: 'bai'|'hatsu'|'chun'|null, chankan, forced }
   戻り値: 候補の配列（役ありのものだけ）
  */
  winCandidates(seat, winTile, isTsumo, opts = {}) {
    const wild = opts.wild || null;
    const closedIds = isTsumo ? this.hands[seat].slice() : this.hands[seat].concat([winTile]);
    const meldIds = this.melds[seat].flatMap(m => m.tiles);
    const allIds = closedIds.concat(meldIds);
    const r = this.riichi[seat];
    const ctxBase = this.baseCtx(seat, isTsumo, { chankan: opts.chankan });
    const baseKinds = closedIds.filter(t => t !== (wild ? winTile : -1)).map(kindOf);
    const wildKinds = wild ? this.waitsOf(seat, baseKinds) : [null];

    // 変換できる5（赤・金・青）
    const convertible = allIds.filter(t => t !== (wild ? winTile : -1) && ['red', 'gold', 'blue'].includes(R.fiveColor(t)));
    const ownRainbow = new Set(allIds.filter(t => R.fiveColor(t) === 'rainbow').map(t => R.SUIT_OF_FIVE[kindOf(t)]));

    // 追加でめくる槓ドラ（オープンリーチ2組、中ぽっちで変える5がない1組）
    const extras = [];
    if (r.state > 0 && r.open) extras.push(this.takeExtraPair(), this.takeExtraPair());
    const nOpenExtra = extras.length;
    // 虹に変えられるのは手牌の赤・金・青の5だけで、その5と同じ種類の虹になる（すでにその虹を持っていたら不可）
    const chunConvert = wild === 'chun' && convertible.some(t => !ownRainbow.has(R.SUIT_OF_FIVE[kindOf(t)]));
    if (wild === 'chun' && !chunConvert) extras.push(this.takeExtraPair());
    // 追加でめくった表ドラ表示牌がぽっちなら、その種類も全部ぽっち（R-33。ふつうの表示牌と同じ扱い）
    for (const e of extras) this.checkPocchiIndicator(e.omote);
    let omote = this.omoteIndicators().concat(extras.map(e => e.omote));
    let ura = r.state > 0 ? this.uraIndicators().concat(extras.map(e => e.ura)) : [];
    const omoteAll = omote, uraAll = ura;
    // 中ぽっちを5として取ってその5を虹にした場合は、追加の槓ドラはめくらない（中ぽっちのぶんの1組を除いた表示牌）
    const omoteNoChun = this.omoteIndicators().concat(extras.slice(0, nOpenExtra).map(e => e.omote));
    const uraNoChun = r.state > 0 ? this.uraIndicators().concat(extras.slice(0, nOpenExtra).map(e => e.ura)) : [];

    // 変換の候補
    const convOpts = [];
    for (const t of convertible) { const s = R.SUIT_OF_FIVE[kindOf(t)]; if (!ownRainbow.has(s)) convOpts.push({ id: t, suit: s }); }


    const cands = [];
    const self = this;

    for (const wk of wildKinds) {
      // 中ぽっちを5として取るときは、その5（中ぽっち自身）も虹に変えられる（手牌の5を変えるのとどちらか、祝儀の多いほう）
      const wsuit = wk != null ? R.SUIT_OF_FIVE[wk] : null;
      const selfOpt = wild === 'chun' && wsuit && !ownRainbow.has(wsuit) ? { id: winTile, suit: wsuit, self: true } : null;
      omote = selfOpt && !chunConvert ? omoteNoChun : omoteAll; ura = selfOpt && !chunConvert ? uraNoChun : uraAll;
      const uraPocchi = ura.map(u => this.pocchiOf(u)); // 裏ドラ表示牌のぽっち（R-34）
      const closedKinds = wild ? baseKinds.concat([wk]) : closedIds.map(kindOf);
      const winKind = wild ? wk : kindOf(winTile);
      // 一番多い牌（暗槓含む）
      const cnt = Y.toCounts(closedKinds);
      for (const m of this.melds[seat]) if (m.type === 'ankan') cnt[kindOf(m.tiles[0])] += 4;
      const maxN = Math.max(...cnt);
      const mostKinds = []; for (let k = 0; k < 34; k++) if (cnt[k] === maxN && maxN > 0) mostKinds.push(k);

      // 裏ドラ表示牌ごとの選択肢
      const uraChoiceLists = ura.map((u, i) => {
        const pt = uraPocchi[i];
        if (pt === 'hatsu' || pt === 'chun') return mostKinds.map(k => ({ kind: k }));
        // 倍ぽっち：5を虹に変え、さらに一番多い牌を裏ドラに（変えられる5が残っていなければ裏ドラだけ）
        if (pt === 'bai') return convOpts.map(c => ({ conv: c })).concat([{ noConv: true }]).flatMap(c => mostKinds.map(k => ({ ...c, kind: k })));
        return [{ normal: true }];
      });
      // 中ぽっちを5として使ったときは、その中ぽっち自身を虹に変えることもできる
      const chunLists = wild === 'chun'
        ? (chunConvert || selfOpt ? convOpts.concat(selfOpt ? [selfOpt] : []).map(c => ({ conv: c })) : [{}])
        : [{}];

      // 直積
      const combos = [[]];
      const lists = [chunLists, ...uraChoiceLists];
      let prodCount = 1;
      for (const l of lists) prodCount *= Math.max(1, l.length);
      if (prodCount > 3000) { /* 念のための上限 */ lists.forEach((l, i) => { lists[i] = l.slice(0, 3); }); }
      let acc = [[]];
      for (const l of lists) {
        const next = [];
        for (const a of acc) for (const x of l) next.push(a.concat([x]));
        acc = next;
      }
      for (const combo of acc) {
        const chunChoice = combo[0];
        const uraChoices = combo.slice(1);
        const conversions = [];
        if (chunChoice.conv) conversions.push(chunChoice.conv);
        for (const u of uraChoices) if (u.conv) conversions.push(u.conv);
        // 変換の重複チェック（同じ牌・同じ虹は不可）
        if (new Set(conversions.map(c => c.id)).size !== conversions.length) continue;
        if (new Set(conversions.map(c => c.suit)).size !== conversions.length) continue;
        // 倍ぽっちで5を変えないのは、虹に変えられる5がもう残っていないときだけ
        if (uraChoices.some(u => u.noConv)) {
          const usedIds = new Set(conversions.map(c => c.id)), usedSuits = new Set(conversions.map(c => c.suit));
          if (convOpts.some(c => !usedIds.has(c.id) && !usedSuits.has(c.suit))) continue;
        }
        // 中ぽっち自身を虹にした場合は追加の槓ドラをめくらない
        const c = evalOne(wk, closedKinds, winKind, conversions, uraChoices);
        if (c) cands.push(c);
      }
    }

    function evalOne(wk, closedKinds, winKind, conversions, uraChoices) {
      const doraKinds = omote.map(t => Y.doraFromIndicator(kindOf(t)));
      const uraKinds = [];
      ura.forEach((u, i) => {
        const ch = uraChoices[i];
        if (ch.normal) uraKinds.push(Y.doraFromIndicator(kindOf(u)));
        else if (ch.kind != null) uraKinds.push(ch.kind);
      });
      const nonWild = allIds.filter(t => t !== (wild ? winTile : -1));
      const akaCount = nonWild.filter(t => R.fiveColor(t)).length + (conversions.some(c => c.self) ? 1 : 0); // 虹にした中ぽっちも特殊牌ドラ
      // 5はドラに扱えない：ぽっちを5として使っても、その牌はドラにならない（虹に変えたときは虹の5なのでドラ）
      const noDoraKind = wild && wk != null && R.SUIT_OF_FIVE[wk] && !conversions.some(c => c.self) ? wk : null;
      const ctx = Object.assign({}, ctxBase, { closedKinds, winKind, doraKinds, uraKinds, akaCount, noDoraKind });
      const res = Y.evaluate(ctx);
      if (!res || !res.hasYaku) return null;

      // 特殊牌の祝儀の単位
      const units = [];
      const unitLabels = [];
      const convMap = new Map(conversions.map(c => [c.id, c.suit]));
      const sixIds = { m: [], p: [], s: [] };
      for (const t of allIds) {
        if (wild && t === winTile) {
          units.push('pocchi'); unitLabels.push(R.POCCHI_NAME[wild]);
          // 5として取った中ぽっちを虹にしたときは、中ぽっちと虹の両方を数える
          if (convMap.has(t)) { units.push('rainbow_' + convMap.get(t)); unitLabels.push(R.RAINBOW_NAME[convMap.get(t)] + '(中ぽっち)'); }
          continue;
        }
        if (convMap.has(t)) { units.push('rainbow_' + convMap.get(t)); unitLabels.push(R.RAINBOW_NAME[convMap.get(t)] + '(変換)'); continue; }
        const fc = R.fiveColor(t);
        if (fc === 'rainbow') { const s = R.SUIT_OF_FIVE[kindOf(t)]; units.push('rainbow_' + s); unitLabels.push(R.RAINBOW_NAME[s]); continue; }
        if (fc) { units.push(fc); unitLabels.push(R.COLOR_NAME[fc] + '5'); continue; }
        const pt = self.pocchiOf(t);
        if (pt) { units.push('pocchi'); unitLabels.push(R.POCCHI_NAME[pt]); continue; }
        const k = kindOf(t);
        for (const s of ['m', 'p', 's']) if (k === R.SIX_KIND[s]) sixIds[s].push(t);
      }
      // オールマイティを6として使ったときも、色の付いた6になる
      if (wild && wk != null) for (const s of ['m', 'p', 's']) if (wk === R.SIX_KIND[s]) sixIds[s].push(winTile);
      // ドラ表示牌が特殊な5のときの6（R-31）
      let uraSixHits = 0;
      const rainbowHave = new Set(units.filter(u => u.startsWith('rainbow_')).map(u => u.slice(8)));
      for (const s of ['m', 'p', 's']) {
        if (!sixIds[s].length) continue;
        const srcs = [];
        omote.forEach(t => { if (kindOf(t) === R.FIVE_KIND[s]) srcs.push({ color: R.fiveColor(t), ura: false }); });
        ura.forEach((t, i) => { if (uraChoices[i].normal && kindOf(t) === R.FIVE_KIND[s]) srcs.push({ color: R.fiveColor(t), ura: true }); });
        if (!srcs.length) continue;
        // 同じ6に色が重なったら両方数える（例：裏に赤5筒と青5筒 → 6筒1枚で赤＋青）
        const plain = srcs.filter(x => x.color !== 'rainbow');
        const hasRainbow = srcs.some(x => x.color === 'rainbow') && !rainbowHave.has(s);
        // 裏の虹5で虹の効果を持つのは1枚だけ（残りの6はただの裏ドラなので、裏ドラの祝儀が付く）
        const rainbowFromUra = hasRainbow && !srcs.some(x => x.color === 'rainbow' && !x.ura);
        sixIds[s].forEach((t, i) => {
          // 虹の効果を持った6は虹だけ（赤・金・青とは複合しない）
          if (i === 0 && hasRainbow) { units.push('rainbow_' + s); unitLabels.push(R.RAINBOW_NAME[s] + '(6)'); rainbowHave.add(s); return; }
          for (const p of plain) { units.push(p.color); unitLabels.push(R.COLOR_NAME[p.color] + '6'); }
        });
        // 裏ドラの祝儀を数えない6：裏の赤・金・青で色が付いた6は全部、裏の虹で効果を持った6は1枚だけ
        uraSixHits += sixIds[s].length * plain.filter(x => x.ura).length + (rainbowFromUra ? 1 : 0);
      }
      const uraChips = Math.max(0, (res.uraHan || 0) - uraSixHits);
      for (let i = 0; i < uraChips; i++) { units.push('ura'); unitLabels.push('裏ドラ'); }
      if (res.yaku.some(y => y[0] === '一発')) { units.push('ippatsu'); unitLabels.push('一発'); }

      const forced = !!opts.forced;
      const chips = R.totalChips({
        units, han: res.han, yakumanCount: res.yakumanCount, isTsumo, quads: res.quads,
        yakuNames: res.yaku.map(y => y[0]), menzen: res.menzen, baiTsumo: wild === 'bai', forceYakuman: forced,
      });
      let base = res.base, limit = res.limit;
      if (forced && base < 8000) { base = 8000; limit = '役満払い'; }
      const descParts = [];
      if (wild) descParts.push(`${R.POCCHI_NAME[wild]}を${tileName(wk)}として`);
      for (const c of conversions) descParts.push(c.self ? `その${tileName(wk)}→${R.RAINBOW_NAME[c.suit]}` : `${R.COLOR_NAME[R.fiveColor(c.id)]}${tileName(kindOf(c.id))}→${R.RAINBOW_NAME[c.suit]}`);
      uraChoices.forEach(u => { if (u.kind != null) descParts.push(`裏ドラ=${tileName(u.kind)}`); });
      return {
        ind: { omote, ura },
        desc: descParts.join('・'), han: res.han, fu: res.fu, yaku: res.yaku, limit, yakuman: res.yakumanCount,
        yakumanNames: res.yakumanNames, base, chips: chips.total, chipsDetail: chips, units: unitLabels,
        wildKind: wk, conversions, forced,
      };
    }

    this._lastIndicators = { omote: omoteAll, ura: uraAll, extras };
    return cands;
  }

  // 候補の既定：祝儀が多い→点数が高い
  static defaultIndex(cands) {
    let bi = 0;
    cands.forEach((c, i) => {
      const b = cands[bi];
      if (c.chips > b.chips || (c.chips === b.chips && c.base > b.base)) bi = i;
    });
    return bi;
  }

  // ============ 和了 ============
  doTsumo(seat, wild) {
    const cands = this.winCandidates(seat, this.drawn, true, { wild });
    if (!cands.length) return false;
    const info = { seat, from: null, tsumo: true, tile: this.drawn, wild, cands, indicators: this._lastIndicators };
    this.startChoose([info]);
    return true;
  }

  doRon(seats, from, tile, isChankan, forced) {
    this.claim = null;
    this.riichi[from].pending = false; // 宣言牌でロンされたらリーチ不成立
    const infos = seats.map(seat => {
      const f = forced && this.riichi[seat].state > 0 && this.riichi[seat].open;
      const cands = this.winCandidates(seat, tile, false, { chankan: isChankan, forced: f });
      return { seat, from, tsumo: false, tile, wild: null, cands, indicators: this._lastIndicators };
    });
    this.startChoose(infos);
  }

  // 候補が複数あるときは和了者が選ぶ（R-28・R-34）。ダブロン以上は自動
  startChoose(infos) {
    // 祝儀も点数も他の候補以下の取り方は選ぶ意味がないので外す（祝儀が一番多い取り方が点数も一番高ければ自動で決まる）
    for (const inf of infos) {
      const cs = inf.cands;
      const keep = cs.filter((c, i) => !cs.some((d, j) => j !== i && d.chips >= c.chips && d.base >= c.base && (d.chips > c.chips || d.base > c.base || j < i)));
      if (keep.length) inf.cands = keep;
    }
    if (infos.length === 1 && infos[0].cands.length > 1) {
      const c = infos[0];
      this.choose = { seat: c.seat, infos, cands: c.cands, defaultIndex: Game.defaultIndex(c.cands), deadline: Date.now() + CHOICE_SECONDS * 1000 };
      this.phase = 'choose';
      return;
    }
    for (const inf of infos) inf.chosen = inf.cands[Game.defaultIndex(inf.cands)];
    this.settleWins(infos);
  }

  finishChoose(i) {
    const infos = this.choose.infos;
    infos[0].chosen = this.choose.cands[i];
    this.choose = null;
    this.settleWins(infos);
  }

  settleWins(infos) {
    const delta = [0, 0, 0, 0];
    const chipDelta = [0, 0, 0, 0];
    const busters = {}; // 支払った人 → 最初の受け取り手
    const pay = (from, to, pts, chips) => {
      delta[from] -= pts; delta[to] += pts;
      chipDelta[from] -= chips; chipDelta[to] += chips;
      if (!(from in busters)) busters[from] = to;
    };
    const wins = [];
    let dealerWon = false;
    infos.forEach((inf, idx) => {
      const c = inf.chosen;
      const seat = inf.seat;
      const isDealer = seat === this.kyoku;
      if (isDealer) dealerWon = true;
      const p = Y.payments(c.base, isDealer, inf.tsumo);
      const paoInfo = this.pao[seat];
      let paoSeat = null, paoMult = 0;
      if (c.yakumanNames && c.yakumanNames.includes('大三元') && paoInfo.dragon != null) { paoSeat = paoInfo.dragon; paoMult = 1; }
      if (c.yakumanNames && c.yakumanNames.includes('大四喜') && paoInfo.wind != null) { paoSeat = paoInfo.wind; paoMult = 2; }
      const honba = idx === 0 ? this.honba : 0;
      // 包：包の役満（大三元・大四喜）の分だけ包の人が責任を持つ。複合した残りの役満はふつうに払う
      const n = Math.max(1, c.yakuman || 0);
      const paoN = paoSeat != null ? paoMult : 0; // 大四喜はダブル役満なので2倍分
      const f = paoN / n;
      if (inf.tsumo) {
        const paoPay = Y.payments(8000 * paoN, isDealer, true);
        const restPay = Y.payments(c.base - 8000 * paoN, isDealer, true);
        const paoChipPer = c.chipsDetail.yakumanPart * f;
        for (let s = 0; s < 4; s++) {
          if (s === seat) continue;
          const isD = s === this.kyoku;
          const paoPts = paoN ? (isD ? paoPay.fromDealer : paoPay.fromOthers) : 0;
          const restPts = isD ? restPay.fromDealer : restPay.fromOthers;
          const hb = honba * HONBA_POINTS / 3;
          if (paoSeat == null) { pay(s, seat, restPts + hb, c.chips); continue; }
          if (f >= 1) { pay(paoSeat, seat, paoPts + hb, c.chips); continue; } // 包だけの役満：全部包の人
          pay(paoSeat, seat, paoPts, paoChipPer);
          pay(s, seat, restPts + hb, c.chips - paoChipPer);
        }
      } else {
        const hb = honba * HONBA_POINTS;
        if (paoSeat != null && paoSeat !== inf.from) {
          const paoPts = Y.payments(8000 * paoN, isDealer, false).ron;
          const restPts = p.ron - paoPts;
          const paoChips = c.chipsDetail.yakumanPart * f / 2;
          pay(paoSeat, seat, paoPts / 2, paoChips);
          pay(inf.from, seat, paoPts / 2 + restPts + hb, c.chips - paoChips);
        } else {
          pay(inf.from, seat, p.ron + hb, c.chips);
        }
      }
      if (idx === 0) {
        delta[seat] += this.kyotaku * 1000;
        chipDelta[seat] += this.kyotakuChips;
      }
      const hand = sortTiles((inf.tsumo ? this.hands[seat] : this.hands[seat]).filter(t => t !== inf.tile));
      wins.push({
        seat, from: inf.from, tsumo: inf.tsumo, tile: inf.tile, wild: inf.wild, hand,
        melds: this.melds[seat].map(m => ({ ...m, tiles: m.tiles.slice() })),
        han: c.han, fu: c.fu, yaku: c.yaku, limit: c.limit, yakuman: c.yakuman, desc: c.desc,
        points: this.pointsText(c.base, isDealer, inf.tsumo), chips: c.chips, units: c.units,
        chipsDetail: { special: c.chipsDetail.special, separate: c.chipsDetail.separate, oneHan: c.chipsDetail.oneHan },
        pao: paoSeat, dora: (c.ind || inf.indicators).omote, ura: (c.ind || inf.indicators).ura, wildKind: c.wildKind != null ? c.wildKind : null,
      });
    });
    this.kyotaku = 0;
    this.kyotakuChips = 0;
    this.finishHand({ type: 'agari', wins, delta, chipDelta, busters }, { dealerWon, draw: false });
  }

  pointsText(base, isDealer, tsumo) {
    const p = Y.payments(base, isDealer, tsumo);
    if (!tsumo) return `${p.ron}点`;
    if (isDealer) return `${p.fromOthers}点オール`;
    return `${p.fromOthers}-${p.fromDealer}点`;
  }

  // 手牌だけの祝儀（流し満貫用、R-35）
  handChips(seat) {
    const ids = this.hands[seat].concat(this.melds[seat].flatMap(m => m.tiles));
    const units = [];
    for (const t of ids) {
      const fc = R.fiveColor(t);
      if (fc === 'rainbow') units.push('rainbow_' + R.SUIT_OF_FIVE[kindOf(t)]);
      else if (fc) units.push(fc);
      else if (this.pocchiOf(t)) units.push('pocchi');
    }
    // ドラ表示牌が特殊な5なら、手牌の6も色の付いた牌として数える（R-31）
    const have = new Set(units.filter(u => u.startsWith('rainbow_')).map(u => u.slice(8)));
    const omote = this.omoteIndicators();
    for (const suit of ['m', 'p', 's']) {
      const sixes = ids.filter(t => kindOf(t) === R.SIX_KIND[suit]);
      if (!sixes.length) continue;
      const srcs = omote.filter(t => kindOf(t) === R.FIVE_KIND[suit]).map(t => R.fiveColor(t));
      const plain = srcs.filter(c => c !== 'rainbow');
      const rb = srcs.includes('rainbow') && !have.has(suit);
      sixes.forEach((t, i) => {
        if (i === 0 && rb) { units.push('rainbow_' + suit); have.add(suit); }
        for (const c of plain) units.push(c);
      });
    }
    const sp = R.specialChips(units);
    return sp.sum * sp.mult;
  }

  exhaustiveDraw() {
    const tenpai = [0, 1, 2, 3].map(s => this.waitsOf(s).length > 0);
    const delta = [0, 0, 0, 0];
    const chipDelta = [0, 0, 0, 0];
    const busters = {};
    // 流し満貫（倍満、ツモ払い）
    const nagashi = [0, 1, 2, 3].filter(s => this.discards[s].length > 0 && this.discards[s].every(d => isYaochuKind(kindOf(d.tile)) && !d.called) && this.melds[s].length === 0);
    let reason = '流局';
    if (nagashi.length) {
      reason = '流し満貫';
      for (const s of nagashi) {
        const p = Y.payments(4000, s === this.kyoku, true);
        const ch = this.handChips(s);
        for (let o = 0; o < 4; o++) {
          if (o === s) continue;
          const pts = o === this.kyoku ? p.fromDealer : p.fromOthers;
          delta[o] -= pts; delta[s] += pts;
          chipDelta[o] -= ch; chipDelta[s] += ch;
          if (!(o in busters)) busters[o] = s;
        }
      }
      // 供託は流し満貫の人がもらう（2人以上なら親の下家から順に近い人。親は最後）
      const getter = [1, 2, 3, 0].map(i => (this.kyoku + i) % 4).find(x => nagashi.includes(x));
      delta[getter] += this.kyotaku * 1000;
      chipDelta[getter] += this.kyotakuChips;
      this.kyotaku = 0;
      this.kyotakuChips = 0;
    } else {
      const n = tenpai.filter(Boolean).length;
      if (n > 0 && n < 4) for (let s = 0; s < 4; s++) delta[s] = tenpai[s] ? 3000 / n : -3000 / (4 - n);
    }
    const hands = tenpai.map((t, s) => t ? sortTiles(this.hands[s]) : null);
    this.finishHand({ type: 'ryuukyoku', reason, nagashi, tenpai, hands, melds: this.melds.map((ms, i) => tenpai[i] ? ms.map(m => ({ ...m, tiles: m.tiles.slice() })) : []), delta, chipDelta, busters }, { dealerWon: false, draw: true, dealerTenpai: tenpai[this.kyoku] || nagashi.includes(this.kyoku) });
  }

  finishHand(result, info) {
    for (let s = 0; s < 4; s++) { this.scores[s] += result.delta[s]; this.chips[s] += result.chipDelta[s]; }
    result.title = this.message;
    // トビ（B-18）：飛ばした人に10枚。ノーテン罰符でのトビは支払いなし
    const busted = [0, 1, 2, 3].filter(s => this.scores[s] < 0);
    result.bust = [];
    for (const b of busted) {
      const to = result.busters[b];
      if (to != null && to !== b) {
        this.chips[b] -= 10; this.chips[to] += 10;
        result.chipDelta[b] -= 10; result.chipDelta[to] += 10;
      }
      result.bust.push(b);
    }
    // コールド（B-17）
    const cold = [0, 1, 2, 3].filter(s => this.scores[s] >= COLD_POINTS);
    // 2人以上なら、点数が一番高い人だけがもらう（同点は起家に近い人）
    const coldWinner = cold.length ? this.rankOrder().find(s => cold.includes(s)) : null;
    if (coldWinner != null) for (const c of [coldWinner]) for (let s = 0; s < 4; s++) if (s !== c) {
      this.chips[s] -= 5; this.chips[c] += 5;
      result.chipDelta[s] -= 5; result.chipDelta[c] += 5;
    }
    result.cold = cold;
    delete result.busters;
    this.result = result;
    this.phase = 'result';
    this.ready = new Set();
    if (busted.length || cold.length) { result.endReason = busted.length ? 'トビ' : 'コールド'; this.endGame(); }
    else if (info.dealerWon || (info.draw && info.dealerTenpai)) {
      result.needDealerChoice = true;
      result.dealerChoiceMade = false;
      result.dealerDeadline = Date.now() + DEALER_SECONDS * 1000;
    } else {
      // 親が流れる：子の和了は0本場、親ノーテンは+1本場
      const honba = info.draw ? this.honba + 1 : 0;
      if (this.kyoku === 3) this.endGame();
      else this.nextState = { kyoku: this.kyoku + 1, honba };
    }
    result.scores = this.scores.slice();
    result.chips = this.chips.slice();
  }

  // 親の選択（B-19）
  dealerDecide(cont) {
    const r = this.result;
    if (!r || !r.needDealerChoice || r.dealerChoiceMade) return;
    r.dealerChoiceMade = true;
    r.dealerContinue = cont;
    if (cont) this.nextState = { kyoku: this.kyoku, honba: this.honba + 1 };
    else if (this.kyoku === 3) { r.endReason = '親が流して終局'; this.endGame(); }
    else this.nextState = { kyoku: this.kyoku + 1, honba: 0 };
    r.scores = this.scores.slice();
    r.chips = this.chips.slice();
  }

  endGame() {
    const top = this.rankOrder()[0];
    this.scores[top] += this.kyotaku * 1000;
    this.chips[top] += this.kyotakuChips;
    this.kyotaku = 0; this.kyotakuChips = 0;
    const final = this.rankOrder();
    final.forEach((seat, i) => { this.chips[seat] += RANK_CHIPS[i]; });
    this.gameOver = final.map((seat, i) => ({
      seat, name: this.players[seat].name, score: this.scores[seat], rank: i + 1,
      rankChips: RANK_CHIPS[i], chips: this.chips[seat],
    }));
    if (this.result) { this.result.scores = this.scores.slice(); this.result.chips = this.chips.slice(); }
  }

  rankOrder() {
    return [0, 1, 2, 3].sort((a, b) => this.scores[b] - this.scores[a] || a - b);
  }

  tryNextHand() {
    if (this.gameOver) return;
    if (this.result && this.result.needDealerChoice && !this.result.dealerChoiceMade) return;
    if (this.ready.size < 4) return;
    this.kyoku = this.nextState.kyoku;
    this.honba = this.nextState.honba;
    this.startHand();
  }

  // ============ 表示用データ ============
  viewFor(seat) {
    const base = {
      you: seat,
      players: this.players.map((p, i) => ({
        name: p.name, isBot: !!p.isBot, away: !!p.away, score: this.scores[i], chips: this.chips[i],
        wind: WIND_NAMES[(i - this.kyoku + 4) % 4], riichi: this.riichi[i].state > 0, open: this.riichi[i].open,
        openWaits: this.openShown(i) && this.phase !== 'result' ? this.openWaitInfo(i).waits : null,
        openShape: this.openShown(i) && this.phase !== 'result' ? this.openWaitInfo(i).shape : null,
        handCount: this.hands[i].length,
      })),
      round: { wind: '東', kyoku: this.kyoku + 1, honba: this.honba, kyotaku: this.kyotaku, kyotakuChips: this.kyotakuChips, dealer: this.kyoku, title: this.message },
      gid: this.gid,
      noCall: !!(seat >= 0 && this.noCall[seat]), // 鳴きなし（サーバーの状態を画面のチェックに合わせる）
      wall: this.live.length,
      dora: this.omoteIndicators(),
      pocchiKinds: [...this.pocchiKinds],
      hand: seat >= 0 ? this.hands[seat].filter(t => t !== this.drawn || this.turn !== seat) : null,
      drawn: seat >= 0 && this.turn === seat && this.drawn != null && this.hands[seat].includes(this.drawn) ? this.drawn : null,
      melds: this.melds,
      discards: this.discards,
      turn: this.turn,
      phase: this.phase,
      lastDiscard: this.lastDiscard,
      actions: seat >= 0 ? this.actionsFor(seat) : null,
      waits: seat >= 0 && this.phase !== 'result' && this.hands[seat].length % 3 === 1 ? this.waitsOf(seat) : [],
      waitsLeft: seat >= 0 && this.phase !== 'result' && this.hands[seat].length % 3 === 1 ? this.waitsWithLeft(this.waitsOf(seat), this.visibleCounts()) : [],
      discardWaits: seat >= 0 && this.phase === 'discard' && this.turn === seat && this.hands[seat].length % 3 === 2 ? this.discardWaits(seat) : null,
      furiten: seat >= 0 && this.hands[seat].length % 3 === 1 ? this.isFuriten(seat) : false,
      claimTile: this.phase === 'claim' && this.claim ? this.claim.tile : null,
      result: this.phase === 'result' ? this.result : null,
      ready: [...(this.ready || [])],
      gameOver: this.phase === 'result' ? this.gameOver : null,
      aka: true,
    };
    if (this.phase === 'choose' && this.choose) {
      base.choose = {
        seat: this.choose.seat, deadline: this.choose.deadline,
        cands: this.choose.seat === seat ? this.choose.cands.map(c => ({
          desc: c.desc, han: c.han, fu: c.fu, limit: c.limit, yakuman: c.yakuman, yaku: c.yaku, chips: c.chips,
          points: this.pointsText(c.base, this.choose.seat === this.kyoku, this.choose.infos[0].tsumo), base: c.base,
        })) : null,
        defaultIndex: this.choose.defaultIndex,
      };
    }
    return base;
  }
}

function tileName(k) {
  if (k == null) return '';
  if (k >= 27) return '東南西北白發中'[k - 27];
  return `${(k % 9) + 1}${'萬筒索'[Math.floor(k / 9)]}`;
}

// ============ ボット（AI） ============
// 打ち方のパラメータ（学習で調整する）
const BASE_BOT = {
  openRate: 0.3,        // リーチのうちオープンリーチにする割合
  keepSpecial: 2,       // 特殊な5を捨てにくくする重み
  keepPocchi: 1.5,      // ぽっちを捨てにくくする重み
  fold: 99,             // 他家リーチ時、自分の向聴数がこれ以上なら安全牌を切る（99=降りない）
  ponYakuhai: 1,        // 役牌をポンする確率
  dealerPassLead: Infinity, // 親がトップでこの点差以上なら親を流す（Infinity=常に続行）
  choose: 'chips',      // 和了の取り方：'chips'=祝儀優先 / 'value'=ポイント＋祝儀×2で最大
  chipWeight: 2,        // 'value' のときの祝儀1枚の価値（ポイント）
};

function candValue(game, seat, c, isTsumo, w) {
  const p = Y.payments(c.base, seat === game.kyoku, isTsumo);
  const pts = isTsumo ? (seat === game.kyoku ? p.fromOthers * 3 : p.fromDealer + p.fromOthers * 2) : p.ron;
  return pts / 1000 + w * c.chips * (isTsumo ? 3 : 1);
}

function botAction(game, seat, P) {
  P = P ? Object.assign({}, BASE_BOT, P) : BASE_BOT;
  const a = game.actionsFor(seat);
  if (!a) return null;
  if (game.phase === 'result') {
    if (a.dealerChoice) {
      const order = game.rankOrder();
      const lead = order[0] === seat ? game.scores[seat] - game.scores[order[1]] : -Infinity;
      return { type: 'dealer', cont: !(lead >= P.dealerPassLead) };
    }
    if (a.ready) return { type: 'ready' };
    return null;
  }
  if (game.phase === 'choose') {
    if (P.choose === 'value') {
      const ch = game.choose;
      let bi = 0, bv = -Infinity;
      ch.cands.forEach((c, i) => { const v = candValue(game, seat, c, ch.infos[0].tsumo, P.chipWeight); if (v > bv) { bv = v; bi = i; } });
      return { type: 'choose', index: bi };
    }
    return { type: 'choose', index: game.choose.defaultIndex };
  }
  if (game.phase === 'claim') {
    if (a.ron) return { type: 'ron' };
    if (a.pon) {
      const k = kindOf(game.claim.tile);
      if ((k >= 31 || k === game.seatWind(seat) || ROUND_WINDS.includes(k)) && Math.random() < P.ponYakuhai) return { type: 'pon', tiles: a.pon[0] };
    }
    return { type: 'pass' };
  }
  if (a.tsumo) return { type: 'tsumo' };
  const meldN = game.melds[seat].length;
  const kinds = game.closedKinds(seat);
  const cnt = Y.toCounts(kinds);
  const baseScore = (t) => {
    const k = kindOf(t);
    const rest = kinds.slice(); rest.splice(rest.indexOf(k), 1);
    const sh = Y.shanten(rest, meldN);
    let iso = 0;
    if (k >= 27) iso = cnt[k] === 1 ? -3 : 0;
    else {
      const n = k % 9;
      const near = (d) => (n + d >= 0 && n + d <= 8) ? cnt[k + d] : 0;
      iso = -(cnt[k] > 1 ? 0 : 1) - (near(-1) + near(1) + near(-2) + near(2) === 0 ? 2 : 0) + (n === 0 || n === 8 ? -0.5 : 0);
    }
    const special = (R.fiveColor(t) ? P.keepSpecial : 0) + (game.pocchiOf(t) ? P.keepPocchi : 0);
    return sh * 10 + iso + special + Math.random() * 0.1;
  };
  const choose = (list) => {
    let best = null, bestScore = Infinity;
    for (const t of list) { const sc = baseScore(t); if (sc < bestScore) { bestScore = sc; best = t; } }
    return best;
  };
  // 降り：他家リーチ中で手が遠いときは現物を優先
  const riichiers = [0, 1, 2, 3].filter(s => s !== seat && game.riichi[s].state > 0);
  if (riichiers.length && !game.riichi[seat].state && P.fold < 99 && a.discard) {
    const sh = Y.shanten(kinds, meldN) - 0; // 14枚の向聴
    if (sh >= P.fold) {
      let best = null, bestKey = null;
      for (const t of a.discard) {
        const k = kindOf(t);
        const safe = riichiers.filter(s => game.discardKinds[s].has(k)).length;
        const key = [-safe, baseScore(t)];
        if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) { bestKey = key; best = t; }
      }
      return { type: 'discard', tile: best };
    }
  }
  if (a.riichi) return { type: 'riichi', tile: choose(a.riichi), open: Math.random() < P.openRate };
  if (a.ankan && !game.riichi[seat].state) return { type: 'ankan', kind: a.ankan[0] };
  return { type: 'discard', tile: choose(a.discard) };
}

module.exports = { Game, botAction, BASE_BOT, kindOf, tileName, mulberry32 };

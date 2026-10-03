// 和了判定・役判定・符計算・点数計算
// 牌の種類(kind): 0-8 萬子, 9-17 筒子, 18-26 索子, 27東 28南 29西 30北 31白 32發 33中
'use strict';

const isHonor = k => k >= 27;
const isTerminal = k => k < 27 && (k % 9 === 0 || k % 9 === 8);
const isYaochu = k => isHonor(k) || isTerminal(k);
const suitOf = k => (k >= 27 ? 3 : Math.floor(k / 9));
const YAOCHU = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
const GREEN = new Set([19, 20, 21, 23, 25, 32]);

function toCounts(kinds) {
  const c = new Array(34).fill(0);
  for (const k of kinds) c[k]++;
  return c;
}

// 面子分解（頭 + n面子）を全列挙
function decompose(counts) {
  const results = [];
  const total = counts.reduce((a, b) => a + b, 0);
  if (total % 3 !== 2) return results;
  const c = counts.slice();
  const sets = [];
  const rec = (i) => {
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) { results.push(sets.slice()); return; }
    if (c[i] >= 3) {
      c[i] -= 3; sets.push({ type: 'koutsu', kind: i });
      rec(i);
      sets.pop(); c[i] += 3;
    }
    if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--; sets.push({ type: 'shuntsu', kind: i });
      rec(i);
      sets.pop(); c[i]++; c[i + 1]++; c[i + 2]++;
    }
  };
  const out = [];
  for (let p = 0; p < 34; p++) {
    if (c[p] >= 2) {
      c[p] -= 2;
      results.length = 0;
      rec(0);
      for (const r of results) out.push({ pair: p, sets: r.map(s => ({ ...s })) });
      c[p] += 2;
    }
  }
  return out;
}

function isKokushi(counts) {
  let pair = false;
  for (const k of YAOCHU) {
    if (counts[k] === 0) return false;
    if (counts[k] === 2) pair = true;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  return pair && total === 14;
}

// 七対子（4枚使いを認める：同じ牌4枚＝2対子）
function isChiitoi(counts) {
  let pairs = 0;
  for (let k = 0; k < 34; k++) {
    if (counts[k] === 2) pairs++;
    else if (counts[k] === 4) pairs += 2;
    else if (counts[k] !== 0) return false;
  }
  return pairs === 7;
}
function chiitoiQuads(counts) {
  let q = 0;
  for (let k = 0; k < 34; k++) if (counts[k] === 4) q++;
  return q;
}

// 形として和了っているか（役の有無は問わない）
function isAgariShape(counts, meldCount) {
  if (meldCount === 0 && (isKokushi(counts) || isChiitoi(counts))) return true;
  return decompose(counts).length > 0;
}

// 待ち牌（手牌13枚相当 + 副露数）
const _waitCache = new Map();
const _shantenCache = new Map();
function _cacheSet(m, k, v) { if (m.size > 300000) m.clear(); m.set(k, v); return v; }
function getWaits(kinds, meldCount, allKindsCountForFour) {
  if (!allKindsCountForFour) {
    const key = meldCount + ':' + kinds.slice().sort((x, y) => x - y).join(',');
    const hit = _waitCache.get(key);
    if (hit) return hit.slice();
    return _cacheSet(_waitCache, key, _getWaits(kinds, meldCount)).slice();
  }
  return _getWaits(kinds, meldCount, allKindsCountForFour);
}
function _getWaits(kinds, meldCount, allKindsCountForFour) {
  const c = toCounts(kinds);
  const waits = [];
  for (let k = 0; k < 34; k++) {
    const own = allKindsCountForFour ? allKindsCountForFour[k] : c[k];
    if (own >= 4) continue; // 自分で4枚使っている牌は待ちにならない
    c[k]++;
    if (isAgariShape(c, meldCount)) waits.push(k);
    c[k]--;
  }
  return waits;
}

// 向聴数（ボット用）
function shanten(kinds, meldCount) {
  const key = meldCount + ':' + kinds.slice().sort((x, y) => x - y).join(',');
  const hit = _shantenCache.get(key);
  if (hit !== undefined) return hit;
  return _cacheSet(_shantenCache, key, _shanten(kinds, meldCount));
}
function _shanten(kinds, meldCount) {
  const c = toCounts(kinds);
  let best = 8;
  // 七対子・国士
  if (meldCount === 0) {
    let pairs = 0, kinds7 = 0;
    for (let k = 0; k < 34; k++) { if (c[k] >= 2) pairs++; if (c[k] > 0) kinds7++; }
    best = Math.min(best, 6 - pairs + Math.max(0, 7 - kinds7));
    let y = 0, yp = 0;
    for (const k of YAOCHU) { if (c[k] > 0) y++; if (c[k] >= 2) yp = 1; }
    best = Math.min(best, 13 - y - yp);
  }
  const rec = (i, m, t, p) => {
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) {
      const mm = m + meldCount;
      let tt = t;
      if (mm + tt > 4) tt = 4 - mm;
      const s = 8 - 2 * mm - tt - p;
      if (s < best) best = s;
      return;
    }
    if (c[i] >= 3) { c[i] -= 3; rec(i, m + 1, t, p); c[i] += 3; }
    if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--; rec(i, m + 1, t, p); c[i]++; c[i + 1]++; c[i + 2]++;
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      if (!p) rec(i, m, t, 1);
      rec(i, m, t + 1, p);
      c[i] += 2;
    }
    if (i < 27 && i % 9 <= 7 && c[i + 1]) { c[i]--; c[i + 1]--; rec(i, m, t + 1, p); c[i]++; c[i + 1]++; }
    if (i < 27 && i % 9 <= 6 && c[i + 2]) { c[i]--; c[i + 2]--; rec(i, m, t + 1, p); c[i]++; c[i + 2]++; }
    c[i]--; rec(i, m, t, p); c[i]++;
  };
  rec(0, 0, 0, 0);
  return best;
}

function ceil100(x) { return Math.ceil(x / 100) * 100; }

const isKiriage = (han, fu) => (han === 4 && fu === 30) || (han === 3 && fu === 60);

function limitName(han, fu, yakumanCount) {
  if (yakumanCount > 0) return yakumanCount >= 3 ? (yakumanCount === 3 ? 'トリプル役満' : `${yakumanCount}倍役満`) : yakumanCount === 2 ? 'ダブル役満' : '役満';
  if (han >= 13) return '数え役満';
  if (han >= 11) return '三倍満';
  if (han >= 8) return '倍満';
  if (han >= 6) return '跳満';
  if (han >= 5) return '満貫';
  if (fu * Math.pow(2, han + 2) >= 2000 || isKiriage(han, fu)) return '満貫';
  return '';
}

function basePoints(han, fu, yakumanCount) {
  if (yakumanCount > 0) return 8000 * yakumanCount;
  if (han >= 13) return 8000;
  if (han >= 11) return 6000;
  if (han >= 8) return 4000;
  if (han >= 6) return 3000;
  if (han >= 5) return 2000;
  if (isKiriage(han, fu)) return 2000; // 切り上げ満貫
  return Math.min(2000, fu * Math.pow(2, han + 2));
}

// 支払い計算（本場・供託は含まない）
function payments(base, isDealer, isTsumo) {
  if (isTsumo) {
    if (isDealer) { const each = ceil100(base * 2); return { total: each * 3, fromDealer: 0, fromOthers: each }; }
    const d = ceil100(base * 2), o = ceil100(base);
    return { total: d + o * 2, fromDealer: d, fromOthers: o };
  }
  const t = ceil100(base * (isDealer ? 6 : 4));
  return { total: t, ron: t };
}

const doraFromIndicator = k => {
  if (k < 27) return Math.floor(k / 9) * 9 + ((k % 9) + 1) % 9;
  if (k <= 30) return 27 + ((k - 27) + 1) % 4;
  return 31 + ((k - 31) + 1) % 3;
};

/*
 ctx: {
   closedKinds: 手牌(和了牌込み)の種類配列
   melds: [{type:'chi'|'pon'|'minkan'|'ankan'|'kakan', kind}]  chiはkind=最小
   winKind, isTsumo, riichi(0/1/2 = なし/リーチ/ダブリー), ippatsu,
   seatWind(27-30), roundWind(27-30), isDealer,
   doraKinds:[], uraKinds:[], akaCount,
   haitei, houtei, rinshan, chankan, tenhou, chiihou
 }
*/
function evaluate(ctx) {
  const counts = toCounts(ctx.closedKinds);
  const melds = ctx.melds || [];
  const menzen = melds.every(m => m.type === 'ankan');
  const allCounts = counts.slice();
  for (const m of melds) {
    if (m.type === 'chi') { allCounts[m.kind]++; allCounts[m.kind + 1]++; allCounts[m.kind + 2]++; }
    else allCounts[m.kind] += 3; // 形判定用（槓子も3枚換算）
  }
  const candidates = [];

  // 共通の役（形に依存しない）
  const commonYaku = () => {
    const y = [];
    if (ctx.riichi === 2) y.push([ctx.openRiichi ? 'ダブルオープン立直' : 'ダブル立直', 2]);
    else if (ctx.riichi === 1) y.push([ctx.openRiichi ? 'オープン立直' : '立直', 1]);
    if (ctx.renhou) y.push(['人和', 8]);
    if (ctx.ippatsu && ctx.riichi) y.push(['一発', 1]);
    if (menzen && ctx.isTsumo) y.push(['門前清自摸和', 1]);
    if (ctx.haitei) y.push(['海底摸月', 1]);
    if (ctx.houtei) y.push(['河底撈魚', 1]);
    if (ctx.rinshan) y.push(['嶺上開花', 1]);
    if (ctx.chankan) y.push(['槍槓', 1]);
    return y;
  };

  const commonYakuman = () => {
    const y = [];
    if (ctx.tenhou) y.push(['天和', 1]);
    if (ctx.chiihou) y.push(['地和', 1]);
    return y;
  };

  const suitYaku = (y, cnt, open) => {
    const suits = new Set();
    let honor = false;
    for (let k = 0; k < 34; k++) if (cnt[k]) { if (isHonor(k)) honor = true; else suits.add(suitOf(k)); }
    if (suits.size === 1 && !honor) y.push(['清一色', open ? 5 : 6]);
    else if (suits.size === 1 && honor) y.push(['混一色', open ? 2 : 3]);
  };

  // 国士無双
  if (melds.length === 0 && isKokushi(counts)) {
    const ym = commonYakuman();
    ym.push(counts[ctx.winKind] === 2 ? ['国士無双十三面待ち', 2] : ['国士無双', 1]);
    candidates.push({ yakuman: ym, yaku: [], fu: 0 });
  }

  // 七対子
  if (melds.length === 0 && isChiitoi(counts)) {
    const ym = commonYakuman();
    let allHonor = true;
    for (let k = 0; k < 34; k++) if (counts[k] && !isHonor(k)) allHonor = false;
    if (allHonor) ym.push(['字一色', 1]);
    const quads = chiitoiQuads(counts);
    if (ym.length) candidates.push({ yakuman: ym, yaku: [], fu: 25 });
    else {
      const y = commonYaku();
      y.push(['七対子', 2]);
      if (quads) y.push([`七対子4枚使い${quads}組`, 4 * quads]);
      if (counts.every((v, k) => !v || !isYaochu(k))) y.push(['断幺九', 1]);
      if (counts.every((v, k) => !v || isYaochu(k))) y.push(['混老頭', 2]);
      suitYaku(y, counts, false);
      candidates.push({ yakuman: [], yaku: y, fu: 25, quads });
    }
  }

  // 通常形
  for (const d of decompose(counts)) {
    // 和了牌がどのブロックに入るか
    const waitsOptions = [];
    if (d.pair === ctx.winKind) waitsOptions.push({ idx: -1, wait: 'tanki' });
    d.sets.forEach((s, idx) => {
      if (s.type === 'koutsu' && s.kind === ctx.winKind) waitsOptions.push({ idx, wait: 'shanpon' });
      if (s.type === 'shuntsu' && ctx.winKind >= s.kind && ctx.winKind <= s.kind + 2) {
        const pos = ctx.winKind - s.kind;
        let w;
        if (pos === 1) w = 'kanchan';
        else if (pos === 0) w = (s.kind % 9 === 6) ? 'penchan' : 'ryanmen';
        else w = (s.kind % 9 === 0) ? 'penchan' : 'ryanmen';
        waitsOptions.push({ idx, wait: w });
      }
    });
    for (const wo of waitsOptions) {
      candidates.push(evalStandard(d, wo, ctx, melds, menzen, counts, allCounts, commonYaku, commonYakuman, suitYaku));
    }
  }

  if (!candidates.length) return null;

  // 最高点のものを選ぶ
  let best = null;
  for (const c of candidates) {
    const ymCount = c.yakuman.reduce((a, b) => a + b[1], 0);
    let han = c.yaku.reduce((a, b) => a + b[1], 0);
    const hasYaku = ymCount > 0 || han > 0;
    let dora = 0, ura = 0;
    if (ymCount === 0 && hasYaku) {
      for (const dk of ctx.doraKinds || []) dora += countAll(counts, melds, dk);
      if (ctx.riichi) for (const uk of ctx.uraKinds || []) ura += countAll(counts, melds, uk);
    }
    const yakuList = ymCount > 0 ? c.yakuman.map(([n, v]) => [n, v * 13]) : c.yaku.slice();
    if (ymCount === 0 && hasYaku) {
      // 表ドラと特殊牌（赤・金・青・虹など）のドラは、まとめて「ドラ」と表示する
      if (dora + (ctx.akaCount || 0)) yakuList.push(['ドラ', dora + (ctx.akaCount || 0)]);
      if (ura) yakuList.push(['裏ドラ', ura]);
      han += dora + (ctx.akaCount || 0) + ura;
    }
    const base = hasYaku ? basePoints(han, c.fu, ymCount) : 0;
    const r = { hasYaku, han, fu: c.fu, yakumanCount: ymCount, yaku: yakuList, base, limit: limitName(han, c.fu, ymCount),
      menzen, uraHan: ura, doraHan: dora, quads: ymCount ? 0 : (c.quads || 0), yakumanNames: c.yakuman.map(x => x[0]) };
    if (!best || r.base > best.base || (r.base === best.base && r.han > best.han)) best = r;
  }
  return best;
}

function countAll(counts, melds, k) {
  let n = counts[k];
  for (const m of melds) {
    if (m.type === 'chi') { if (k >= m.kind && k <= m.kind + 2) n++; }
    else if (m.kind === k) n += (m.type === 'pon' ? 3 : 4);
  }
  return n;
}

function evalStandard(d, wo, ctx, melds, menzen, counts, allCounts, commonYaku, commonYakuman, suitYaku) {
  // 全面子リスト
  const sets = d.sets.map((s, i) => ({
    type: s.type, kind: s.kind,
    concealed: !(i === wo.idx && s.type === 'koutsu' && !ctx.isTsumo), // ロンで完成した刻子は明刻扱い
    kan: false, open: false,
  }));
  for (const m of melds) {
    if (m.type === 'chi') sets.push({ type: 'shuntsu', kind: m.kind, concealed: false, kan: false, open: true });
    else if (m.type === 'pon') sets.push({ type: 'koutsu', kind: m.kind, concealed: false, kan: false, open: true });
    else if (m.type === 'ankan') sets.push({ type: 'koutsu', kind: m.kind, concealed: true, kan: true, open: false });
    else sets.push({ type: 'koutsu', kind: m.kind, concealed: false, kan: true, open: true });
  }
  const pair = d.pair;
  const kou = sets.filter(s => s.type === 'koutsu');
  const shun = sets.filter(s => s.type === 'shuntsu');
  const seat = ctx.seatWind;
  const rounds = ctx.roundWinds || [ctx.roundWind];
  const isYakuhaiPair = pair >= 31 || pair === seat || rounds.includes(pair);

  // 役満
  const ym = commonYakuman();
  const ankouCount = kou.filter(s => s.concealed).length;
  if (ankouCount === 4) ym.push(wo.wait === 'tanki' ? ['四暗刻単騎', 2] : ['四暗刻', 1]);
  const dragonKou = kou.filter(s => s.kind >= 31).length;
  if (dragonKou === 3) ym.push(['大三元', 1]);
  const windKou = kou.filter(s => s.kind >= 27 && s.kind <= 30).length;
  if (windKou === 4) ym.push(['大四喜', 2]);
  else if (windKou === 3 && pair >= 27 && pair <= 30) ym.push(['小四喜', 1]);
  let allHonor = true, allTerm = true, allGreen = true;
  for (let k = 0; k < 34; k++) if (allCounts[k]) {
    if (!isHonor(k)) allHonor = false;
    if (!isTerminal(k)) allTerm = false;
    if (!GREEN.has(k)) allGreen = false;
  }
  if (allHonor) ym.push(['字一色', 1]);
  if (allTerm) ym.push(['清老頭', 1]);
  if (allGreen) ym.push(['緑一色', 1]);
  if (sets.filter(s => s.kan).length === 4) ym.push(['四槓子', 1]);
  if (melds.length === 0) {
    // 九蓮宝燈
    const sts = new Set(); let honor = false;
    for (let k = 0; k < 34; k++) if (counts[k]) { if (isHonor(k)) honor = true; else sts.add(suitOf(k)); }
    if (!honor && sts.size === 1) {
      const s0 = [...sts][0] * 9;
      const need = [3, 1, 1, 1, 1, 1, 1, 1, 3];
      let ok = true, extra = -1;
      for (let i = 0; i < 9; i++) {
        const diff = counts[s0 + i] - need[i];
        if (diff < 0) { ok = false; break; }
        if (diff === 1) extra = s0 + i;
      }
      if (ok) ym.push((extra === ctx.winKind ? ['純正九蓮宝燈', 2] : ['九蓮宝燈', 1]));
    }
  }
  if (ym.length) return { yakuman: ym, yaku: [], fu: 0 };

  // 通常役
  const y = commonYaku();
  const open = !menzen;
  const pinfu = menzen && shun.length === 4 && !isYakuhaiPair && wo.wait === 'ryanmen';
  if (pinfu) y.push(['平和', 1]);
  let tanyao = true;
  for (let k = 0; k < 34; k++) if (allCounts[k] && isYaochu(k)) tanyao = false;
  if (tanyao) y.push(['断幺九', 1]);
  // 役牌
  for (const s of kou) {
    if (s.kind === 31) y.push(['役牌 白', 1]);
    if (s.kind === 32) y.push(['役牌 發', 1]);
    if (s.kind === 33) y.push(['役牌 中', 1]);
    if (s.kind === seat) y.push(['自風 ' + '東南西北'[seat - 27], 1]);
    for (const r of rounds) if (s.kind === r) y.push(['場風 ' + '東南西北'[r - 27], 1]);
  }
  // 一盃口・二盃口
  if (menzen) {
    const cs = d.sets.filter(s => s.type === 'shuntsu').map(s => s.kind).sort((a, b) => a - b);
    let peiko = 0;
    const used = new Array(cs.length).fill(false);
    for (let i = 0; i < cs.length; i++) {
      if (used[i]) continue;
      for (let j = i + 1; j < cs.length; j++) {
        if (!used[j] && cs[i] === cs[j]) { used[i] = used[j] = true; peiko++; break; }
      }
    }
    if (peiko === 2) y.push(['二盃口', 3]);
    else if (peiko === 1) y.push(['一盃口', 1]);
  }
  // 三色同順・一気通貫
  const shunKinds = new Set(shun.map(s => s.kind));
  for (let n = 0; n <= 6; n++) {
    if (shunKinds.has(n) && shunKinds.has(n + 9) && shunKinds.has(n + 18)) { y.push(['三色同順', open ? 1 : 2]); break; }
  }
  for (let st = 0; st < 3; st++) {
    if (shunKinds.has(st * 9) && shunKinds.has(st * 9 + 3) && shunKinds.has(st * 9 + 6)) { y.push(['一気通貫', open ? 1 : 2]); break; }
  }
  // 三色同刻
  const kouKinds = new Set(kou.map(s => s.kind));
  for (let n = 0; n < 9; n++) {
    if (kouKinds.has(n) && kouKinds.has(n + 9) && kouKinds.has(n + 18)) { y.push(['三色同刻', 2]); break; }
  }
  // 対々和・三暗刻・三槓子
  if (kou.length === 4) y.push(['対々和', 2]);
  if (ankouCount === 3) y.push(['三暗刻', 2]);
  if (sets.filter(s => s.kan).length === 3) y.push(['三槓子', 2]);
  // 小三元
  if (dragonKou === 2 && pair >= 31) y.push(['小三元', 2]);
  // 混老頭 / チャンタ / 純チャン
  let allYaochu = true;
  for (let k = 0; k < 34; k++) if (allCounts[k] && !isYaochu(k)) allYaochu = false;
  if (allYaochu) y.push(['混老頭', 2]);
  else {
    const blockHasYaochu = s => s.type === 'shuntsu' ? (s.kind % 9 === 0 || s.kind % 9 === 6) : isYaochu(s.kind);
    if (sets.every(blockHasYaochu) && isYaochu(pair) && shun.length > 0) {
      const hasHonor = sets.some(s => isHonor(s.kind)) || isHonor(pair);
      if (hasHonor) y.push(['混全帯幺九', open ? 1 : 2]);
      else y.push(['純全帯幺九', open ? 2 : 3]);
    }
  }
  suitYaku(y, allCounts, open);

  // 符計算
  let fu;
  if (pinfu) fu = ctx.isTsumo ? 20 : 30;
  else {
    fu = 20;
    if (menzen && !ctx.isTsumo) fu += 10;
    if (ctx.isTsumo) fu += 2;
    for (const s of kou) {
      let f = isYaochu(s.kind) ? 4 : 2;
      if (s.concealed) f *= 2;
      if (s.kan) f *= 4;
      fu += f;
    }
    if (pair >= 31) fu += 2;
    if (pair === seat) fu += 2;
    for (const r of rounds) if (pair === r) fu += 2;
    if (wo.wait === 'kanchan' || wo.wait === 'penchan' || wo.wait === 'tanki') fu += 2;
    fu = Math.ceil(fu / 10) * 10;
    if (fu === 20) fu = 30; // 鳴き平和形
  }
  return { yakuman: [], yaku: y, fu };
}

module.exports = {
  isHonor, isTerminal, isYaochu, toCounts, decompose, isAgariShape, getWaits, shanten,
  evaluate, payments, doraFromIndicator, ceil100, YAOCHU, isChiitoi, isKokushi,
};

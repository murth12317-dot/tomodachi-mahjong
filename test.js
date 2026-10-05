// 役・点数・祝儀の単体テスト + ボット同士の対局シミュレーション
'use strict';
const assert = require('assert');
const Y = require('../yaku');
const R = require('../rules');
const { Game, botAction, kindOf } = require('../game');

// "123m456p789s11z" 形式 → kind配列
function parse(str) {
  const out = [];
  let buf = [];
  for (const ch of str) {
    if (/[0-9]/.test(ch)) buf.push(+ch);
    else {
      const base = { m: 0, p: 9, s: 18, z: 27 }[ch];
      for (const n of buf) out.push(base + (ch === 'z' ? n - 1 : (n === 0 ? 4 : n - 1)));
      buf = [];
    }
  }
  return out;
}
const ctx = (hand, win, extra = {}) => Object.assign({
  closedKinds: parse(hand), melds: [], winKind: parse(win)[0], isTsumo: false, riichi: 0, ippatsu: false,
  seatWind: 28, roundWinds: [27, 29], isDealer: false, doraKinds: [], uraKinds: [], akaCount: 0,
}, extra);
const names = r => r.yaku.map(y => y[0]).sort().join(',');
let r;

// ---- 基本 ----
r = Y.evaluate(ctx('123m456p789s234s55p', '4s'));
assert.strictEqual(names(r), '平和'); assert.strictEqual(r.fu, 30);
r = Y.evaluate(ctx('123m456p789s234s55p', '4s', { isTsumo: true, riichi: 1 }));
assert.strictEqual(r.fu, 20); assert.strictEqual(r.han, 3);
assert.strictEqual(Y.evaluate(ctx('123m456p789s234s19m', '2m')), null);

// ---- 東西場（B-15）：西が場風、西家なら連風 ----
r = Y.evaluate(ctx('333z123m456p789s11p', '1p'));
assert.ok(names(r).includes('場風 西'), names(r));
r = Y.evaluate(ctx('333z123m456p789s11p', '1p', { seatWind: 29 }));
assert.strictEqual(r.yaku.filter(y => y[0].includes('西')).length, 2);
// 平和：西の雀頭は役牌扱い
r = Y.evaluate(ctx('123m456p789s234s33z', '4s'));
assert.ok(!names(r).includes('平和'));

// ---- 七対子の4枚使い（R-30） ----
r = Y.evaluate(ctx('1111m22p33p44s55s66s', '6s'));
assert.ok(names(r).includes('七対子4枚使い1組'), names(r));
r = Y.evaluate(ctx('1111m2222p33s44s55s', '5s'));
const q2 = r.yaku.find(y => y[0].startsWith('七対子4枚使い'));
assert.ok(q2 && q2[1] === 8 && r.quads === 2, JSON.stringify(r.yaku));
assert.deepStrictEqual(Y.getWaits(parse('111m22p33p44s55s66s'), 0), parse('1m23p'));

// ---- ダブル役満・トリプル役満（R-29） ----
r = Y.evaluate(ctx('19m19p19s1234567z1z', '1z'));
assert.strictEqual(r.yakumanCount, 2); // 国士13面
r = Y.evaluate(ctx('19m19p19s1234567z1z', '7z'));
assert.strictEqual(r.yakumanCount, 1);
r = Y.evaluate(ctx('111m222p333s444z55z', '5z', { isTsumo: true }));
assert.strictEqual(r.yakumanCount, 2); // 四暗刻単騎
r = Y.evaluate(ctx('111z222z333z444z55z', '5z', { isTsumo: true }));
assert.ok(r.yakumanCount >= 3, r.yakumanCount); // 四暗刻単騎＋字一色＋大四喜
assert.strictEqual(r.base, 8000 * r.yakumanCount);
assert.strictEqual(Y.payments(8000 * 2, false, false).ron, 64000);
r = Y.evaluate(ctx('111z222z333z444z55p', '4z'));
assert.strictEqual(r.yakumanCount, 2); // 大四喜はダブル役満
r = Y.evaluate(ctx('11123455678999m', '5m', { isTsumo: true }));
assert.strictEqual(r.yakumanCount, 2); // 純正九蓮宝燈はダブル役満
r = Y.evaluate(ctx('11123455678999m', '9m', { isTsumo: true }));
assert.strictEqual(r.yakumanCount, 1); // 普通の九蓮宝燈

// ---- 切り上げ満貫（R-41） ----
r = Y.evaluate(ctx('234m456p678s22s', '2s', { melds: [{ type: 'pon', kind: parse('3m')[0] }], doraKinds: parse('2s3m'), akaCount: 0 }));
// 喰いタン1 + ドラ(2s×3=3, 3m×3=3) → 7翻なので切り上げの確認は別で
assert.strictEqual(Y.payments(2000, false, false).ron, 8000);
{
  // 3翻60符：ドラ2＋役牌、暗刻多め → 直接basePointsを確認
  const hand = ctx('111z999m111p22s345m', '3m', { doraKinds: parse('1p'), isTsumo: false });
  const rr = Y.evaluate(hand);
  assert.ok(rr);
}

// ---- 人和（R-38） ----
r = Y.evaluate(ctx('123m456p789s234s55p', '4s', { renhou: true }));
assert.strictEqual(r.han, 9); // 人和8＋平和1
assert.strictEqual(r.limit, '倍満');
r = Y.evaluate(ctx('123m456p789s234s55p', '4s', { renhou: true, doraKinds: parse('1m2m') }));
assert.strictEqual(r.limit, '三倍満');

// ---- オープン立直 ----
r = Y.evaluate(ctx('123m456p789s234s55p', '4s', { riichi: 1, openRiichi: true }));
assert.ok(names(r).includes('オープン立直'));
console.log('役・点数テスト OK');

// ---- 祝儀の計算（定義書の例） ----
const T = (units, o = {}) => R.totalChips(Object.assign({ units, han: 4, yakumanCount: 0, isTsumo: false, quads: 0, yakuNames: [], menzen: true, baiTsumo: false }, o)).total;
assert.strictEqual(T(['gold', 'red']), 3);                               // R-20
assert.strictEqual(T(['rainbow_s', 'red']), 4);                          // 虹5索
assert.strictEqual(T(['rainbow_s', 'red', 'pocchi'], { baiTsumo: true, isTsumo: true }), 16);
assert.strictEqual(T(['red', 'gold', 'gold', 'pocchi'], { baiTsumo: true, isTsumo: true }), 14); // R-21
assert.strictEqual(T(['red', 'gold', 'gold', 'rainbow_m']), 12);        // R-24
assert.strictEqual(T(['blue', 'rainbow_m', 'pocchi']), 12);
assert.strictEqual(T(['blue', 'rainbow_m', 'pocchi'], { baiTsumo: true, isTsumo: true }), 24);
assert.strictEqual(T(['rainbow_s', 'rainbow_m']), 12);
assert.strictEqual(T(['red', 'rainbow_s', 'rainbow_m']), 18);
assert.strictEqual(T(['blue', 'rainbow_s', 'rainbow_m']), 24);
assert.strictEqual(T(['blue', 'rainbow_s', 'rainbow_m', 'pocchi'], { baiTsumo: true, isTsumo: true }), 64);
assert.strictEqual(T(['rainbow_p', 'rainbow_m']), 12);
assert.strictEqual(T(['gold', 'rainbow_p', 'rainbow_m']), 18);
assert.strictEqual(T(['red', 'gold', 'blue', 'rainbow_p', 'rainbow_m']), 30);
assert.strictEqual(T(['rainbow_p', 'rainbow_m', 'pocchi'], { baiTsumo: true, isTsumo: true }), 36);
assert.strictEqual(T(['red', 'blue', 'rainbow_p', 'rainbow_m', 'pocchi'], { baiTsumo: true, isTsumo: true }), 60);
assert.strictEqual(T(['rainbow_p', 'rainbow_s']), 16);
assert.strictEqual(T(['red', 'rainbow_p', 'rainbow_s']), 18);
assert.strictEqual(T(['gold', 'blue', 'rainbow_p', 'rainbow_s']), 26);
assert.strictEqual(T(['rainbow_p', 'rainbow_s', 'pocchi']), 20);
assert.strictEqual(T(['rainbow_p', 'rainbow_s', 'pocchi'], { baiTsumo: true, isTsumo: true }), 40);
assert.strictEqual(T(['rainbow_p', 'rainbow_s', 'rainbow_m']), 30);
assert.strictEqual(T(['red', 'rainbow_p', 'rainbow_s', 'rainbow_m']), 40);
assert.strictEqual(T(['rainbow_p', 'rainbow_s', 'rainbow_m', 'pocchi'], { baiTsumo: true, isTsumo: true }), 80);
assert.strictEqual(T(['red', 'gold', 'blue', 'rainbow_p', 'rainbow_s', 'rainbow_m', 'pocchi'], { baiTsumo: true, isTsumo: true }), 140);
// 高打点（R-29）
assert.strictEqual(T(['red', 'rainbow_m'], { yakumanCount: 1, han: 13 }), 46);
assert.strictEqual(T(['red', 'rainbow_s', 'rainbow_m'], { yakumanCount: 1, han: 13 }), 98);
assert.strictEqual(T(['rainbow_p', 'rainbow_s', 'rainbow_m', 'red', 'gold', 'gold'], { yakumanCount: 1, han: 13 }), 140);
assert.strictEqual(T(['rainbow_p', 'rainbow_s', 'rainbow_m', 'red', 'gold', 'gold', 'pocchi'], { han: 11, baiTsumo: true, isTsumo: true }), 160);
assert.strictEqual(T([], { yakumanCount: 3, han: 39 }), 120);
assert.strictEqual(T([], { yakumanCount: 3, han: 39, isTsumo: true }), 60);
// 1翻（R-27）
assert.strictEqual(T(['pocchi'], { han: 1, isTsumo: true }), 12);
// 七対子4枚使い（R-30）
assert.strictEqual(T([], { han: 14, quads: 3 }), 110);
// 役の祝儀（R-43）
assert.strictEqual(T([], { yakuNames: ['一気通貫'], menzen: true }), 10);
assert.strictEqual(T([], { yakuNames: ['混全帯幺九'], menzen: false }), 5);
assert.strictEqual(T(['rainbow_s'], { yakuNames: ['一気通貫'], menzen: true }), 2 + 20);
// 裏ドラ・一発（虹5萬で変換）
assert.strictEqual(T(['red', 'rainbow_m', 'ippatsu', 'ura']), 12);
console.log('祝儀テスト OK');

// ---- 対局シナリオ ----
function setup(fn) {
  const g = new Game([0, 1, 2, 3].map(i => ({ name: 'P' + i, isBot: true })), {}, () => {});
  fn(g);
  return g;
}
const ids = (str, used = new Set()) => parse(str).map(k => {
  for (let i = 0; i < 4; i++) { const id = k * 4 + (i + 1) % 4; if (!used.has(id)) { used.add(id); return id; } }
  throw new Error('no tile ' + k);
});
// 倍ぽっち：リーチ後にツモ→オールマイティ、祝儀×2
{
  const g = setup(g => {
    const used = new Set([124, 16]);
    g.hands[0] = [16, ...ids('67m456p789s23s55z', used)];
    g.riichi[0].state = 1;
    g.hands[0].push(124); g.drawn = 124; g.turn = 0; g.phase = 'discard';
  });
  const a = g.actionsFor(0);
  assert.strictEqual(a.wild, 'bai');
  g.act(0, { type: 'tsumo' });
  if (g.phase === 'choose') g.act(0, { type: 'choose' });
  const w = g.result.wins[0];
  assert.ok(w.units.includes('倍ぽっち'));
  // 赤1＋倍ぽっち2 ＝3、×2 ＝6（＋裏ドラ・1翻などがあれば増える）
  assert.ok(w.chips >= 6, JSON.stringify(w));
  assert.strictEqual(g.chips.reduce((a, b) => a + b, 0) + g.kyotakuChips, 0);
}
// オープンリーチ：当たり牌は他家が捨てられない
{
  const g = setup(g => {
    const used = new Set();
    g.hands[1] = ids('123m456p789s234s5p', used);
    g.riichi[1] = { state: 1, open: true, ippatsu: false, pending: false };
    g.hands[0] = ids('5p5p1z1z2z2z3z3z4z4z6z6z7z', used); g.hands[0].push(ids('7z', used)[0]);
    g.drawn = g.hands[0][13]; g.turn = 0; g.phase = 'discard';
  });
  const a = g.actionsFor(0);
  assert.ok(a.discard.every(t => kindOf(t) !== parse('5p')[0]), 'forbidden 5p');
}
console.log('シナリオテスト OK');

// 中ぽっち：リーチ後ツモで赤5を虹に変換できる（候補に変換あり）
{
  const g = setup(g => {
    const used = new Set([132, 52]);
    g.hands[0] = [52, ...ids('34p678m789s23s55z', used)];
    g.riichi[0].state = 1;
    g.hands[0].push(132); g.drawn = 132; g.turn = 0; g.phase = 'discard';
  });
  assert.strictEqual(g.actionsFor(0).wild, 'chun');
  g.act(0, { type: 'tsumo' });
  // 祝儀も点数も一番の取り方があれば選ぶ画面を出さずに自動で決まる
  if (g.phase === 'choose') g.act(0, { type: 'choose' });
  const w = g.result.wins[0];
  assert.ok(w.desc.includes('→虹'), w.desc); // 変換した方が祝儀が多い
  assert.ok(w.units.some(u => u.includes('変換')));
}
// ドラ表示牌が赤5索なら6索は赤牌扱い（R-31）
{
  const g = setup(g => {
    const used = new Set([88]);
    g.dead[4] = 88; g.doraCount = 1;
    g.hands[0] = ids('666s123m456p789p1z', used);
    g.hands[0].push(ids('1z', used)[0]); g.drawn = g.hands[0][13]; g.turn = 0; g.phase = 'discard';
  });
  assert.ok(g.actionsFor(0).tsumo);
  g.act(0, { type: 'tsumo' });
  if (g.phase === 'choose') g.act(0, { type: 'choose' });
  const w = g.result.wins[0];
  assert.strictEqual(w.units.filter(u => u === '赤6').length, 3, JSON.stringify(w.units));
}
// 流し満貫（倍満・ツモ払い）
{
  const g = setup(g => {
    g.discards[1] = parse('1m9m1z2z3z9p').map(k => ({ tile: k * 4, called: false }));
    g.live = [];
  });
  g.exhaustiveDraw();
  assert.strictEqual(g.result.reason, '流し満貫');
  assert.strictEqual(g.result.delta[1], 16000);
}
// 流し満貫の供託：2人なら親に近い人がもらう
{
  const g = setup(g => {
    g.discards[1] = parse('1m9m1z2z3z9p').map(k => ({ tile: k * 4, called: false }));
    g.discards[3] = parse('1s9s4z5z6z7z').map(k => ({ tile: k * 4, called: false }));
    g.live = []; g.kyotaku = 2; g.kyotakuChips = 2;
  });
  g.exhaustiveDraw();
  assert.strictEqual(g.result.delta[1], 16000 - 4000 + 2000);
  assert.strictEqual(g.result.delta[3], 16000 - 4000);
  assert.strictEqual(g.kyotaku, 0);
  // 親（0）と子（2）なら、親の下家から数えて子（2）がもらう
  const g2 = setup(g => {
    g.discards[0] = parse('1m9m1z2z3z9p').map(k => ({ tile: k * 4, called: false }));
    g.discards[2] = parse('1s9s4z5z6z7z').map(k => ({ tile: k * 4, called: false }));
    g.live = []; g.kyotaku = 1;
  });
  g2.exhaustiveDraw();
  assert.strictEqual(g2.result.delta[2], 16000 - 8000 + 1000);
  console.log('流し満貫の供託 OK');
}
// 親の選択：東4局で流すと終局
{
  const g = setup(g => { g.kyoku = 3; });
  g.finishHand({ type: 'ryuukyoku', reason: '流局', tenpai: [false, false, false, true], hands: [], delta: [0, 0, 0, 0], chipDelta: [0, 0, 0, 0], busters: {} }, { dealerWon: false, draw: true, dealerTenpai: true });
  assert.ok(g.actionsFor(3).dealerChoice);
  g.act(3, { type: 'dealer', cont: false });
  assert.ok(g.gameOver);
  assert.strictEqual(g.gameOver[0].rankChips, 30); // 同点は起家に近い順
}
// コールド・トビの祝儀
{
  const g = setup(g => { g.scores = [56000, 25000, 20000, -1000]; });
  g.finishHand({ type: 'agari', wins: [], delta: [0, 0, 0, 0], chipDelta: [0, 0, 0, 0], busters: { 3: 0 } }, { dealerWon: false, draw: false });
  assert.deepStrictEqual(g.chips, [15 + 10 + 30, -5 + 10, -5 - 10, -15 - 30]); // 着順祝儀込み
  assert.ok(g.gameOver);
}
console.log('シナリオテスト2 OK');

// オープンリーチへの強制放銃は役満払い（R-32）
{
  const g = setup(g => {
    const used = new Set();
    g.hands[1] = ids('123m456p789s234s1p', used);
    g.riichi[1] = { state: 1, open: true, ippatsu: false, pending: false };
  });
  const c = g.winCandidates(1, 9 * 4 + 1, false, { forced: true });
  assert.ok(c.length && c[0].base === 8000 && c[0].chips >= 40, JSON.stringify(c[0]));
}
console.log('シナリオテスト3 OK');

// 同じ6に色が重なったら両方数える（表：赤5索、槓ドラ：青5索 → 6索1枚で赤＋青）
{
  const g = setup(g => {
    const used = new Set([88, 90]);
    g.dead[4] = 88; g.dead[5] = 90; g.doraCount = 2;
    g.hands[0] = ids('456s123m456p789p1z', used);
    g.hands[0].push(ids('1z', used)[0]); g.drawn = g.hands[0][13]; g.turn = 0; g.phase = 'discard';
  });
  g.act(0, { type: 'tsumo' });
  if (g.phase === 'choose') g.act(0, { type: 'choose' });
  const u = g.result.wins[0].units;
  assert.ok(u.includes('赤6') && u.includes('青6'), JSON.stringify(u));
}
console.log('シナリオテスト4 OK');

{ // 国士無双は暗槓でロンできる（槍槓）
  const { Game } = require('../game');
  const g = setup(g => {
    g.hands[1] = ids('19m19p19s1234567z');       // 国士無双 中待ち（13種のうち中なし→）
    g.hands[1] = ids('19m19p19s123456z1z');      // 1z対子・7z待ち
    g.hands[0] = ids('7z7z7z7z1m2m3m4m5m6m7m8m9m1p');
    g.turn = 0; g.drawn = g.hands[0][3]; g.phase = 'discard'; g.hasDiscarded = [true, true, true, true];
  });
  assert.ok(g.actionsFor(0).ankan, 'ankan可能');
  g.act(0, { type: 'ankan', kind: 33 });
  assert.strictEqual(g.phase, 'claim');
  assert.ok(g.claim.options[1].ron);
  const g2 = setup(x => { x.hands = g.hands.map(h => h.slice()); x.hands[0].push(g.claim.tile); x.turn = 0; x.drawn = g.claim.tile; x.phase = 'discard'; x.hasDiscarded = [true, true, true, true]; });
  g2.act(0, { type: 'ankan', kind: 33 }); g2.act(1, { type: 'pass' });
  assert.ok(g2.melds[0].some(m => m.type === 'ankan'), '見逃したら暗槓成立');
  g.act(1, { type: 'ron' });
  if (g.phase === 'choose') g.act(1, { type: 'choose' });
  assert.ok(g.result.wins[0].yakuman >= 1, JSON.stringify(g.result.wins[0].yaku));
  console.log('国士無双の暗槓ロン OK');
}

{ // 中ぽっち：虹に変えられるのは手牌の赤・金・青の5だけで、同じ種類の虹になる
  const { Game } = require('../game');
  const mk = (withRed5s) => {
    const g = new Game([0,1,2,3].map(()=>({name:'P',isBot:true})),{},()=>{});
    const k=(n,s)=>({m:0,p:9,s:18,z:27})[s]+n-1; const ids=[];
    const list = [[1,'m'],[2,'m'],[3,'m'],[7,'m'],[8,'m'],[9,'m'],[4,'s'],[6,'s'],[1,'z'],[1,'z'],[3,'p'],[4,'p']];
    if (!withRed5s) { list[6] = [7,'s']; list[7] = [8,'s']; list.push([9,'s']); }
    for (const [n,s] of list){let b=k(n,s)*4,i=1;while(ids.includes(b+i))i++;ids.push(b+i);}
    if (withRed5s) ids.splice(7, 0, 22*4+1); // 金5索（5はすべて特殊牌）
    g.hands[0]=ids.concat([132]); g.riichi[0].state=1; g.hasDiscarded=[true,true,true,true]; g.drawn=132; g.dead=g.dead.map(()=>73);
    return g;
  };
  const g1 = mk(true);
  const c1 = g1.winCandidates(0,132,true,{wild:'chun'});
  // 5として取った中ぽっち自身を虹にする取り方もある（その5と同じ種類の虹）
  const okConv = (c) => c.conversions.every(v => v.self ? v.suit === R.SUIT_OF_FIVE[c.wildKind] : v.suit === 's');
  assert.ok(c1.length && c1.every(c => c.conversions.length === 1 && okConv(c)), JSON.stringify(c1.map(c=>c.desc)));
  assert.ok(c1.some(c => !c.conversions[0].self), JSON.stringify(c1.map(c=>c.desc))); // 金5索→虹5索
  assert.strictEqual(g1._lastIndicators.omote.length, 1); // 変える5があるので追加の槓ドラなし
  const g2 = mk(false);
  const c2 = g2.winCandidates(0,132,true,{wild:'chun'});
  assert.ok(c2.length && c2.every(c => c.conversions.every(v => v.self) && okConv(c)), JSON.stringify(c2.map(c=>c.desc))); // 手牌の5はないので、変えられるのは中ぽっち自身だけ
  assert.strictEqual(g2._lastIndicators.omote.length, 2); // 変える5がないので追加の槓ドラ
  console.log('中ぽっちの虹変換 OK');
}

{ // 裏ドラ表示牌が倍ぽっち：5を虹に変え、さらに一番多い牌が裏ドラ（中ぽっちツモと重なったら両方）
  const { Game } = require('../game');
  const mk = (kinds, special, winTile) => {
    const g = new Game([0,1,2,3].map(()=>({name:'P',isBot:true})),{},()=>{});
    const used = new Set([...special, 124, winTile]);
    const ids = kinds.map(k => { for (let i = 0; i < 4; i++) { const id = k * 4 + (i + 1) % 4; if (!used.has(id)) { used.add(id); return id; } } });
    for (const arr of [g.live, g.dead, ...g.hands]) for (let i = arr.length - 1; i >= 0; i--) if (used.has(arr[i])) arr.splice(i, 1);
    g.dead.splice(9, 0, 124); // 裏ドラ表示牌＝倍ぽっち
    g.hands[0] = [...special, ...ids, winTile]; g.drawn = winTile; g.riichi[0].state = 1; g.hasDiscarded = [true,true,true,true];
    return g;
  };
  const best = (cs) => cs[Game.defaultIndex(cs)];
  const hasUraTon = (c) => c.yaku.some(y => y[0] === '裏ドラ' && y[1] >= 2) && c.desc.includes('裏ドラ=東');
  // ふつうのツモ：赤5萬→虹5萬 と 裏ドラ=東 の両方
  {
    const g = mk([5,6, 12,13,14, 24,25,26, 19,20, 27,27], [16], 21 * 4 + 1);
    const c = best(g.winCandidates(0, 21 * 4 + 1, true));
    assert.ok(c.conversions.length === 1 && hasUraTon(c), c.desc);
  }
  // 中ぽっちツモ：中ぽっちと倍ぽっちで別々の5を虹に（同じ種類の虹は不可）＋裏ドラ=東
  {
    const g = mk([5,6, 12,13,14, 24,25,26, 19,20, 27,27], [16], 132);
    const cs = g.winCandidates(0, 132, true, { wild: 'chun' });
    const c = best(cs);
    assert.ok(c.conversions.length === 2 && new Set(c.conversions.map(v => v.suit)).size === 2 && hasUraTon(c), c.desc);
    assert.ok(cs.every(x => new Set(x.conversions.map(v => v.suit)).size === x.conversions.length));
  }
  // 中ぽっちツモ・手牌に5なし：中ぽっち自身を虹にできるのは中ぽっち側だけ。倍ぽっちは裏ドラだけ
  {
    const g = mk([0,1,2, 6,7,8, 24,25,26, 27,27, 11,12], [], 132);
    const cs = g.winCandidates(0, 132, true, { wild: 'chun' });
    assert.ok(cs.every(x => x.conversions.length <= 1 && hasUraTon(x)), JSON.stringify(cs.map(x => x.desc)));
    assert.ok(best(cs).conversions.some(v => v.self), best(cs).desc);
  }
  console.log('裏ドラの倍ぽっち OK');
}




// ---- シミュレーション ----
let games = 0, hands = 0, agari = 0, draws = 0, chooses = 0;
const yakuCount = {};
const N = +(process.env.SIM || 40);
for (let gi = 0; gi < N; gi++) {
  const game = new Game([0, 1, 2, 3].map(i => ({ name: 'CPU' + i, isBot: true })), {}, () => {});
  let steps = 0;
  let lastHand = null;
  while (!(game.gameOver && game.phase === 'result') && steps < 300000) {
    steps++;
    if (game.phase === 'choose') chooses++;
    let acted = false;
    for (let s = 0; s < 4; s++) {
      const act = botAction(game, s);
      if (act) {
        if (!game.act(s, act)) throw new Error('illegal bot action ' + JSON.stringify(act) + ' phase ' + game.phase);
        acted = true;
        if (game.phase === 'result' && game.result !== lastHand) {
          lastHand = game.result; hands++;
          if (game.result.type === 'agari') { agari++; for (const w of game.result.wins) for (const y of w.yaku) yakuCount[y[0]] = (yakuCount[y[0]] || 0) + 1; }
          else draws++;
          const sum = game.scores.reduce((a, b) => a + b, 0) + game.kyotaku * 1000;
          assert.strictEqual(sum, 100000, '点数合計が合わない');
          const csum = game.chips.reduce((a, b) => a + b, 0) + game.kyotakuChips;
          assert.strictEqual(csum, 0, '祝儀合計が合わない ' + csum);
        }
        break;
      }
    }
    if (!acted) throw new Error('stuck at phase ' + game.phase);
    if (game.phase !== 'result' && game.phase !== 'choose') {
      const n = game.hands.flat().length + game.melds.flat().reduce((a, m) => a + m.tiles.length, 0) +
        game.discards.flat().filter(d => !d.called).length + game.live.length + game.dead.length;
      assert.strictEqual(n, 136, '牌の枚数不整合 ' + n);
    }
  }
  assert.ok(game.gameOver, 'game did not finish');
  assert.strictEqual(game.gameOver.reduce((a, b) => a + b.score, 0), 100000);
  assert.strictEqual(game.gameOver.reduce((a, b) => a + b.chips, 0), 0);
  assert.ok(Math.abs(game.gameOver.reduce((a, b) => a + b.rankChips, 0)) < 1e-6);
  games++;
}
console.log(`シミュレーション OK: ${games}東風戦, ${hands}局 (和了${agari} 流局${draws}, 選択${chooses})`);
console.log(Object.entries(yakuCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));

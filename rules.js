// 特殊牌・ぽっち・祝儀の計算
'use strict';

const kindOf = id => Math.floor(id / 4);

// 5の特殊牌（各色4枚すべて特殊）
//   5萬 kind4: 16赤 17金 18青 19虹(萬)
//   5筒 kind13: 52赤 53金 54青 55虹(筒)
//   5索 kind22: 88赤 89金 90青 91虹(索)
const SUIT_OF_FIVE = { 4: 'm', 13: 'p', 22: 's' };
function fiveColor(id) {
  const k = kindOf(id);
  if (!(k in SUIT_OF_FIVE)) return null;
  return ['red', 'gold', 'blue', 'rainbow'][id % 4];
}
const RAINBOW_ID = { m: 19, p: 55, s: 91 };
const suitOfKind = k => (k < 9 ? 'm' : k < 18 ? 'p' : k < 27 ? 's' : null);
const FIVE_KIND = { m: 4, p: 13, s: 22 };
const SIX_KIND = { m: 5, p: 14, s: 23 };

// ぽっち：白・發・中の各1枚目
const POCCHI_ID = { 124: 'bai', 128: 'hatsu', 132: 'chun' };
const POCCHI_KIND = { 31: 'bai', 32: 'hatsu', 33: 'chun' };
const POCCHI_NAME = { bai: '倍ぽっち', hatsu: '發ぽっち', chun: '中ぽっち' };
const RAINBOW_NAME = { m: '虹5萬', p: '虹5筒', s: '虹5索' };
const COLOR_NAME = { red: '赤', gold: '金', blue: '青' };

// pocchiKinds: 表ドラ・槓ドラでぽっちがめくれて、その種類すべてがぽっちになったもの
function pocchiType(id, pocchiKinds) {
  if (POCCHI_ID[id]) return POCCHI_ID[id];
  const k = kindOf(id);
  if (pocchiKinds && pocchiKinds.has(k)) return POCCHI_KIND[k];
  return null;
}

const BASE_VALUE = { red: 1, gold: 2, blue: 3, rainbow_p: 7, rainbow_s: 1, rainbow_m: 0, pocchi: 2, ura: 1, ippatsu: 1 };

/*
 特殊牌側の祝儀（1人あたり）
 units: ['red','gold','blue','rainbow_p','rainbow_s','rainbow_m','pocchi','ura','ippatsu', ...]
 戻り値: { value, mult, desc }
*/
function specialChips(units) {
  const has = t => units.includes(t);
  const rp = has('rainbow_p'), rs = has('rainbow_s'), rm = has('rainbow_m');
  let per = null;
  if (rp && rs && rm) per = 10;
  else if (rp && rm) per = 6;
  else if (rm) per = (!has('red') && !has('gold') && has('blue')) ? 4 : 3;
  let sum;
  if (per != null) sum = units.length * per;
  else sum = units.reduce((a, u) => a + BASE_VALUE[u], 0);
  const mult = (rs && !(rp && rs && rm)) ? 2 : 1; // 虹5索の×2（虹3種のときは消える）
  return { sum, per, mult, rainbowS: rs };
}

// 高打点の祝儀（ron / tsumo 1人あたり）
function highHandChips(han, yakumanCount, isTsumo) {
  if (yakumanCount > 0) return (isTsumo ? 20 : 40) * yakumanCount;
  if (han >= 13) return isTsumo ? 10 : 20;
  if (han >= 11) return isTsumo ? 5 : 10;
  return 0;
}
// 七対子4枚使い
function quadChips(quads, isTsumo) {
  if (!quads) return 0;
  return [0, isTsumo ? 5 : 10, isTsumo ? 15 : 30, isTsumo ? 45 : 90][Math.min(3, quads)];
}
// 役の祝儀（チャンタ・純チャン・一通）
function yakuChips(yakuNames, menzen) {
  let n = 0;
  for (const y of ['混全帯幺九', '純全帯幺九', '一気通貫']) if (yakuNames.includes(y)) n += menzen ? 10 : 5;
  return n;
}

/*
 1人あたりの祝儀合計
 opts: { units, han, yakumanCount, isTsumo, quads, yakuNames, menzen, baiTsumo, forceYakuman }
*/
function totalChips(o) {
  const sp = specialChips(o.units);
  const bai = o.baiTsumo ? 2 : 1;
  const special = sp.sum * sp.mult * bai;
  const ymCount = o.forceYakuman ? Math.max(1, o.yakumanCount) : o.yakumanCount;
  const hh = highHandChips(o.han, ymCount, o.isTsumo);
  const sepBase = hh + quadChips(o.quads, o.isTsumo) + yakuChips(o.yakuNames, o.menzen);
  const sepMult = (sp.rainbowS ? 2 : 1) * bai;
  const separate = sepBase * sepMult;
  const oneHan = (ymCount === 0 && o.han === 1) ? 10 : 0;
  const yakumanPart = hh * sepMult; // 包の計算用（役満祝儀）
  return { total: special + separate + oneHan, special, separate, oneHan, yakumanPart, sp, bai, sepMult };
}

module.exports = {
  kindOf, fiveColor, RAINBOW_ID, suitOfKind, FIVE_KIND, SIX_KIND, SUIT_OF_FIVE,
  POCCHI_ID, POCCHI_KIND, POCCHI_NAME, RAINBOW_NAME, COLOR_NAME, pocchiType,
  specialChips, highHandChips, quadChips, yakuChips, totalChips, BASE_VALUE,
};

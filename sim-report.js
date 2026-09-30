// CPU同士で対局して、特殊ルールが絡んだ局を集計・記録する
'use strict';
const { Game, botAction, tileName } = require('../game');
const N = +(process.argv[2] || 200);
const stats = {};
const samples = {};
const inc = (k, sample) => { stats[k] = (stats[k] || 0) + 1; if (sample && !samples[k]) samples[k] = sample; };
let hands = 0, games = 0, maxChip = 0, maxChipWin = null;
const errors = [];
for (let gi = 0; gi < N; gi++) {
  const g = new Game([0, 1, 2, 3].map(i => ({ name: 'CPU' + i, isBot: true })), {}, () => {});
  let last = null, steps = 0;
  while (!(g.gameOver && g.phase === 'result') && steps++ < 300000) {
    let acted = false;
    for (let s = 0; s < 4; s++) {
      const a = botAction(g, s);
      if (a) {
        if (g.phase === 'choose') inc('候補から選択');
        if (!g.act(s, a)) { errors.push('illegal ' + JSON.stringify(a)); }
        acted = true; break;
      }
    }
    if (!acted) { errors.push('stuck ' + g.phase); break; }
    const r = g.result;
    if (g.phase === 'result' && r && r !== last) {
      last = r; hands++;
      const cs = g.chips.reduce((a, b) => a + b, 0) + g.kyotakuChips;
      if (cs !== 0) errors.push('chip sum ' + cs);
      if (r.type === 'agari') {
        if (r.wins.length > 1) inc(r.wins.length === 2 ? 'ダブロン' : '三家和');
        for (const w of r.wins) {
          const brief = { seat: w.seat, tsumo: w.tsumo, desc: w.desc, han: w.han, fu: w.fu, limit: w.limit, points: w.points, yaku: w.yaku.map(y => y[0] + y[1]).join(' '), chips: w.chips, detail: w.chipsDetail, units: w.units.join(','), pao: w.pao };
          if (w.chips > maxChip) { maxChip = w.chips; maxChipWin = brief; }
          if (w.wild) inc('オールマイティ:' + w.wild, brief);
          if (w.units.some(u => u.includes('変換'))) inc('虹への変換', brief);
          if (w.units.some(u => /[赤金青]6|\(6\)/.test(u))) inc('ドラ表示牌の5で6が特殊牌', brief);
          if (w.desc && w.desc.includes('裏ドラ=')) inc('裏ドラ表示牌のぽっち', brief);
          if (w.pao != null) inc('包', brief);
          if (w.limit === '役満払い') inc('オープンリーチへの強制放銃', brief);
          if (w.yaku.some(y => y[0].startsWith('七対子4枚使い'))) inc('七対子4枚使い', brief);
          if (w.chipsDetail.oneHan) inc('1翻和了+10枚', brief);
          if (w.yaku.some(y => ['混全帯幺九', '純全帯幺九', '一気通貫'].includes(y[0]))) inc('役の祝儀', brief);
          if (w.yaku.some(y => y[0] === '人和')) inc('人和', brief);
          if (w.yaku.some(y => y[0].includes('オープン立直'))) inc('オープン立直で和了', brief);
          if (w.yakuman >= 2) inc('ダブル役満以上', brief);
          else if (w.yakuman === 1) inc('役満', brief);
          if (w.limit === '数え役満') inc('数え役満', brief);
          if (w.limit === '三倍満') inc('三倍満', brief);
          if (w.units.includes('虹5萬') || w.units.includes('虹5萬(6)')) inc('虹5萬の変換あり');
        }
      } else if (r.reason === '流し満貫') inc('流し満貫', { nagashi: r.nagashi, chipDelta: r.chipDelta });
      if (r.cold && r.cold.length) inc('コールド');
      if (r.bust && r.bust.length) inc('トビ');
      if (r.needDealerChoice) inc('親の選択');
    }
  }
  games++;
}
console.log(`${games}半荘（東風戦） ${hands}局  エラー${errors.length}件`, errors.slice(0, 3));
console.log(Object.entries(stats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
console.log('\n最大祝儀の和了:', JSON.stringify(maxChipWin, null, 0));
console.log('\n例:');
for (const [k, v] of Object.entries(samples)) console.log(`【${k}】`, JSON.stringify(v));

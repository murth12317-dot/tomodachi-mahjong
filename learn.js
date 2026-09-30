// CPU同士の対局で打ち方のパラメータを調整する（簡易な学習：座標探索）
// 評価 = 順位ポイント（(点数-25000)/1000 + 順位点）+ 祝儀×2
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');

function playGames(params, n, seed) {
  const { Game, botAction } = require(path.join(__dirname, '..', 'game'));
  const res = [];
  for (let i = 0; i < n; i++) {
    const g = new Game([0, 1, 2, 3].map(j => ({ name: 'c' + j, isBot: true })), {}, () => {});
    const learner = (i + seed) % 4; // 席を順番に入れ替える
    let steps = 0;
    while (!(g.gameOver && g.phase === 'result') && steps++ < 300000) {
      for (let s = 0; s < 4; s++) {
        const a = botAction(g, s, s === learner ? params : null);
        if (a) { g.act(s, a); break; }
      }
    }
    const me = g.gameOver.find(r => r.seat === learner);
    res.push({ pt: 0, chips: me.chips, rank: me.rank });
  }
  return res;
}

if (!isMainThread) {
  parentPort.postMessage(playGames(workerData.params, workerData.n, workerData.seed));
} else {
  const WORKERS = 2;
  const W = 2; // 祝儀1枚の価値
  const run = (params, n) => Promise.all([...Array(WORKERS)].map((_, i) => new Promise((ok, ng) => {
    const w = new Worker(__filename, { workerData: { params, n: Math.ceil(n / WORKERS), seed: i } });
    w.on('message', ok); w.on('error', ng);
  }))).then(parts => {
    const r = parts.flat();
    const v = r.map(x => x.chips);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1));
    const rankAvg = r.reduce((a, b) => a + b.rank, 0) / r.length;
    const chips = r.reduce((a, b) => a + b.chips, 0) / r.length;
    const pt = r.reduce((a, b) => a + b.pt, 0) / r.length;
    return { mean, se: sd / Math.sqrt(v.length), n: v.length, rankAvg, chips, pt };
  });

  const SPACE = {
    fold: [99, 3, 2, 1],
    openRate: [0, 0.3, 0.6, 1],
    choose: ['chips', 'value'],
    dealerPassLead: [Infinity, 30000, 15000],
    keepSpecial: [0, 2, 5],
    ponYakuhai: [1, 0],
  };
  const N = +(process.argv[2] || 400);
  (async () => {
    const t0 = Date.now();
    let best = {};
    let total = 0;
    const log = [];
    const base = await run(best, N); total += base.n;
    console.log(`基準（今のCPU）: ${base.mean.toFixed(2)} ±${base.se.toFixed(2)}  平均順位${base.rankAvg.toFixed(2)}`);
    let bestScore = base.mean;
    for (const [key, vals] of Object.entries(SPACE)) {
      const results = [];
      for (const v of vals) {
        const p = Object.assign({}, best, { [key]: v });
        const r = (v === (best[key] ?? require('../game').BASE_BOT[key])) ? null : await run(p, N);
        if (r) { total += r.n; results.push({ v, r }); log.push({ key, v, ...r }); console.log(`  ${key}=${v}: ${r.mean.toFixed(2)} ±${r.se.toFixed(2)}  順位${r.rankAvg.toFixed(2)} pt${r.pt.toFixed(1)} 祝儀${r.chips.toFixed(1)}`); }
      }
      const top = results.sort((a, b) => b.r.mean - a.r.mean)[0];
      if (top && top.r.mean > bestScore + top.r.se) {
        // 確認のためもう一度同じ数だけ回す
        const again = await run(Object.assign({}, best, { [key]: top.v }), N); total += again.n;
        const m = (top.r.mean + again.mean) / 2;
        console.log(`  → 確認 ${key}=${top.v}: ${again.mean.toFixed(2)}（2回平均 ${m.toFixed(2)}）`);
        if (m > bestScore) { best[key] = top.v; bestScore = m; }
      }
      console.log(`[${key}] 採用: ${JSON.stringify(best)}  （累計${total}半荘, ${((Date.now() - t0) / 60000).toFixed(1)}分）`);
    }
    const final = await run(best, N * 2); total += final.n;
    console.log(`\n最終: ${JSON.stringify(best)} → ${final.mean.toFixed(2)} ±${final.se.toFixed(2)} 平均順位${final.rankAvg.toFixed(2)} pt${final.pt.toFixed(1)} 祝儀${final.chips.toFixed(1)}（基準は0付近）`);
    console.log(`合計 ${total} 半荘`);
    require('fs').writeFileSync(path.join(__dirname, '..', 'dist', 'learned-bot.json'), JSON.stringify({ best, final, log }, null, 1));
  })();
}

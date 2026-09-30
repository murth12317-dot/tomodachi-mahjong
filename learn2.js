// 同じ山で「打ち方A」と「基準」を打ち比べて差をとる（運の差を消す比較）
// 評価 = 祝儀（着順の祝儀を含む）
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
const W = 2;

function playOne(params, seed, learner, G) {
  const { Game, botAction, mulberry32 } = G;
  const saved = Math.random;
  Math.random = mulberry32(seed * 9973 + 17); // ボットの乱数も固定
  try {
    const g = new Game([0, 1, 2, 3].map(j => ({ name: 'c' + j, isBot: true })), { seed }, () => {});
    let steps = 0;
    while (!(g.gameOver && g.phase === 'result') && steps++ < 300000) {
      for (let s = 0; s < 4; s++) {
        const a = botAction(g, s, s === learner ? params : null);
        if (a) { g.act(s, a); break; }
      }
    }
    const me = g.gameOver.find(r => r.seat === learner);
    return { v: me.chips, pt: 0, chips: me.chips, rank: me.rank };
  } finally { Math.random = saved; }
}

if (!isMainThread) {
  const G = require(path.join(__dirname, '..', 'game'));
  const { params, seeds } = workerData;
  const out = [];
  for (const seed of seeds) {
    const learner = seed % 4;
    const a = playOne(params, seed, learner, G);
    const b = playOne(null, seed, learner, G);
    out.push({ d: a.v - b.v, dpt: a.pt - b.pt, dchips: a.chips - b.chips, drank: a.rank - b.rank });
  }
  parentPort.postMessage(out);
} else {
  const WORKERS = require('os').cpus().length;
  let seedBase = 1;
  const run = (params, pairs) => {
    const seeds = [...Array(pairs)].map((_, i) => seedBase + i);
    seedBase += pairs;
    const chunks = [...Array(WORKERS)].map((_, w) => seeds.filter((_, i) => i % WORKERS === w));
    return Promise.all(chunks.map(ch => new Promise((ok, ng) => {
      const w = new Worker(__filename, { workerData: { params, seeds: ch } });
      w.on('message', ok); w.on('error', ng);
    }))).then(parts => {
      const r = parts.flat();
      const avg = f => r.reduce((a, b) => a + f(b), 0) / r.length;
      const mean = avg(x => x.d);
      const sd = Math.sqrt(r.reduce((a, b) => a + (b.d - mean) ** 2, 0) / (r.length - 1));
      return { mean, se: sd / Math.sqrt(r.length), n: r.length, dpt: avg(x => x.dpt), dchips: avg(x => x.dchips), drank: avg(x => x.drank) };
    });
  };
  const fmt = r => `${r.mean >= 0 ? '+' : ''}${r.mean.toFixed(2)} ±${r.se.toFixed(2)}（pt${r.dpt >= 0 ? '+' : ''}${r.dpt.toFixed(2)} 祝儀${r.dchips >= 0 ? '+' : ''}${r.dchips.toFixed(2)} 順位${r.drank >= 0 ? '+' : ''}${r.drank.toFixed(3)}）`;

  const CUSTOM = process.argv[3] ? JSON.parse(process.argv[3]) : null;
  const SPACE = CUSTOM || [
    ['dealerPassLead', [30000, 15000]],
    ['fold', [3, 2, 1]],
    ['openRate', [0, 0.6, 1]],
    ['choose', ['value']],
    ['keepSpecial', [0, 5]],
    ['keepPocchi', [0, 4]],
    ['ponYakuhai', [0]],
  ];
  const PAIRS = +(process.argv[2] || 1000);
  (async () => {
    const t0 = Date.now();
    let total = 0;
    const log = [];
    // 1段目：基準からの単独の効果（すべて同じ種で比べる）
    const effects = [];
    for (const [key, vals] of SPACE) {
      for (const v of vals) {
        const p = typeof v === 'object' && v !== null ? v : { [key]: v };
        const r = await run(p, PAIRS); total += r.n * 2;
        effects.push({ key, v, r }); log.push({ key, v, ...r });
        console.log(`${key}=${v}: ${fmt(r)}   [${total}半荘 ${((Date.now() - t0) / 60000).toFixed(1)}分]`);
      }
    }
    // 2段目：良かったもの（+2σ以上）を組み合わせて確認
    const best = {};
    for (const [key] of SPACE) {
      const cand = effects.filter(e => e.key === key && e.r.mean > 2 * e.r.se && typeof e.v !== 'object').sort((a, b) => b.r.mean - a.r.mean)[0];
      if (cand) best[key] = cand.v;
    }
    console.log('\n組み合わせ候補:', JSON.stringify(best));
    let final = null;
    if (Object.keys(best).length) {
      final = await run(best, PAIRS * 2); total += final.n * 2;
      console.log(`組み合わせの効果: ${fmt(final)}`);
    }
    console.log(`合計 ${total} 半荘, ${((Date.now() - t0) / 60000).toFixed(1)}分`);
    require('fs').writeFileSync(path.join(__dirname, '..', 'dist', process.argv[4] || 'learned-bot.json'), JSON.stringify({ best, final, log }, null, 1));
  })();
}

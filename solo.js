// 一人用（CPU3人）：サーバーなしでブラウザだけで動かす
'use strict';
window.SOLO = (function () {
  const { Game, botAction } = require('./game');
  const NAMES = ['あなた', 'CPU1', 'CPU2', 'CPU3'];
  const BOT_DELAY = 550;
  let handlers, game, you, botTimer, autoTimer, watch = false, players = [];
  const history = [];
  // キャラを変える（CPUと同じキャラなら入れ替える）
  function setChar(c) {
    if (!players[you]) return;
    const other = players.find((p, i) => i !== you && p.char === c);
    if (other) other.char = players[you].char;
    players[you].char = c;
    handlers.room(roomInfo()); handlers.state(game.viewFor(you));
  }
  const roomInfo = () => ({ code: 'CPU', settings: {}, seats: players.map(p => ({ name: p.name, char: p.char, isBot: p.isBot, online: true })), started: true, you, isHost: true, solo: true, history: history.map(x => ({ no: x.no, at: x.at, rows: x.rows, names: x.names })) });

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function newGame() {
    clearTimeout(botTimer); clearTimeout(autoTimer);
    const order = shuffle([0, 1, 2, 3]);
    // キャラ：自分はロビーで選んだもの、CPUは残りから
    const CH = ['rin', 'kohaku', 'shizuku', 'nanami', 'pochi', 'daiya'];
    let mine = null; try { mine = localStorage.getItem('mj_char'); } catch (e) { /* noop */ }
    if (!CH.includes(mine)) mine = CH[2];
    const rest = shuffle(CH.filter(c => c !== mine));
    players = order.map(i => ({ name: NAMES[i], isBot: i !== 0, char: i === 0 ? mine : rest[i - 1] }));
    you = order.indexOf(0);
    game = new Game(players, {}, update);
    handlers.room(roomInfo());
    update();
  }

  function update() {
    if (game.gameOver && !game.recorded) {
      game.recorded = true;
      history.push({ no: history.length + 1, at: Date.now(), replay: game.replay || [], names: game.players.map(p => p.name), rows: game.gameOver.map(r => ({ pid: r.name, name: r.name, isBot: r.name !== NAMES[0], rank: r.rank, score: r.score, rankChips: r.rankChips, chips: r.chips })) });
      handlers.room(roomInfo());
    }
    handlers.state(game.viewFor(you));
    schedule();
  }

  function schedule() {
    const g = game;
    clearTimeout(botTimer); clearTimeout(autoTimer);
    if (g.gameOver && g.phase === 'result') { if (watch) autoTimer = setTimeout(newGame, 8000); return; }
    const delay = g.phase === 'result' ? (watch ? 2500 : 600) : (g.phase === 'claim' || g.phase === 'choose') ? 250 : BOT_DELAY;
    const botSeat = [0, 1, 2, 3].find(s => (watch || s !== you) && g.actionsFor(s));
    if (botSeat !== undefined) {
      botTimer = setTimeout(() => {
        const act = botAction(g, botSeat);
        if (act && g.act(botSeat, act)) return;
        const a = g.actionsFor(botSeat);
        if (a && a.pass) g.act(botSeat, { type: 'pass' });
        else if (a && a.discard) g.act(botSeat, { type: 'discard', tile: a.discard[a.discard.length - 1] });
      }, delay);
    }
    // あなたの選択の時間切れ（和了の取り方・親の選択は20秒）
    if (g.phase === 'choose' && g.choose && g.choose.seat === you) {
      autoTimer = setTimeout(() => { if (g.phase === 'choose') g.act(you, { type: 'choose' }); }, Math.max(0, g.choose.deadline - Date.now()));
    } else if (g.phase === 'result' && g.result && g.result.needDealerChoice && !g.result.dealerChoiceMade && g.kyoku === you) {
      const r = g.result;
      autoTimer = setTimeout(() => { if (g.result === r && !r.dealerChoiceMade) g.act(you, { type: 'dealer', cont: true }); }, Math.max(0, r.dealerDeadline - Date.now()));
    }
  }

  async function api(cmd, data) {
    if (cmd === 'act') {
      if (!game.act(you, data.action)) { handlers.state(game.viewFor(you)); return { error: 'その操作はできません' }; }
      return { ok: true };
    }
    if (cmd === 'rematch' || cmd === 'leave' || cmd === 'abort') { newGame(); return { ok: true }; }
    if (cmd === 'replay') { const e = history.find(x => x.no === +data.no); return e ? { ok: true, replay: e.replay } : { error: '牌譜がありません' }; }
    return { ok: true };
  }

  function setWatch(on) {
    watch = on;
    if (watch && game.gameOver && game.phase === 'result') { newGame(); return; }
    schedule();
  }
  return { start(h) { handlers = h; newGame(); }, api, setWatch, setChar };
})();

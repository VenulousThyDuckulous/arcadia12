import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { el } from '../lib/util.js';

const N = 8;
const HUMAN = 1;
const AI = 2;
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

// Corner-heavy weights: corners are stable, the squares next to them are traps.
const WEIGHT = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
];

const xy = (i) => [Math.floor(i / N), i % N];

function flipsFor(board, i, player) {
  if (board[i] !== 0) return null;
  const [r, c] = xy(i);
  const out = [];
  for (const [dr, dc] of DIRS) {
    const run = [];
    let rr = r + dr;
    let cc = c + dc;
    while (rr >= 0 && rr < N && cc >= 0 && cc < N) {
      const v = board[rr * N + cc];
      if (v === 0) break;
      if (v === player) {
        if (run.length) out.push(...run);
        break;
      }
      run.push(rr * N + cc);
      rr += dr;
      cc += dc;
    }
  }
  return out.length ? out : null;
}

function legalMoves(board, player) {
  const moves = [];
  for (let i = 0; i < N * N; i++) {
    const flips = flipsFor(board, i, player);
    if (flips) moves.push({ i, flips });
  }
  return moves;
}

function apply(board, move, player) {
  const next = board.slice();
  next[move.i] = player;
  for (const f of move.flips) next[f] = player;
  return next;
}

function evaluate(board) {
  let score = 0;
  for (let i = 0; i < N * N; i++) {
    if (board[i] === AI) score += WEIGHT[i];
    else if (board[i] === HUMAN) score -= WEIGHT[i];
  }
  return score;
}

function search(board, player, depth, alpha, beta) {
  const moves = legalMoves(board, player);
  if (!moves.length) {
    if (!legalMoves(board, player === AI ? HUMAN : AI).length) {
      // game over: material difference
      let diff = 0;
      for (let i = 0; i < N * N; i++) diff += board[i] === AI ? 1 : board[i] === HUMAN ? -1 : 0;
      return diff * 1000;
    }
    return search(board, player === AI ? HUMAN : AI, depth, alpha, beta);
  }
  if (depth === 0) return evaluate(board);

  if (player === AI) {
    let best = -Infinity;
    for (const mv of moves) {
      const val = search(apply(board, mv, AI), HUMAN, depth - 1, alpha, beta);
      if (val > best) best = val;
      alpha = Math.max(alpha, val);
      if (alpha >= beta) break;
    }
    return best;
  }
  let worst = Infinity;
  for (const mv of moves) {
    const val = search(apply(board, mv, HUMAN), AI, depth - 1, alpha, beta);
    if (val < worst) worst = val;
    beta = Math.min(beta, val);
    if (alpha >= beta) break;
  }
  return worst;
}

export default {
  id: 'reversi',
  title: 'Reversi',
  tagline: 'Othello against an alpha-beta search that weights corners and punishes giving them away.',
  genre: 'Board',
  tags: ['mouse', 'ai', 'strategy'],
  controls: [
    ['Click a dot', 'Place a disc'],
    ['R', 'New game'],
  ],

  mount(stage) {
    const wrap = el('div', { class: 'rv-wrap' });
    const youEl = el('span', { html: 'You <b>2</b>' });
    const aiEl = el('span', { html: 'CPU <b>2</b>' });
    const turnEl = el('span', { html: 'Your move' });
    const bestEl = el('span', { html: `Wins <b>${getBest('reversi')}</b>` });
    const bar = el('div', { class: 'hud', style: 'max-width:460px' }, [
      el('div', { class: 'hud-group' }, [youEl, aiEl]),
      el('div', { class: 'hud-group' }, [turnEl]),
    ]);
    const grid = el('div', { class: 'rv-grid', role: 'grid', 'aria-label': 'Reversi board' });
    const msg = el('p', { class: 'lede', style: 'font-size:13px;text-align:center;margin:0', text: 'You play the pale discs. Dots show your legal moves.' });
    wrap.append(bar, grid, msg);
    wrap.append(el('div', { class: 'filters', style: 'justify-content:center;margin:0' }, [
      bestEl,
      el('button', { class: 'filter', type: 'button', text: 'New game', onclick: () => reset() }),
    ]));
    stage.append(wrap);

    let board = new Array(N * N).fill(0);
    let turn = HUMAN;
    let busy = false;
    let dead = false;
    let wins = getBest('reversi');
    let lastMove = -1;
    let over = false;
    const cells = [];

    function build() {
      grid.innerHTML = '';
      cells.length = 0;
      for (let i = 0; i < N * N; i++) {
        const btn = el('button', {
          class: 'rv-cell', type: 'button',
          'aria-label': `Row ${Math.floor(i / N) + 1} column ${(i % N) + 1}`,
          onclick: () => play(i),
        });
        cells.push(btn);
        grid.append(btn);
      }
    }

    function counts() {
      let h = 0;
      let a = 0;
      for (const v of board) {
        if (v === HUMAN) h++;
        else if (v === AI) a++;
      }
      return { h, a };
    }

    function paint() {
      const moves = turn === HUMAN && !busy && !over ? new Map(legalMoves(board, HUMAN).map((m) => [m.i, true])) : new Map();
      for (let i = 0; i < N * N; i++) {
        const cell = cells[i];
        cell.className = 'rv-cell';
        cell.innerHTML = '';
        if (board[i] === HUMAN) cell.append(el('span', { class: 'rv-disc human' }));
        else if (board[i] === AI) cell.append(el('span', { class: 'rv-disc ai' }));
        else if (moves.has(i)) cell.append(el('span', { class: 'rv-dot' }));
        if (i === lastMove) cell.classList.add('last');
      }
      const { h, a } = counts();
      youEl.innerHTML = `You <b>${h}</b>`;
      aiEl.innerHTML = `CPU <b>${a}</b>`;
      turnEl.innerHTML = over ? 'Finished' : turn === HUMAN ? 'Your move' : busy ? 'Thinking…' : 'CPU';
      bestEl.innerHTML = `Wins <b>${wins}</b>`;
    }

    function endGame(reason) {
      over = true;
      const { h, a } = counts();
      if (h > a) {
        wins += 1;
        submitScore('reversi', wins);
        sound.win();
        msg.innerHTML = `<strong style="color:#7cf6c8">You win ${h}–${a}.</strong> New game?`;
      } else if (a > h) {
        sound.bad();
        msg.innerHTML = `<strong style="color:#ff8ca1">CPU wins ${a}–${h}.</strong> New game?`;
      } else {
        sound.click();
        msg.innerHTML = `<strong>Draw ${h}–${a}.</strong> New game?`;
      }
      if (reason === 'wiped') msg.innerHTML = `<strong>Wiped out.</strong> ${msg.innerHTML}`;
      paint();
    }

    function aiMove() {
      busy = true;
      paint();
      setTimeout(() => {
        if (dead) return;
        const moves = legalMoves(board, AI);
        if (!moves.length) {
          const humanMoves = legalMoves(board, HUMAN);
          busy = false;
          if (!humanMoves.length) {
            endGame('wiped');
            return;
          }
          turn = HUMAN;
          paint();
          return;
        }
        let best = -Infinity;
        let pick = moves[0];
        for (const mv of moves) {
          const val = search(apply(board, mv, AI), HUMAN, 3, -Infinity, Infinity);
          if (val > best) {
            best = val;
            pick = mv;
          }
        }
        board = apply(board, pick, AI);
        lastMove = pick.i;
        turn = HUMAN;
        busy = false;
        sound.tone(300, 0.07, 'triangle', 0.035);
        paint();
        const humanMoves = legalMoves(board, HUMAN);
        const aiMoves = legalMoves(board, AI);
        if (!humanMoves.length && !aiMoves.length) endGame();
      }, 260);
    }

    function play(i) {
      if (busy || over || dead || turn !== HUMAN) return;
      const move = legalMoves(board, HUMAN).find((m) => m.i === i);
      if (!move) {
        sound.bad();
        return;
      }
      board = apply(board, move, HUMAN);
      lastMove = i;
      turn = AI;
      sound.tone(520, 0.06, 'square', 0.04);
      paint();
      aiMove();
    }

    function reset() {
      board = new Array(N * N).fill(0);
      board[3 * N + 3] = AI;
      board[3 * N + 4] = HUMAN;
      board[4 * N + 3] = HUMAN;
      board[4 * N + 4] = AI;
      turn = HUMAN;
      busy = false;
      over = false;
      lastMove = -1;
      msg.textContent = 'You play the pale discs. Dots show your legal moves.';
      paint();
    }

    const onKey = (e) => {
      if (e.key === 'r' || e.key === 'R') reset();
    };
    window.addEventListener('keydown', onKey);

    build();
    reset();

    return {
      restart() {
        reset();
      },
      destroy() {
        dead = true;
        window.removeEventListener('keydown', onKey);
        wrap.remove();
      },
    };
  },
};

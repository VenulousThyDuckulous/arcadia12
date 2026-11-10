import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { el } from '../lib/util.js';

const COLS = 7;
const ROWS = 6;
const EMPTY = 0;
const RED = 1;
const YELLOW = 2;

const idx = (r, c) => r * COLS + c;

const WIN_LINES = (() => {
  const lines = [];
  // horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) lines.push([0, 1, 2, 3].map((i) => idx(r, c + i)));
  }
  // vertical
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r <= ROWS - 4; r++) lines.push([0, 1, 2, 3].map((i) => idx(r + i, c)));
  }
  // diagonals
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      lines.push([0, 1, 2, 3].map((i) => idx(r + i, c + i)));
      lines.push([0, 1, 2, 3].map((i) => idx(r + 3 - i, c + i)));
    }
  }
  return lines;
})();

function boardFrom(cells) {
  return cells.slice();
}

function landingRow(board, col) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[idx(r, col)] === EMPTY) return r;
  }
  return -1;
}

function winner(board) {
  for (const line of WIN_LINES) {
    const [a, b, c, d] = line;
    const v = board[a];
    if (v && v === board[b] && v === board[c] && v === board[d]) return { player: v, line };
  }
  return null;
}

function evaluate(board, me) {
  const opp = me === RED ? YELLOW : RED;
  let score = 0;
  for (const line of WIN_LINES) {
    let mine = 0;
    let theirs = 0;
    for (const i of line) {
      if (board[i] === me) mine++;
      else if (board[i] === opp) theirs++;
    }
    if (mine && theirs) continue;
    if (mine === 4) score += 1_000_000;
    else if (mine === 3) score += 120;
    else if (mine === 2) score += 12;
    else if (mine === 1) score += 1;
    if (theirs === 4) score -= 1_000_000;
    else if (theirs === 3) score -= 140;
    else if (theirs === 2) score -= 14;
    else if (theirs === 1) score -= 1;
  }
  // centre control
  for (let r = 0; r < ROWS; r++) {
    if (board[idx(r, 3)] === me) score += 6;
    else if (board[idx(r, 3)] === opp) score -= 6;
  }
  return score;
}

const ORDER = [3, 2, 4, 1, 5, 0, 6];

function search(board, depth, alpha, beta, toMove, me) {
  const win = winner(board);
  if (win) return win.player === me ? 900_000 + depth * 100 : -900_000 - depth * 100;
  let moves = 0;
  for (let c = 0; c < COLS; c++) if (landingRow(board, c) >= 0) moves++;
  if (!moves) return 0;
  if (depth === 0) return evaluate(board, me);

  if (toMove === me) {
    let best = -Infinity;
    for (const c of ORDER) {
      const r = landingRow(board, c);
      if (r < 0) continue;
      board[idx(r, c)] = me;
      const val = search(board, depth - 1, alpha, beta, me === RED ? YELLOW : RED, me);
      board[idx(r, c)] = EMPTY;
      if (val > best) best = val;
      alpha = Math.max(alpha, val);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const c of ORDER) {
    const r = landingRow(board, c);
    if (r < 0) continue;
    board[idx(r, c)] = toMove;
    const val = search(board, depth - 1, alpha, beta, me, me);
    board[idx(r, c)] = EMPTY;
    if (val < best) best = val;
    beta = Math.min(beta, val);
    if (alpha >= beta) break;
  }
  return best;
}

function pickMove(cells, me, depth) {
  const board = boardFrom(cells);
  let bestScore = -Infinity;
  let bestCol = 3;
  for (const c of ORDER) {
    const r = landingRow(board, c);
    if (r < 0) continue;
    board[idx(r, c)] = me;
    const val = search(board, depth - 1, -Infinity, Infinity, me === RED ? YELLOW : RED, me);
    board[idx(r, c)] = EMPTY;
    if (val > bestScore) {
      bestScore = val;
      bestCol = c;
    }
  }
  return bestCol;
}

export default {
  id: 'connect4',
  title: 'Four in a Row',
  tagline: 'Connect Four against a real alpha-beta minimax opponent — not a random dropper with a friendly face.',
  genre: 'Board',
  tags: ['mouse', 'ai', '2 player'],
  controls: [['Click', 'Drop a disc'], ['1 – 7', 'Drop in column'], ['R', 'New game']],

  mount(stage) {
    const wrap = el('div', { class: 'c4-wrap' });
    const statusEl = el('span', { html: 'Your turn' });
    const scoreEl = el('span', { html: 'Wins <b>0</b>' });
    const bar = el('div', { class: 'hud', style: 'max-width:560px' }, [
      el('div', { class: 'hud-group' }, [statusEl, scoreEl]),
    ]);
    const controls = el('div', { class: 'filters', style: 'justify-content:center;margin:0' });

    const boardEl = el('div', { class: 'c4-board', role: 'grid', 'aria-label': 'Connect four board' });
    wrap.append(bar, boardEl, controls);
    stage.append(wrap);

    const diffBtns = [
      { key: 'easy', label: 'Easy', depth: 2 },
      { key: 'normal', label: 'Normal', depth: 4 },
      { key: 'hard', label: 'Hard', depth: 6 },
    ].map((d) => {
      const btn = el('button', {
        class: 'filter', type: 'button', text: d.label,
        'aria-pressed': String(d.key === 'normal'),
        onclick: () => {
          depth = d.depth;
          diffBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === d.key)));
          sound.click();
          reset();
        },
      });
      btn.dataset.key = d.key;
      return btn;
    });
    const again = el('button', { class: 'filter', type: 'button', text: 'New game', onclick: () => reset() });
    controls.append(...diffBtns, again);

    let depth = 4;
    let cells = new Array(ROWS * COLS).fill(EMPTY);
    let turn = RED;
    let over = false;
    let busy = false;
    let wins = 0;
    let winLine = [];
    let lastMove = null;

    const colButtons = [];

    function buildBoard() {
      boardEl.innerHTML = '';
      colButtons.length = 0;
      for (let c = 0; c < COLS; c++) {
        const col = el('button', {
          class: 'c4-col', type: 'button',
          'aria-label': `Drop in column ${c + 1}`,
          onclick: () => play(c),
        });
        for (let r = 0; r < ROWS; r++) {
          col.append(el('div', { class: 'c4-slot', dataset: { r: String(r), c: String(c) } }));
        }
        colButtons.push(col);
        boardEl.append(col);
      }
    }

    function paint() {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const slot = boardEl.children[c]?.children[r];
          if (!slot) continue;
          const v = cells[idx(r, c)];
          slot.className = 'c4-slot';
          if (v === RED) slot.classList.add('red');
          else if (v === YELLOW) slot.classList.add('yellow');
          if (winLine.includes(idx(r, c))) slot.classList.add('win');
        }
      }
      scoreEl.innerHTML = `Wins <b>${wins}</b>`;
      if (over) return;
      statusEl.innerHTML = turn === RED
        ? '<span class="live">Your turn</span>'
        : busy ? '<span class="live">Thinking…</span>' : 'Computer';
    }

    function reset() {
      cells = new Array(ROWS * COLS).fill(EMPTY);
      turn = RED;
      over = false;
      busy = false;
      winLine = [];
      lastMove = null;
      statusEl.innerHTML = '<span class="live">Your turn</span>';
      paint();
    }

    function endGame(result) {
      over = true;
      if (result === 'win') {
        wins += 1;
        submitScore('connect4', wins);
        statusEl.innerHTML = '<span class="live">You win.</span>';
        sound.win();
      } else if (result === 'lose') {
        statusEl.innerHTML = 'Computer wins.';
        sound.bad();
      } else {
        statusEl.innerHTML = 'Draw.';
        sound.click();
      }
      paint();
    }

    function play(col) {
      if (over || busy || turn !== RED) return;
      const r = landingRow(cells, col);
      if (r < 0) return;
      cells[idx(r, col)] = RED;
      lastMove = idx(r, col);
      sound.tone(420, 0.06, 'triangle', 0.04);
      const win = winner(cells);
      paint();
      if (win) {
        winLine = win.line;
        paint();
        endGame('win');
        return;
      }
      if (!cells.includes(EMPTY)) {
        endGame('draw');
        return;
      }
      turn = YELLOW;
      busy = true;
      paint();
      setTimeout(() => {
        const col2 = pickMove(cells, YELLOW, depth);
        const r2 = landingRow(cells, col2);
        if (r2 >= 0) {
          cells[idx(r2, col2)] = YELLOW;
          sound.tone(300, 0.06, 'triangle', 0.04);
        }
        busy = false;
        turn = RED;
        const win2 = winner(cells);
        if (win2) {
          winLine = win2.line;
          paint();
          endGame('lose');
          return;
        }
        if (!cells.includes(EMPTY)) {
          endGame('draw');
          return;
        }
        paint();
      }, 220);
    }

    const onKey = (e) => {
      if (e.key === 'r' || e.key === 'R') {
        reset();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 7) play(n - 1);
    };
    window.addEventListener('keydown', onKey);

    buildBoard();
    paint();

    return {
      restart() { reset(); },
      destroy() {
        window.removeEventListener('keydown', onKey);
        wrap.remove();
      },
    };
  },
};

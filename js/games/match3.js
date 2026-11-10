import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { el, sleep, randInt } from '../lib/util.js';

const N = 8;
const TYPES = 6;
const GLYPHS = ['◆', '●', '▲', '■', '★', '✦'];
const MOVES = 30;

export default {
  id: 'match3',
  title: 'Gem Cascade',
  tagline: 'A proper match-3: swaps only stick when they create a line, matches collapse under gravity, and chains multiply.',
  genre: 'Puzzle',
  tags: ['mouse', 'cascade', 'combos'],
  controls: [
    ['Click two gems', 'Swap them'],
    ['R', 'New board'],
  ],

  mount(stage) {
    const wrap = el('div', { class: 'm3-wrap' });

    const scoreEl = el('span', { html: 'Score <b>0</b>' });
    const movesEl = el('span', { html: `Moves <b>${MOVES}</b>` });
    const bestEl = el('span', { html: `Best <b>${getBest('match3')}</b>` });
    const chainEl = el('span', { text: '' });
    const bar = el('div', { class: 'hud', style: 'max-width:460px' }, [
      el('div', { class: 'hud-group' }, [scoreEl, movesEl]),
      el('div', { class: 'hud-group' }, [bestEl, chainEl]),
    ]);

    const grid = el('div', { class: 'm3-grid' });
    const msg = el('p', { class: 'lede', style: 'font-size:13px;text-align:center;margin:0', text: 'Swap adjacent gems to line up three or more. Chains score more.' });
    wrap.append(bar, grid, msg);
    stage.append(wrap);

    let board = new Array(N * N).fill(0);
    let cells = [];
    let selected = -1;
    let busy = false;
    let dead = false;
    let score = 0;
    let moves = MOVES;
    let over = false;

    function makeBoard() {
      board = new Array(N * N).fill(0);
      for (let i = 0; i < N * N; i++) {
        const banned = new Set();
        const r = Math.floor(i / N);
        const c = i % N;
        if (c >= 2 && board[i - 1] === board[i - 2]) banned.add(board[i - 1]);
        if (r >= 2 && board[i - N] === board[i - 2 * N]) banned.add(board[i - N]);
        let v = randInt(0, TYPES - 1);
        let guard = 0;
        while (banned.has(v) && guard++ < 20) v = randInt(0, TYPES - 1);
        board[i] = v;
      }
      if (matched().size) return makeBoard();
      return board;
    }

    function matched() {
      const hit = new Set();
      for (let r = 0; r < N; r++) {
        let run = 1;
        for (let c = 1; c <= N; c++) {
          const same = c < N && board[r * N + c] === board[r * N + c - 1] && board[r * N + c] >= 0;
          if (same) run++;
          else {
            if (run >= 3) for (let k = c - run; k < c; k++) hit.add(r * N + k);
            run = 1;
          }
        }
      }
      for (let c = 0; c < N; c++) {
        let run = 1;
        for (let r = 1; r <= N; r++) {
          const same = r < N && board[r * N + c] === board[(r - 1) * N + c] && board[r * N + c] >= 0;
          if (same) run++;
          else {
            if (run >= 3) for (let k = r - run; k < r; k++) hit.add(k * N + c);
            run = 1;
          }
        }
      }
      return hit;
    }

    function buildGrid() {
      grid.innerHTML = '';
      cells = [];
      for (let i = 0; i < N * N; i++) {
        const cell = el('button', {
          class: 'm3-cell', type: 'button',
          'aria-label': `Cell ${Math.floor(i / N) + 1}, ${(i % N) + 1}`,
          onclick: () => pick(i),
        });
        const gem = el('span', { class: 'm3-gem' });
        cell.append(gem);
        cells.push({ cell, gem });
        grid.append(cell);
      }
    }

    function paint() {
      for (let i = 0; i < N * N; i++) {
        const v = board[i];
        const { cell, gem } = cells[i];
        cell.className = 'm3-cell' + (i === selected ? ' sel' : '');
        gem.className = 'm3-gem g' + v;
        gem.textContent = GLYPHS[v];
      }
      scoreEl.innerHTML = `Score <b>${score.toLocaleString('en-US')}</b>`;
      movesEl.innerHTML = `Moves <b>${moves}</b>`;
      const best = Math.max(getBest('match3'), score);
      bestEl.innerHTML = `Best <b>${best.toLocaleString('en-US')}</b>`;
    }

    function adjacent(a, b) {
      const ra = Math.floor(a / N);
      const ca = a % N;
      const rb = Math.floor(b / N);
      const cb = b % N;
      return Math.abs(ra - rb) + Math.abs(ca - cb) === 1;
    }

    function swapValues(a, b) {
      const t = board[a];
      board[a] = board[b];
      board[b] = t;
    }

    function collapse() {
      for (let c = 0; c < N; c++) {
        let write = N - 1;
        for (let r = N - 1; r >= 0; r--) {
          const v = board[r * N + c];
          if (v >= 0) {
            board[write * N + c] = v;
            write--;
          }
        }
        for (let r = write; r >= 0; r--) {
          board[r * N + c] = randInt(0, TYPES - 1);
        }
      }
    }

    async function resolve() {
      let chain = 0;
      while (!dead) {
        const hit = matched();
        if (!hit.size) break;
        chain++;
        for (const i of hit) cells[i].gem.classList.add('pop');
        sound.tone(380 + chain * 110, 0.07, 'triangle', 0.045);
        await sleep(180);
        if (dead) return chain;
        score += hit.size * 10 * chain;
        for (const i of hit) board[i] = -1;
        collapse();
        paint();
        await sleep(130);
        if (dead) return chain;
      }
      if (chain > 1) {
        chainEl.innerHTML = `<span style="color:#7cf6c8">Chain ×${chain}</span>`;
        sound.good();
      }
      return chain;
    }

    async function pick(i) {
      if (busy || dead || over) return;
      if (selected === -1) {
        selected = i;
        sound.click();
        paint();
        return;
      }
      if (selected === i) {
        selected = -1;
        paint();
        return;
      }
      if (!adjacent(selected, i)) {
        selected = i;
        sound.click();
        paint();
        return;
      }

      const a = selected;
      const b = i;
      selected = -1;
      busy = true;
      swapValues(a, b);
      paint();
      await sleep(90);
      if (dead) return;

      if (!matched().size) {
        swapValues(a, b);
        sound.bad();
        paint();
        await sleep(140);
        busy = false;
        return;
      }

      moves -= 1;
      paint();
      await resolve();
      chainEl.textContent = '';
      if (dead) return;

      if (moves <= 0) {
        over = true;
        const record = submitScore('match3', score);
        msg.innerHTML = `<strong style="color:${record ? '#7cf6c8' : '#e9edf7'}">No moves left — ${score.toLocaleString('en-US')} points.</strong> Click any gem to play again.`;
        sound.win();
      }
      busy = false;
    }

    function reset() {
      dead = false;
      over = false;
      busy = false;
      selected = -1;
      score = 0;
      moves = MOVES;
      chainEl.textContent = '';
      msg.textContent = 'Swap adjacent gems to line up three or more. Chains score more.';
      makeBoard();
      paint();
    }

    const onKey = (e) => {
      if (e.key === 'r' || e.key === 'R') reset();
    };
    window.addEventListener('keydown', onKey);

    const onGridClick = () => {
      if (over) reset();
    };
    grid.addEventListener('click', onGridClick);

    buildGrid();
    makeBoard();
    paint();

    return {
      restart() {
        reset();
      },
      destroy() {
        dead = true;
        window.removeEventListener('keydown', onKey);
        grid.removeEventListener('click', onGridClick);
        wrap.remove();
      },
    };
  },
};

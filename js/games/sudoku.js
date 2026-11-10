import { sound } from '../lib/audio.js';
import { el } from '../lib/util.js';

const rowOf = (i) => Math.floor(i / 9);
const colOf = (i) => i % 9;
const boxOf = (i) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function candidates(grid, i) {
  const used = new Set();
  const r = rowOf(i);
  const c = colOf(i);
  for (let k = 0; k < 9; k++) {
    used.add(grid[r * 9 + k]);
    used.add(grid[k * 9 + c]);
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) used.add(grid[(br + dr) * 9 + bc + dc]);
  }
  const out = [];
  for (let v = 1; v <= 9; v++) if (!used.has(v)) out.push(v);
  return out;
}

function solve(grid) {
  const i = grid.indexOf(0);
  if (i === -1) return true;
  for (const v of shuffled(candidates(grid, i))) {
    grid[i] = v;
    if (solve(grid)) return true;
    grid[i] = 0;
  }
  return false;
}

function countSolutions(grid, limit = 2) {
  const i = grid.indexOf(0);
  if (i === -1) return 1;
  let total = 0;
  for (const v of candidates(grid, i)) {
    grid[i] = v;
    total += countSolutions(grid, limit - total);
    grid[i] = 0;
    if (total >= limit) break;
  }
  return total;
}

function makePuzzle(removeTarget) {
  const solution = new Array(81).fill(0);
  solve(solution);
  const puzzle = solution.slice();
  const order = shuffled([...Array(81).keys()]);
  let removed = 0;
  for (const i of order) {
    if (removed >= removeTarget) break;
    const backup = puzzle[i];
    if (!backup) continue;
    puzzle[i] = 0;
    const copy = puzzle.slice();
    if (countSolutions(copy, 2) !== 1) puzzle[i] = backup;
    else removed += 1;
  }
  return { puzzle, solution, removed };
}

const DIFFICULTIES = {
  easy: { label: 'Easy', target: 42 },
  medium: { label: 'Medium', target: 50 },
  hard: { label: 'Hard', target: 57 },
};

export default {
  id: 'sudoku',
  title: 'Sudoku',
  tagline: 'Generated puzzles with a uniqueness check, so every board has exactly one solution and no guesswork.',
  genre: 'Logic',
  tags: ['keyboard', 'generated', 'timer'],
  controls: [['Click', 'Select cell'], ['1 – 9', 'Enter digit'], ['Backspace', 'Erase'], ['R', 'New puzzle']],

  mount(stage) {
    const wrap = el('div', { class: 'su-wrap' });
    const timeEl = el('span', { html: 'Time <b>0:00</b>' });
    const givenEl = el('span', { html: 'Given <b>0</b>' });
    const diffEl = el('span', { html: 'Medium' });
    const bar = el('div', { class: 'hud', style: 'max-width:460px' }, [
      el('div', { class: 'hud-group' }, [timeEl, givenEl]),
      el('div', { class: 'hud-group' }, [diffEl]),
    ]);

    const diffRow = el('div', { class: 'filters', style: 'justify-content:center;margin:0' });
    const grid = el('div', { class: 'su-grid', role: 'grid', 'aria-label': 'Sudoku grid' });
    const pad = el('div', { class: 'su-pad' });
    const msg = el('p', { class: 'lede', style: 'font-size:13px;text-align:center;margin:0', text: 'Every puzzle is generated fresh and checked for a single solution.' });
    wrap.append(bar, diffRow, grid, pad, msg);
    stage.append(wrap);

    let difficulty = 'medium';
    let values = new Array(81).fill(0);
    let givens = new Array(81).fill(false);
    let selected = -1;
    let started = false;
    let solved = false;
    let startTime = 0;
    let timerId = null;
    let elapsed = 0;
    let solution = [];

    const cells = [];

    const diffButtons = Object.entries(DIFFICULTIES).map(([key, d]) => {
      const btn = el('button', {
        class: 'filter', type: 'button', text: d.label,
        'aria-pressed': String(key === difficulty),
        onclick: () => {
          difficulty = key;
          diffButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === key)));
          sound.click();
          reset();
        },
      });
      btn.dataset.key = key;
      return btn;
    });
    diffRow.append(...diffButtons);

    for (let i = 0; i < 81; i++) {
      const btn = el('button', {
        class: 'su-cell', type: 'button', 'aria-label': `Row ${rowOf(i) + 1} column ${colOf(i) + 1}`,
        onclick: () => select(i),
      });
      if (colOf(i) % 3 === 0 && colOf(i) !== 0) btn.dataset.br = '1';
      if (rowOf(i) % 3 === 0 && rowOf(i) !== 0) btn.dataset.bt = '1';
      cells.push(btn);
      grid.append(btn);
    }

    for (let n = 1; n <= 9; n++) {
      pad.append(el('button', {
        class: 'su-key', type: 'button', text: String(n),
        onclick: () => place(n),
      }));
    }
    pad.append(el('button', { class: 'su-key erase', type: 'button', text: 'Erase', onclick: () => place(0) }));

    function reset() {
      clearInterval(timerId);
      timerId = null;
      started = false;
      solved = false;
      elapsed = 0;
      selected = -1;
      const target = DIFFICULTIES[difficulty].target;
      const { puzzle, solution: sol } = makePuzzle(target);
      values = puzzle.slice();
      solution = sol;
      givens = puzzle.map((v) => v !== 0);
      diffEl.textContent = DIFFICULTIES[difficulty].label;
      msg.innerHTML = 'Every puzzle is generated fresh and checked for a single solution.';
      paint();
    }

    function startTimer() {
      if (started) return;
      started = true;
      startTime = Date.now();
      timerId = setInterval(() => {
        elapsed = Math.floor((Date.now() - startTime) / 1000);
        const m = Math.floor(elapsed / 60);
        const sec = String(elapsed % 60).padStart(2, '0');
        timeEl.innerHTML = `Time <b>${m}:${sec}</b>`;
      }, 500);
    }

    function conflicts() {
      const bad = new Set();
      for (let i = 0; i < 81; i++) {
        if (!values[i]) continue;
        for (let j = 0; j < 81; j++) {
          if (i === j || values[j] !== values[i]) continue;
          if (rowOf(i) === rowOf(j) || colOf(i) === colOf(j) || boxOf(i) === boxOf(j)) {
            bad.add(i);
            bad.add(j);
          }
        }
      }
      return bad;
    }

    function paint() {
      const sel = selected >= 0 ? values[selected] : 0;
      const bad = conflicts();
      const selectedRow = selected >= 0 ? rowOf(selected) : -1;
      const selectedCol = selected >= 0 ? colOf(selected) : -1;
      const selectedBox = selected >= 0 ? boxOf(selected) : -1;

      givenEl.innerHTML = `Given <b>${givens.filter(Boolean).length}</b>`;

      cells.forEach((cell, i) => {
        cell.className = 'su-cell';
        if (colOf(i) % 3 === 0 && colOf(i) !== 0) cell.dataset.br = '1';
        else delete cell.dataset.br;
        if (rowOf(i) % 3 === 0 && rowOf(i) !== 0) cell.dataset.bt = '1';
        else delete cell.dataset.bt;

        const v = values[i];
        cell.textContent = v ? String(v) : '';
        if (givens[i]) cell.classList.add('given');

        const isPeer = selected >= 0 && (rowOf(i) === selectedRow || colOf(i) === selectedCol || boxOf(i) === selectedBox);
        if (isPeer) cell.classList.add('peer');
        if (sel && v === sel) cell.classList.add('same');
        if (i === selected) cell.classList.add('sel');
        if (v && bad.has(i)) cell.classList.add('bad');
      });
    }

    function select(i) {
      if (solved) return;
      selected = i;
      sound.click();
      paint();
    }

    function place(n) {
      if (selected < 0 || solved) return;
      if (givens[selected]) return;
      startTimer();
      values[selected] = n;
      if (n) sound.tone(360 + n * 42, 0.05, 'square', 0.03);
      else sound.tone(200, 0.04, 'triangle', 0.02);
      paint();
      checkWin();
    }

    function checkWin() {
      if (values.includes(0)) return;
      const bad = conflicts();
      if (bad.size) return;
      solved = true;
      clearInterval(timerId);
      elapsed = Math.floor((Date.now() - startTime) / 1000);
      const m = Math.floor(elapsed / 60);
      const sec = String(elapsed % 60).padStart(2, '0');
      msg.innerHTML = `<strong style="color:#7cf6c8">Solved in ${m}:${sec}.</strong> Difficulty: ${DIFFICULTIES[difficulty].label}.`;
      sound.win();
    }

    const onKey = (e) => {
      if (e.key >= '1' && e.key <= '9') {
        place(Number(e.key));
      } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        e.preventDefault();
        place(0);
      } else if (e.key === 'r' || e.key === 'R') {
        reset();
      } else if (selected >= 0 && e.key.startsWith('Arrow')) {
        e.preventDefault();
        let r = rowOf(selected);
        let c = colOf(selected);
        if (e.key === 'ArrowUp') r = (r + 8) % 9;
        if (e.key === 'ArrowDown') r = (r + 1) % 9;
        if (e.key === 'ArrowLeft') c = (c + 8) % 9;
        if (e.key === 'ArrowRight') c = (c + 1) % 9;
        select(r * 9 + c);
      }
    };
    window.addEventListener('keydown', onKey);

    reset();

    return {
      restart() { reset(); },
      destroy() {
        clearInterval(timerId);
        window.removeEventListener('keydown', onKey);
        wrap.remove();
      },
    };
  },
};

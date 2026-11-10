import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { el } from '../lib/util.js';

const LEVELS = {
  easy: { label: 'Easy', cols: 9, rows: 9, mines: 10 },
  medium: { label: 'Medium', cols: 16, rows: 16, mines: 40 },
  hard: { label: 'Hard', cols: 16, rows: 22, mines: 70 },
};

export default {
  id: 'minesweeper',
  title: 'Minesweeper',
  tagline: 'Three board sizes, a guaranteed-safe first click, flood-fill reveals and chording for people who play it properly.',
  genre: 'Logic',
  tags: ['mouse', 'flags', 'timer'],
  controls: [['Click', 'Reveal'], ['Right-click / long press', 'Flag'], ['Double-click', 'Chord'], ['F', 'Flag mode']],

  mount(stage) {
    const wrap = el('div', { class: 'ms-wrap' });
    const timeEl = el('span', { html: 'Time <b>0</b>' });
    const minesEl = el('span', { html: 'Mines <b>10</b>' });
    const bestEl = el('span', { html: 'Best <b>—</b>' });
    const bar = el('div', { class: 'hud' }, [
      el('div', { class: 'hud-group' }, [timeEl, minesEl, bestEl]),
    ]);

    const modeRow = el('div', { class: 'filters', style: 'justify-content:center;margin:0' });
    const grid = el('div', { class: 'ms-grid' });
    const msg = el('p', { class: 'lede', style: 'font-size:13px;text-align:center;margin:0', html: 'Best times are stored per difficulty. Flag mode lets you tap to flag on touch screens.' });
    wrap.append(bar, modeRow, grid, msg);
    stage.append(wrap);

    let levelKey = 'easy';
    let cfg = LEVELS[levelKey];
    let cells = [];
    let started = false;
    let over = false;
    let won = false;
    let flags = 0;
    let revealed = 0;
    let startTime = 0;
    let elapsed = 0;
    let flagMode = false;
    let timerId = null;
    let pressTimer = null;

    const modeButtons = Object.entries(LEVELS).map(([key, lvl]) => {
      const btn = el('button', {
        class: 'filter', type: 'button', text: `${lvl.label} ${lvl.cols}×${lvl.rows}`,
        'aria-pressed': String(key === levelKey),
        onclick: () => {
          levelKey = key;
          cfg = LEVELS[key];
          modeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === key)));
          sound.click();
          reset();
        },
      });
      btn.dataset.key = key;
      return btn;
    });
    modeRow.append(...modeButtons);

    function bestKey() {
      return `minesweeper:${levelKey}`;
    }

    function neighbours(idx) {
      const { cols, rows } = cfg;
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      const out = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
        }
      }
      return out;
    }

    function reset() {
      clearInterval(timerId);
      timerId = null;
      started = false;
      over = false;
      won = false;
      flags = 0;
      revealed = 0;
      elapsed = 0;
      cells = Array.from({ length: cfg.cols * cfg.rows }, () => ({
        mine: false, open: false, flag: false, count: 0, boom: false,
      }));
      grid.style.gridTemplateColumns = `repeat(${cfg.cols}, 1fr)`;
      grid.style.maxWidth = cfg.cols === 9 ? '380px' : '560px';
      grid.innerHTML = '';
      cells.forEach((cell, i) => {
        const btn = el('button', {
          class: 'ms-cell', type: 'button',
          'aria-label': `Cell ${Math.floor(i / cfg.cols) + 1}, ${(i % cfg.cols) + 1}`,
        });
        btn.dataset.i = String(i);
        btn.addEventListener('click', () => tap(i));
        btn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          toggleFlag(i);
        });
        btn.addEventListener('dblclick', () => chord(i));
        btn.addEventListener('touchstart', () => {
          clearTimeout(pressTimer);
          pressTimer = setTimeout(() => toggleFlag(i), 420);
        }, { passive: true });
        btn.addEventListener('touchend', () => clearTimeout(pressTimer), { passive: true });
        btn.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });
        grid.append(btn);
      });
      paint();
    }

    function paint() {
      timeEl.innerHTML = `Time <b>${elapsed}</b>`;
      minesEl.innerHTML = `Mines <b>${Math.max(0, cfg.mines - flags)}</b>`;
      const best = getBest(bestKey());
      bestEl.innerHTML = `Best <b>${best ? `${1000000 - best}s` : '—'}</b>`;
      cells.forEach((cell, i) => {
        const btn = grid.children[i];
        if (!btn) return;
        btn.className = 'ms-cell';
        btn.textContent = '';
        if (cell.open) {
          btn.classList.add('open');
          if (cell.mine) {
            btn.classList.add('mine');
            btn.textContent = '✳';
            if (cell.boom) btn.classList.add('boom');
          } else if (cell.count > 0) {
            btn.textContent = String(cell.count);
            btn.classList.add(`n${cell.count}`);
          }
        } else if (cell.flag) {
          btn.classList.add('flag');
          btn.textContent = '⚑';
        } else if (over && cell.mine) {
          btn.classList.add('open', 'mine');
          btn.textContent = '✳';
        }
      });
      if (over && !won) btnEnsureDead();
    }

    function btnEnsureDead() {
      // make the losing cell obvious
      cells.forEach((cell, i) => {
        if (cell.boom) {
          const btn = grid.children[i];
          if (btn) btn.classList.add('boom');
        }
      });
    }

    function placeMines(safe) {
      const banned = new Set([safe, ...neighbours(safe)]);
      const pool = [];
      for (let i = 0; i < cells.length; i++) if (!banned.has(i)) pool.push(i);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      pool.slice(0, Math.min(cfg.mines, pool.length)).forEach((i) => { cells[i].mine = true; });
      cells.forEach((cell, i) => {
        cell.count = neighbours(i).filter((n) => cells[n].mine).length;
      });
    }

    function begin() {
      if (started) return;
      started = true;
      startTime = Date.now();
      timerId = setInterval(() => {
        elapsed = Math.floor((Date.now() - startTime) / 1000);
        timeEl.innerHTML = `Time <b>${elapsed}</b>`;
      }, 250);
    }

    function reveal(i) {
      const stack = [i];
      while (stack.length) {
        const idx = stack.pop();
        const cell = cells[idx];
        if (!cell || cell.open || cell.flag) continue;
        cell.open = true;
        revealed += 1;
        if (cell.count === 0 && !cell.mine) neighbours(idx).forEach((n) => {
          if (!cells[n].open && !cells[n].flag) stack.push(n);
        });
      }
    }

    function tap(i) {
      if (over) return;
      const cell = cells[i];
      if (flagMode) {
        toggleFlag(i);
        return;
      }
      if (cell.flag || cell.open) return;
      begin();
      if (!cell.mine && cells.every((c) => !c.mine)) placeMines(i);
      if (cell.mine) {
        cell.boom = true;
        lose();
        return;
      }
      reveal(i);
      sound.tone(520, 0.04, 'square', 0.028);
      checkWin();
      paint();
    }

    function toggleFlag(i) {
      if (over) return;
      const cell = cells[i];
      if (cell.open) return;
      begin();
      cell.flag = !cell.flag;
      flags += cell.flag ? 1 : -1;
      sound.tone(cell.flag ? 780 : 420, 0.05, 'triangle', 0.035);
      paint();
    }

    function chord(i) {
      const cell = cells[i];
      if (!cell.open || cell.count === 0 || over) return;
      const nbrs = neighbours(i);
      const flagCount = nbrs.filter((n) => cells[n].flag).length;
      if (flagCount !== cell.count) return;
      begin();
      let hitMine = false;
      nbrs.forEach((n) => {
        const ncell = cells[n];
        if (!ncell.flag && !ncell.open) {
          if (ncell.mine) {
            ncell.boom = true;
            hitMine = true;
          } else {
            reveal(n);
          }
        }
      });
      if (hitMine) lose();
      else {
        checkWin();
        sound.tone(600, 0.05, 'square', 0.03);
      }
      paint();
    }

    function checkWin() {
      const safeCells = cells.length - cfg.mines;
      if (revealed >= safeCells) {
        won = true;
        over = true;
        clearInterval(timerId);
        elapsed = Math.floor((Date.now() - startTime) / 1000);
        cells.forEach((c) => { if (c.mine) c.flag = true; });
        const prev = getBest(bestKey());
        const prevSeconds = prev ? 1000000 - prev : 0;
        // lower is better, so the stored value is inverted
        if (!prevSeconds || elapsed < prevSeconds) submitScore(bestKey(), 1000000 - elapsed);
        sound.win();
        paint();
        msg.innerHTML = `<strong style="color:#7cf6c8">Cleared in ${elapsed}s.</strong> Nice. Flag mode is on tap-and-hold.`;
      }
    }

    function lose() {
      over = true;
      clearInterval(timerId);
      cells.forEach((c) => { if (c.mine) c.open = true; });
      sound.bad();
      paint();
      msg.innerHTML = `<strong style="color:#ff5c7a">Boom.</strong> Press New game to try the same size again.`;
    }

    reset();
    paint();

    return {
      restart() { reset(); },
      destroy() {
        clearInterval(timerId);
        clearTimeout(pressTimer);
        wrap.remove();
      },
    };
  },
};

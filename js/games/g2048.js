import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { el } from '../lib/util.js';

const SIZE = 4;
const TILE_COLOURS = {
  2: '#eee9dd', 4: '#ece2c8', 8: '#f4b969', 16: '#f89a5b', 32: '#f9745f',
  64: '#f4553c', 128: '#e9cd63', 256: '#e7c247', 512: '#e5b52c', 1024: '#e8ab21',
  2048: '#f0a000', 4096: '#8f7bf0', 8192: '#6d5ce0',
};

const DIRS = {
  left: { dr: 0, dc: -1 }, right: { dr: 0, dc: 1 }, up: { dr: -1, dc: 0 }, down: { dr: 1, dc: 0 },
};

let uid = 1;

const emptyGrid = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

export default {
  id: 'g2048',
  title: '2048',
  tagline: 'The sliding-tile classic with animated merges, one-step undo and a grid that never lets you zone out.',
  genre: 'Puzzle',
  tags: ['keyboard', 'swipe', 'one more go'],
  controls: [['Arrows / WASD', 'Slide tiles'], ['U', 'Undo'], ['R', 'New game']],

  mount(stage) {
    const wrap = el('div', { class: 'g2048' });
    const scoreEl = el('span', { html: 'Score <b>0</b>' });
    const bestEl = el('span', { html: `Best <b>${getBest('g2048')}</b>` });
    const movesEl = el('span', { html: 'Moves <b>0</b>' });
    const bar = el('div', { class: 'hud', style: 'max-width:420px' }, [
      el('div', { class: 'hud-group' }, [scoreEl, bestEl, movesEl]),
    ]);
    const board = el('div', { class: 'board-2048', tabindex: '0', role: 'application', 'aria-label': '2048 board' });
    const hint = el('p', { class: 'lede', style: 'font-size:13px;text-align:center;margin:0', text: 'Arrow keys or swipe. Tiles with the same number merge when they collide.' });
    const stageWrap = el('div', { class: 'stage-wrap', style: 'max-width:420px' }, [board]);
    wrap.append(bar, stageWrap, hint);
    stage.append(wrap);

    // background cells
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        board.append(el('div', {
          class: 'cell-2048',
          style: `width:22.5%;height:22.5%;left:${2 + c * 23.5}%;top:${2 + r * 23.5}%`,
        }));
      }
    }

    const st = {
      grid: emptyGrid(),
      score: 0,
      moves: 0,
      over: false,
      won: false,
      busy: false,
      undo: null,
      best: getBest('g2048'),
    };

    const overlay = el('div', { class: 'overlay', style: 'display:none' });
    stageWrap.append(overlay);

    function paintHud() {
      scoreEl.innerHTML = `Score <b>${st.score.toLocaleString('en-US')}</b>`;
      st.best = Math.max(st.best, st.score);
      bestEl.innerHTML = `Best <b>${st.best.toLocaleString('en-US')}</b>`;
      movesEl.innerHTML = `Moves <b>${st.moves}</b>`;
    }

    function addTile(r, c, value, isNew = true) {
      const tile = { id: uid++, value, r, c, isNew, dead: false };
      st.grid[r][c] = tile;
      return tile;
    }

    function tileNode(tile) {
      const node = el('div', { class: 'tile-2048' });
      node.dataset.id = String(tile.id);
      place(node, tile);
      node.style.background = TILE_COLOURS[tile.value] || '#5b4bd8';
      node.innerHTML = `<span>${tile.value}</span>`;
      if (tile.value >= 1024) node.classList.add('big');
      board.append(node);
      return node;
    }

    function place(node, tile) {
      node.style.width = '22.5%';
      node.style.height = '22.5%';
      node.style.left = `${2 + tile.c * 23.5}%`;
      node.style.top = `${2 + tile.r * 23.5}%`;
    }

    function renderAll() {
      board.querySelectorAll('.tile-2048').forEach((n) => n.remove());
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const t = st.grid[r][c];
          if (t) tileNode(t);
        }
      }
    }

    const freeCells = () => {
      const out = [];
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!st.grid[r][c]) out.push([r, c]);
      return out;
    };

    function spawn() {
      const free = freeCells();
      if (!free.length) return;
      const [r, c] = free[Math.floor(Math.random() * free.length)];
      addTile(r, c, Math.random() < 0.9 ? 2 : 4);
    }

    function reset() {
      st.grid = emptyGrid();
      st.score = 0;
      st.moves = 0;
      st.over = false;
      st.won = false;
      st.busy = false;
      st.undo = null;
      overlay.style.display = 'none';
      spawn();
      spawn();
      renderAll();
      paintHud();
    }

    function hasMoves() {
      if (freeCells().length) return true;
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const v = st.grid[r][c].value;
          if (r + 1 < SIZE && st.grid[r + 1][c].value === v) return true;
          if (c + 1 < SIZE && st.grid[r][c + 1].value === v) return true;
        }
      }
      return false;
    }

    function snapshot() {
      return {
        grid: st.grid.map((row) => row.map((t) => (t ? { ...t } : null))),
        score: st.score,
        moves: st.moves,
      };
    }

    function move(dirName) {
      if (st.busy || st.over) return;
      const { dr, dc } = DIRS[dirName];
      const before = snapshot();

      const rows = [...Array(SIZE).keys()];
      const cols = [...Array(SIZE).keys()];
      const traversal = {
        rows: dr > 0 ? rows.slice().reverse() : rows,
        cols: dc > 0 ? cols.slice().reverse() : cols,
      };
      if (dr !== 0) {
        const ordered = dr > 0 ? [3, 2, 1, 0] : [0, 1, 2, 3];
        traversal.rows = ordered;
        traversal.cols = [0, 1, 2, 3];
      } else {
        const ordered = dc > 0 ? [3, 2, 1, 0] : [0, 1, 2, 3];
        traversal.cols = ordered;
        traversal.rows = [0, 1, 2, 3];
      }

      let moved = false;
      let gained = 0;
      const entries = [];

      for (const r of traversal.rows) {
        for (const c of traversal.cols) {
          const tile = st.grid[r][c];
          if (!tile) continue;
          st.grid[r][c] = null;
          let nr = r;
          let nc = c;
          let target = null;
          while (true) {
            const ar = nr + dr;
            const ac = nc + dc;
            if (ar < 0 || ar >= SIZE || ac < 0 || ac >= SIZE) break;
            const occupant = st.grid[ar][ac];
            if (occupant) {
              if (!occupant.mergedThisTurn && occupant.value === tile.value) {
                target = { r: ar, c: ac, merge: true };
              }
              break;
            }
            nr = ar;
            nc = ac;
          }
          if (target) {
            const survivor = st.grid[target.r][target.c];
            survivor.value *= 2;
            survivor.mergedThisTurn = true;
            gained += survivor.value;
            moved = true;
            entries.push({ tile, to: { r: target.r, c: target.c }, mergeInto: survivor, removed: true });
            st.score += survivor.value;
            if (survivor.value === 2048 && !st.won) st.won = true;
            if (survivor.value === 2048) sound.win();
          } else {
            st.grid[nr][nc] = tile;
            if (nr !== r || nc !== c) moved = true;
            entries.push({ tile, to: { r: nr, c: nc } });
          }
        }
      }

      if (!moved) {
        st.grid = before.grid;
        return;
      }

      st.moves += 1;
      st.undo = before;
      paintHud();

      // animate: move every surviving tile into place, then swap in merged values
      for (const entry of entries) {
        if (entry.removed) {
          const node = board.querySelector(`.tile-2048[data-id="${entry.tile.id}"]`);
          const survivor = entry.mergeInto;
          if (node) {
            node.style.left = `${2 + entry.to.c * 23.5}%`;
            node.style.top = `${2 + entry.to.r * 23.5}%`;
            node.style.zIndex = '2';
            setTimeout(() => node.remove(), 110);
          }
          const snode = board.querySelector(`.tile-2048[data-id="${survivor.id}"]`);
          if (snode) {
            setTimeout(() => {
              snode.innerHTML = `<span>${survivor.value}</span>`;
              snode.style.background = TILE_COLOURS[survivor.value] || '#5b4bd8';
              snode.classList.toggle('big', survivor.value >= 1024);
              snode.style.transform = 'scale(1.14)';
              setTimeout(() => { snode.style.transform = 'scale(1)'; }, 90);
            }, 105);
          }
        } else {
          const node = board.querySelector(`.tile-2048[data-id="${entry.tile.id}"]`);
          if (node) place(node, { r: entry.to.r, c: entry.to.c });
        }
      }
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const t = st.grid[r][c];
          if (t) delete t.mergedThisTurn;
        }
      }

      sound.tone(gained ? 520 : 300, 0.05, 'triangle', 0.03);
      if (gained) setTimeout(() => sound.tone(720, 0.06, 'triangle', 0.03), 60);

      st.busy = true;
      setTimeout(() => {
        st.busy = false;
        const before = freeCells().length;
        spawn();
        if (before >= 0) {
          // render only the newly spawned tile
          for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
              const t = st.grid[r][c];
              if (t && t.isNew && !board.querySelector(`.tile-2048[data-id="${t.id}"]`)) {
                const node = tileNode(t);
                node.style.transform = 'scale(.4)';
                node.style.opacity = '0';
                requestAnimationFrame(() => {
                  node.style.transition = 'transform .12s, opacity .12s';
                  node.style.transform = 'scale(1)';
                  node.style.opacity = '1';
                });
                t.isNew = false;
              }
            }
          }
        }
        if (!hasMoves()) {
          st.over = true;
          submitScore('g2048', st.score);
          showOverlay('No moves left', `You finished with ${st.score.toLocaleString('en-US')} points.`, 'Play again');
          sound.bad();
        } else if (st.won && overlay.style.display === 'none') {
          showOverlay('2048 reached', 'Keep going for a higher tile, or start fresh.', 'Keep playing', true);
        }
      }, 115);
    }

    function showOverlay(title, body, cta, dismissible = false) {
      overlay.innerHTML = '';
      overlay.style.display = 'grid';
      overlay.append(
        el('h3', { text: title }),
        el('p', { text: body }),
      );
      if (dismissible) {
        overlay.append(el('button', {
          class: 'pill-btn', type: 'button', text: cta,
          onclick: () => { overlay.style.display = 'none'; st.won = false; },
        }));
      } else {
        overlay.append(el('button', {
          class: 'pill-btn', type: 'button', text: 'Play again',
          onclick: () => reset(),
        }));
      }
    }

    function undo() {
      if (!st.undo || st.busy) return;
      st.grid = st.undo.grid;
      st.score = st.undo.score;
      st.moves = st.undo.moves;
      st.undo = null;
      st.over = false;
      overlay.style.display = 'none';
      renderAll();
      paintHud();
      sound.tone(360, 0.06, 'square', 0.03);
    }

    /* input */
    const onKey = (e) => {
      const map = {
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
        a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down',
      };
      if (map[e.key]) {
        e.preventDefault();
        move(map[e.key]);
      } else if (e.key === 'u' || e.key === 'U') {
        undo();
      } else if (e.key === 'r' || e.key === 'R') {
        reset();
      }
    };
    window.addEventListener('keydown', onKey);

    let sx = 0, sy = 0;
    const onTouchStart = (e) => {
      const t = e.changedTouches[0];
      sx = t.clientX; sy = t.clientY;
    };
    const onTouchEnd = (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
      else move(dy > 0 ? 'down' : 'up');
    };
    board.addEventListener('touchstart', onTouchStart, { passive: true });
    board.addEventListener('touchend', onTouchEnd, { passive: true });

    reset();

    return {
      restart() { reset(); },
      destroy() {
        window.removeEventListener('keydown', onKey);
        board.removeEventListener('touchstart', onTouchStart);
        board.removeEventListener('touchend', onTouchEnd);
        wrap.remove();
      },
    };
  },
};

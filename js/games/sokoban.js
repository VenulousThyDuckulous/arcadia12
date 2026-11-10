import { sound } from '../lib/audio.js';
import { el } from '../lib/util.js';

const LEVELS = [
  {
    name: 'First Push',
    map: [
      '#######',
      '#     #',
      '# @$. #',
      '#     #',
      '#######',
    ],
  },
  {
    name: 'Reposition',
    map: [
      '########',
      '#      #',
      '#  $ . #',
      '# @$ . #',
      '#      #',
      '########',
    ],
  },
  {
    name: 'Twins',
    map: [
      '########',
      '#      #',
      '# $  . #',
      '# $  . #',
      '#  @   #',
      '########',
    ],
  },
  {
    name: 'Around the Wall',
    map: [
      '########',
      '#   #  #',
      '# $ # .#',
      '#   #  #',
      '#   @  #',
      '#      #',
      '########',
    ],
  },
  {
    name: 'Corridor',
    map: [
      '#########',
      '#       #',
      '#  $ .  #',
      '# ### # #',
      '# $   . #',
      '#   @   #',
      '#########',
    ],
  },
  {
    name: 'Four Corners',
    map: [
      '#########',
      '#       #',
      '# $   . #',
      '#  $ .  #',
      '#  @    #',
      '#       #',
      '#########',
    ],
  },
];

const WALL = '#';

export default {
  id: 'sokoban',
  title: 'Warehouse',
  tagline: 'Six hand-designed Sokoban puzzles. Every box has exactly one place to go, and there is always a clean solution.',
  genre: 'Puzzle',
  tags: ['keyboard', 'levels', 'undo'],
  controls: [['Arrows / WASD', 'Walk'], ['U / Z', 'Undo'], ['R', 'Reset level'], ['N', 'Next level']],

  mount(stage) {
    const wrap = el('div', { class: 'ms-wrap' });
    const levelEl = el('span', { html: 'Level <b>1/6</b>' });
    const movesEl = el('span', { html: 'Moves <b>0</b>' });
    const pushEl = el('span', { html: 'Pushes <b>0</b>' });
    const nameEl = el('span', { text: '' });
    const bar = el('div', { class: 'hud' }, [
      el('div', { class: 'hud-group' }, [levelEl, movesEl, pushEl]),
      el('div', { class: 'hud-group' }, [nameEl]),
    ]);
    const grid = el('div', { class: 'sok-grid', tabindex: '0', role: 'application', 'aria-label': 'Warehouse puzzle' });
    const msg = el('p', { class: 'lede', style: 'font-size:13px;text-align:center;margin:0', text: 'Push every box onto a goal. Boxes can only be pushed, never pulled — so plan the order.' });
    const nav = el('div', { class: 'filters', style: 'justify-content:center;margin:8px 0 0' });
    wrap.append(bar, grid, nav, msg);
    stage.append(wrap);

    const prevBtn = el('button', { class: 'filter', type: 'button', text: '← Prev', onclick: () => load(level - 1) });
    const resetBtn = el('button', { class: 'filter', type: 'button', text: 'Reset', onclick: () => load(level) });
    const undoBtn = el('button', { class: 'filter', type: 'button', text: 'Undo', onclick: () => undo() });
    const nextBtn = el('button', { class: 'filter', type: 'button', text: 'Next →', onclick: () => load(level + 1) });
    nav.append(prevBtn, resetBtn, undoBtn, nextBtn);

    let level = 0;
    let rows = [];
    let cols = 0;
    let player = { r: 0, c: 0 };
    let boxes = [];
    let goals = [];
    let moves = 0;
    let pushes = 0;
    let history = [];
    let solved = false;

    function load(index) {
      level = Math.max(0, Math.min(LEVELS.length - 1, index));
      const map = LEVELS[level].map;
      rows = map.length;
      cols = Math.max(...map.map((r) => r.length));
      boxes = [];
      goals = [];
      player = { r: 0, c: 0 };
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const ch = map[r][c] || ' ';
          if (ch === '@' || ch === '+') player = { r, c };
          if (ch === '$' || ch === '*') boxes.push({ r, c });
          if (ch === '.' || ch === '*' || ch === '+') goals.push({ r, c });
        }
      }
      moves = 0;
      pushes = 0;
      history = [];
      solved = false;
      grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      grid.style.maxWidth = `${Math.min(520, cols * 52)}px`;
      nameEl.textContent = LEVELS[level].name;
      msg.innerHTML = 'Push every box onto a goal. Boxes can only be pushed, never pulled — so plan the order.';
      render();
    }

    const wallAt = (r, c) => {
      const row = LEVELS[level].map[r];
      return !row || row[c] === WALL || row[c] === undefined;
    };

    const goalAt = (r, c) => goals.some((g) => g.r === r && g.c === c);
    const boxAt = (r, c) => boxes.find((b) => b.r === r && b.c === c);

    function render() {
      levelEl.innerHTML = `Level <b>${level + 1}/${LEVELS.length}</b>`;
      movesEl.innerHTML = `Moves <b>${moves}</b>`;
      pushEl.innerHTML = `Pushes <b>${pushes}</b>`;
      grid.innerHTML = '';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wall = wallAt(r, c);
          const classes = ['sok-cell'];
          let text = '';
          if (wall) classes.push('wall');
          else {
            classes.push('floor');
            if (goalAt(r, c)) classes.push('goal');
            const box = boxAt(r, c);
            if (box) {
              classes.push('box');
              if (goalAt(r, c)) classes.push('on');
            }
            if (player.r === r && player.c === c) {
              classes.push('player');
              if (goalAt(r, c)) classes.push('on');
            }
          }
          grid.append(el('div', { class: classes.join(' '), text }));
        }
      }
      prevBtn.disabled = level === 0;
      nextBtn.disabled = level === LEVELS.length - 1;
    }

    function snapshot() {
      return {
        player: { ...player },
        boxes: boxes.map((b) => ({ ...b })),
        moves,
        pushes,
      };
    }

    function undo() {
      const prev = history.pop();
      if (!prev) return;
      player = prev.player;
      boxes = prev.boxes;
      moves = prev.moves;
      pushes = prev.pushes;
      solved = false;
      sound.click();
      render();
    }

    function attempt(dr, dc) {
      if (solved) return;
      const nr = player.r + dr;
      const nc = player.c + dc;
      if (wallAt(nr, nc)) return;
      const box = boxAt(nr, nc);
      if (box) {
        const br = nr + dr;
        const bc = nc + dc;
        if (wallAt(br, bc) || boxAt(br, bc)) return;
        history.push(snapshot());
        box.r = br;
        box.c = bc;
        player = { r: nr, c: nc };
        pushes += 1;
        moves += 1;
        sound.tone(goalAt(br, bc) ? 660 : 300, 0.05, 'square', 0.035);
      } else {
        history.push(snapshot());
        player = { r: nr, c: nc };
        moves += 1;
        sound.tone(200, 0.03, 'triangle', 0.02);
      }
      if (history.length > 300) history.shift();
      render();
      check();
    }

    function check() {
      if (boxes.every((b) => goalAt(b.r, b.c))) {
        solved = true;
        sound.win();
        const last = level === LEVELS.length - 1;
        msg.innerHTML = last
          ? `<strong style="color:#7cf6c8">All six warehouses cleared in ${moves} moves.</strong> That is the whole set.`
          : `<strong style="color:#7cf6c8">Solved in ${moves} moves and ${pushes} pushes.</strong> Use Next → for the next room.`;
      }
    }

    const DIRS = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
      w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
      W: [-1, 0], S: [1, 0], A: [0, -1], D: [0, 1],
    };

    const onKey = (e) => {
      if (DIRS[e.key]) {
        e.preventDefault();
        const [dr, dc] = DIRS[e.key];
        attempt(dr, dc);
      } else if (e.key === 'u' || e.key === 'U' || e.key === 'z' || e.key === 'Z') {
        undo();
      } else if (e.key === 'r' || e.key === 'R') {
        load(level);
      } else if (e.key === 'n' || e.key === 'N') {
        load(level + 1);
      }
    };
    window.addEventListener('keydown', onKey);

    let sx = 0, sy = 0;
    const onStart = (e) => {
      const t = e.changedTouches[0];
      sx = t.clientX; sy = t.clientY;
    };
    const onEnd = (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) attempt(0, dx > 0 ? 1 : -1);
      else attempt(dy > 0 ? 1 : -1, 0);
    };
    grid.addEventListener('touchstart', onStart, { passive: true });
    grid.addEventListener('touchend', onEnd, { passive: true });

    load(0);

    return {
      restart() { load(level); },
      destroy() {
        window.removeEventListener('keydown', onKey);
        grid.removeEventListener('touchstart', onStart);
        grid.removeEventListener('touchend', onEnd);
        wrap.remove();
      },
    };
  },
};

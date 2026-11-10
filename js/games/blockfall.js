import { makeStage, startLoop, keys, palette } from '../lib/ui.js';
import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { el } from '../lib/util.js';

const COLS = 10;
const ROWS = 20;
const CELL = 26;
const OX = 10;
const OY = 10;
const W = OX * 2 + COLS * CELL + 108;
const H = OY * 2 + ROWS * CELL;

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
};
const COLOURS = {
  I: '#6ee7e7', J: '#7aa2ff', L: '#ffb545', O: '#f5e17a',
  S: '#7cf6c8', T: '#c79bff', Z: '#ff7a94',
};

const rotate = (m, dir) => {
  const n = m.length;
  const out = Array.from({ length: n }, () => Array(n).fill(0));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (dir > 0) out[c][n - 1 - r] = m[r][c];
      else out[n - 1 - c][r] = m[r][c];
    }
  }
  return out;
};

export default {
  id: 'blockfall',
  title: 'Blockfall',
  tagline: 'Block stacker with a 7-bag randomiser, wall kicks, hold slot, ghost piece and proper lock delay.',
  genre: 'Puzzle',
  tags: ['keyboard', 'hold', 'levels'],
  controls: [['← →', 'Move'], ['↑ / Z', 'Rotate'], ['↓', 'Soft drop'], ['Space', 'Hard drop'], ['C', 'Hold'], ['P', 'Pause']],

  mount(stage) {
    const s = makeStage(stage, W, H, { label: 'Blockfall board', maxVh: 70 });
    const { ctx } = s;

    const scoreEl = el('span', { html: 'Score <b>0</b>' });
    const linesEl = el('span', { html: 'Lines <b>0</b>' });
    const levelEl = el('span', { html: 'Level <b>1</b>' });
    const bar = el('div', { class: 'hud' }, [
      el('div', { class: 'hud-group' }, [scoreEl, linesEl, levelEl]),
      el('div', { class: 'hud-group' }, [el('span', { text: 'C hold · Space drop' })]),
    ]);
    stage.insertBefore(bar, s.wrap);

    const st = {
      board: [],
      piece: null,
      queue: [],
      bag: [],
      hold: null,
      canHold: true,
      score: 0,
      lines: 0,
      level: 1,
      dropAcc: 0,
      lockTimer: 0,
      over: false,
      paused: false,
      started: false,
      clearFlash: 0,
      clearRows: [],
    };

    const emptyRow = () => Array(COLS).fill(null);

    function refillBag() {
      const keysL = Object.keys(SHAPES);
      for (let i = keysL.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [keysL[i], keysL[j]] = [keysL[j], keysL[i]];
      }
      st.bag.push(...keysL);
    }

    function nextType() {
      if (!st.bag.length) refillBag();
      return st.bag.shift();
    }

    function spawn(type = null) {
      while (st.queue.length < 3) st.queue.push(nextType());
      const kind = type || st.queue.shift();
      const matrix = SHAPES[kind].map((r) => r.slice());
      st.piece = {
        kind,
        matrix,
        x: Math.floor((COLS - matrix.length) / 2),
        y: kind === 'I' ? -1 : 0,
        colour: COLOURS[kind],
      };
      st.canHold = true;
      st.lockTimer = 0;
      if (collides(st.piece, st.piece.x, st.piece.y, st.piece.matrix)) {
        st.over = true;
        submitScore('blockfall', st.score);
        sound.bad();
      }
    }

    function collides(piece, px, py, matrix) {
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!matrix[r][c]) continue;
          const x = px + c;
          const y = py + r;
          if (x < 0 || x >= COLS || y >= ROWS) return true;
          if (y >= 0 && st.board[y][x]) return true;
        }
      }
      return false;
    }

    function reset() {
      st.board = Array.from({ length: ROWS }, emptyRow);
      st.queue = [];
      st.bag = [];
      st.hold = null;
      st.canHold = true;
      st.score = 0;
      st.lines = 0;
      st.level = 1;
      st.dropAcc = 0;
      st.over = false;
      st.paused = false;
      st.started = false;
      st.clearFlash = 0;
      st.clearRows = [];
      spawn();
      paint();
    }

    function paint() {
      scoreEl.innerHTML = `Score <b>${st.score.toLocaleString('en-US')}</b>`;
      linesEl.innerHTML = `Lines <b>${st.lines}</b>`;
      levelEl.innerHTML = `Level <b>${st.level}</b>`;
    }

    const dropInterval = () => Math.max(0.06, 0.85 - (st.level - 1) * 0.075);

    function lock() {
      const p = st.piece;
      p.matrix.forEach((row, r) => row.forEach((v, c) => {
        if (v && p.y + r >= 0) st.board[p.y + r][p.x + c] = p.colour;
      }));

      const full = [];
      st.board.forEach((row, i) => {
        if (row.every((cell) => cell)) full.push(i);
      });

      if (full.length) {
        st.clearRows = full;
        st.clearFlash = 1;
        full.forEach((rowIdx) => {
          st.board.splice(rowIdx, 1);
          st.board.unshift(emptyRow());
        });
        const points = [0, 100, 300, 500, 800][full.length] * st.level;
        st.score += points;
        st.lines += full.length;
        st.level = 1 + Math.floor(st.lines / 10);
        sound.tone(full.length === 4 ? 880 : 620, 0.12, 'triangle', 0.05);
        if (full.length === 4) setTimeout(() => sound.win(), 60);
      } else {
        sound.tone(220, 0.03, 'square', 0.025);
      }

      spawn();
      paint();
    }

    function move(dx) {
      if (!st.piece || st.over || st.paused) return;
      if (!collides(st.piece, st.piece.x + dx, st.piece.y, st.piece.matrix)) {
        st.piece.x += dx;
        st.lockTimer = 0;
      }
    }

    function softDrop() {
      if (!st.piece || st.over || st.paused) return false;
      if (!collides(st.piece, st.piece.x, st.piece.y + 1, st.piece.matrix)) {
        st.piece.y += 1;
        st.score += 1;
        st.lockTimer = 0;
        paint();
        return true;
      }
      return false;
    }

    function hardDrop() {
      if (!st.piece || st.over || st.paused) return;
      let guard = 0;
      while (!collides(st.piece, st.piece.x, st.piece.y + 1, st.piece.matrix) && guard++ < 24) {
        st.piece.y += 1;
        st.score += 2;
      }
      sound.tone(160, 0.05, 'square', 0.04);
      lock();
    }

    function rotatePiece(dir) {
      if (!st.piece || st.over || st.paused) return;
      const rotated = rotate(st.piece.matrix, dir);
      const kicks = [0, -1, 1, -2, 2];
      for (const dx of kicks) {
        if (!collides(st.piece, st.piece.x + dx, st.piece.y, rotated)) {
          st.piece.matrix = rotated;
          st.piece.x += dx;
          st.lockTimer = 0;
          sound.tone(560, 0.03, 'square', 0.022);
          return;
        }
      }
    }

    function holdPiece() {
      if (!st.piece || st.over || !st.canHold) return;
      const swapped = st.hold ? st.hold : null;
      st.hold = st.piece.kind;
      if (swapped) {
        const matrix = SHAPES[swapped].map((r) => r.slice());
        st.piece = {
          kind: swapped, matrix,
          x: Math.floor((COLS - matrix.length) / 2), y: 0, colour: COLOURS[swapped],
        };
      } else {
        spawn();
      }
      st.canHold = false;
      sound.tone(700, 0.05, 'triangle', 0.03);
    }

    /* --------------- draw --------------- */

    function block(x, y, size, colour, alpha = 1) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, size - 2, size - 2, Math.max(2, size * 0.16));
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.beginPath();
      ctx.roundRect(x + 3, y + 3, size - 6, Math.max(2, size * 0.2), 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function drawMini(matrix, colour, x, y, size) {
      const offX = x + (4 - matrix.length) * size / 2;
      matrix.forEach((row, r) => row.forEach((v, c) => {
        if (v) block(offX + c * size, y + r * size, size, colour);
      }));
    }

    function draw() {
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);

      // well
      ctx.fillStyle = '#0a0e18';
      ctx.beginPath();
      ctx.roundRect(OX - 2, OY - 2, COLS * CELL + 4, ROWS * CELL + 4, 8);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,.045)';
      for (let c = 1; c < COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(OX + c * CELL, OY);
        ctx.lineTo(OX + c * CELL, OY + ROWS * CELL);
        ctx.stroke();
      }
      for (let r = 1; r < ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(OX, OY + r * CELL);
        ctx.lineTo(OX + COLS * CELL, OY + r * CELL);
        ctx.stroke();
      }

      st.board.forEach((row, r) => row.forEach((cell, c) => {
        if (!cell) return;
        const flash = st.clearRows.includes(r) ? st.clearFlash : 0;
        block(OX + c * CELL, OY + r * CELL, CELL, flash > 0 ? '#ffffff' : cell, 1);
      }));

      // ghost
      if (st.piece && !st.over) {
        let gy = st.piece.y;
        while (!collides(st.piece, st.piece.x, gy + 1, st.piece.matrix)) gy += 1;
        st.piece.matrix.forEach((row, r) => row.forEach((v, c) => {
          if (!v) return;
          const x = OX + (st.piece.x + c) * CELL;
          const y = OY + (gy + r) * CELL;
          if (gy + r < 0) return;
          ctx.strokeStyle = 'rgba(255,255,255,.22)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
        }));
        st.piece.matrix.forEach((row, r) => row.forEach((v, c) => {
          if (!v) return;
          const y = OY + (st.piece.y + r) * CELL;
          if (st.piece.y + r < 0) return;
          block(OX + (st.piece.x + c) * CELL, y, CELL, st.piece.colour);
        }));
      }

      // side panel
      const px = OX + COLS * CELL + 14;
      ctx.fillStyle = 'rgba(255,255,255,.03)';
      ctx.beginPath();
      ctx.roundRect(px - 4, OY, 96, 300, 8);
      ctx.fill();

      ctx.fillStyle = palette.dim;
      ctx.font = '600 10px ui-monospace, monospace';
      ctx.fillText('NEXT', px + 4, OY + 20);
      st.queue.slice(0, 3).forEach((kind, i) => {
        drawMini(SHAPES[kind], COLOURS[kind], px + 6, OY + 30 + i * 54, 12);
      });

      ctx.fillStyle = palette.dim;
      ctx.font = '600 10px ui-monospace, monospace';
      ctx.fillText('HOLD', px + 4, OY + 214);
      if (st.hold) drawMini(SHAPES[st.hold], COLOURS[st.hold], px + 6, OY + 224, 12);
      else {
        ctx.strokeStyle = 'rgba(255,255,255,.12)';
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(px + 6, OY + 224, 48, 36);
        ctx.setLineDash([]);
      }

      if (!st.started) {
        ctx.fillStyle = 'rgba(6,9,15,.72)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = palette.ink;
        ctx.font = '700 22px ui-monospace, monospace';
        ctx.fillText('BLOCKFALL', W / 2, H / 2 - 40);
        ctx.fillStyle = palette.dim;
        ctx.font = '500 12px ui-monospace, monospace';
        ctx.fillText('Press any key to start', W / 2, H / 2 - 12);
        ctx.fillStyle = 'rgba(124,246,200,.7)';
        ctx.fillText('Space = hard drop · C = hold', W / 2, H / 2 + 12);
        ctx.textAlign = 'left';
      }
      if (st.paused && !st.over) {
        ctx.fillStyle = 'rgba(6,9,15,.8)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = palette.ink;
        ctx.font = '700 20px ui-monospace, monospace';
        ctx.fillText('PAUSED', W / 2, H / 2);
        ctx.textAlign = 'left';
      }
      if (st.over) {
        ctx.fillStyle = 'rgba(6,9,15,.82)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = palette.bad;
        ctx.font = '700 20px ui-monospace, monospace';
        ctx.fillText('TOP OUT', W / 2, H / 2 - 46);
        ctx.fillStyle = palette.ink;
        ctx.font = '800 34px ui-monospace, monospace';
        ctx.fillText(String(st.score), W / 2, H / 2 - 4);
        ctx.fillStyle = palette.dim;
        ctx.font = '500 12px ui-monospace, monospace';
        ctx.fillText(`${st.lines} lines · best ${getBest('blockfall')}`, W / 2, H / 2 + 22);
        ctx.fillStyle = 'rgba(124,246,200,.85)';
        ctx.fillText('Press R to restart', W / 2, H / 2 + 48);
        ctx.textAlign = 'left';
      }
    }

    /* --------------- input + loop --------------- */

    const kb = keys();
    const offPress = kb.press((key) => {
      if (st.over) {
        if (key === 'r' || key === 'R') reset();
        return;
      }
      if (!st.started) st.started = true;
      if (key === 'p' || key === 'P') {
        st.paused = !st.paused;
        return;
      }
      if (key === 'r' || key === 'R') {
        reset();
        st.started = true;
        return;
      }
      if (st.paused) return;
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') move(-1);
      else if (key === 'ArrowRight' || key === 'd' || key === 'D') move(1);
      else if (key === 'ArrowUp' || key === 'x' || key === 'X') rotatePiece(1);
      else if (key === 'z' || key === 'Z') rotatePiece(-1);
      else if (key === ' ') hardDrop();
      else if (key === 'c' || key === 'C') holdPiece();
    });

    let repeatL = 0;
    let repeatR = 0;
    let softTimer = 0;

    const stop = startLoop((dt) => {
      st.clearFlash = Math.max(0, st.clearFlash - dt * 3);

      if (st.started && !st.paused && !st.over) {
        if (kb.isDown('ArrowLeft', 'a', 'A')) {
          repeatL += dt;
          if (repeatL > 0.14) { move(-1); repeatL = 0.07; }
        } else repeatL = 0.09;

        if (kb.isDown('ArrowRight', 'd', 'D')) {
          repeatR += dt;
          if (repeatR > 0.14) { move(1); repeatR = 0.07; }
        } else repeatR = 0.09;

        if (kb.isDown('ArrowDown', 's', 'S')) {
          softTimer += dt;
          if (softTimer > 0.045) { softDrop(); softTimer = 0; }
        } else softTimer = 0;

        st.dropAcc += dt;
        if (st.dropAcc >= dropInterval()) {
          st.dropAcc = 0;
          if (st.piece && !collides(st.piece, st.piece.x, st.piece.y + 1, st.piece.matrix)) {
            st.piece.y += 1;
          }
        }

        if (st.piece && collides(st.piece, st.piece.x, st.piece.y + 1, st.piece.matrix)) {
          st.lockTimer += dt;
          if (st.lockTimer > 0.42) lock();
        } else {
          st.lockTimer = 0;
        }
      }
      draw();
    });

    reset();

    return {
      restart() { reset(); st.started = true; },
      destroy() {
        stop();
        offPress();
        s.destroy();
        bar.remove();
      },
    };
  },
};

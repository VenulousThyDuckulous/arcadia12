import { makeStage, startLoop, keys, swipes, palette } from '../lib/ui.js';
import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { randInt, el } from '../lib/util.js';

const COLS = 26;
const ROWS = 20;
const CELL = 22;

const DIRS = {
  ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 }, S: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, A: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }, D: { x: 1, y: 0 },
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default {
  id: 'serpent',
  title: 'Neon Serpent',
  tagline: 'Snake with wrap-around tunnels, a rising speed curve and golden fruit that is worth five but expires.',
  genre: 'Arcade',
  tags: ['keyboard', 'swipe', 'endless'],
  controls: [['Arrows / WASD', 'Turn'], ['Space', 'Pause'], ['R', 'Restart']],

  mount(stage) {
    const s = makeStage(stage, COLS * CELL, ROWS * CELL, { label: 'Neon Serpent board' });
    const { ctx, W, H } = s;

    const scoreEl = el('span', { html: 'Score <b>0</b>' });
    const bestEl = el('span', { html: `Best <b>${getBest('serpent')}</b>` });
    const speedEl = el('span', { html: 'Speed <b>1</b>' });
    const bar = el('div', { class: 'hud' }, [
      el('div', { class: 'hud-group' }, [scoreEl, bestEl, speedEl]),
      el('div', { class: 'hud-group' }, [el('span', { text: 'Wrap-around walls' })]),
    ]);
    stage.insertBefore(bar, s.wrap);

    const st = {
      snake: [], dir: { x: 1, y: 0 }, queue: [], food: null, golden: null,
      score: 0, alive: true, started: false, paused: false,
      acc: 0, step: 0.14, level: 1, particles: [], t: 0, goldenTimer: 0, eaten: 0,
    };

    function emptyCells() {
      const taken = new Set(st.snake.map((p) => `${p.x},${p.y}`));
      if (st.food) taken.add(`${st.food.x},${st.food.y}`);
      if (st.golden) taken.add(`${st.golden.x},${st.golden.y}`);
      const out = [];
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) if (!taken.has(`${x},${y}`)) out.push({ x, y });
      }
      return out;
    }

    function spawnFood() {
      const free = emptyCells();
      if (!free.length) return null;
      return free[randInt(0, free.length - 1)];
    }

    function reset() {
      st.snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }];
      st.dir = { x: 1, y: 0 };
      st.queue = [];
      st.score = 0;
      st.alive = true;
      st.started = false;
      st.paused = false;
      st.acc = 0;
      st.step = 0.14;
      st.level = 1;
      st.particles = [];
      st.goldenTimer = 0;
      st.eaten = 0;
      st.food = spawnFood();
      st.golden = null;
      paintHud();
    }

    function paintHud(record = false) {
      scoreEl.innerHTML = `Score <b>${st.score.toLocaleString('en-US')}</b>`;
      bestEl.innerHTML = `Best <b>${(record ? st.score : Math.max(getBest('serpent'), st.score)).toLocaleString('en-US')}</b>`;
      speedEl.innerHTML = `Speed <b>${st.level}</b>`;
    }

    function burst(cx, cy, color, count = 14) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 160;
        st.particles.push({
          x: cx * CELL + CELL / 2,
          y: cy * CELL + CELL / 2,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          color,
        });
      }
    }

    function die() {
      st.alive = false;
      st.started = false;
      const record = submitScore('serpent', st.score);
      burst(st.snake[0].x, st.snake[0].y, palette.bad, 26);
      paintHud(record);
      sound.bad();
    }

    function advance() {
      if (st.queue.length) {
        const nd = st.queue.shift();
        const isReverse = nd.x === -st.dir.x && nd.y === -st.dir.y;
        if (!isReverse && (nd.x !== st.dir.x || nd.y !== st.dir.y)) st.dir = nd;
      }
      const head = st.snake[0];
      const next = {
        x: (head.x + st.dir.x + COLS) % COLS,
        y: (head.y + st.dir.y + ROWS) % ROWS,
      };
      // The tail cell frees up this tick, so it is not a collision.
      for (let i = 0; i < st.snake.length - 1; i++) {
        if (st.snake[i].x === next.x && st.snake[i].y === next.y) {
          st.snake.unshift(next);
          st.snake.pop();
          die();
          return;
        }
      }
      st.snake.unshift(next);
      let grew = false;

      if (st.food && next.x === st.food.x && next.y === st.food.y) {
        st.score += 1;
        st.eaten += 1;
        grew = true;
        st.food = spawnFood();
        burst(next.x, next.y, palette.accent, 10);
        sound.tone(620 + Math.min(st.eaten, 12) * 24, 0.06, 'square', 0.045);
        st.level = 1 + Math.floor(st.eaten / 5);
        st.step = Math.max(0.062, 0.14 - (st.level - 1) * 0.0075);
      }
      if (st.golden && next.x === st.golden.x && next.y === st.golden.y) {
        st.score += 5;
        st.golden = null;
        burst(next.x, next.y, palette.warn, 18);
        sound.tone(980, 0.1, 'triangle', 0.05);
        grew = true;
      }
      if (!grew) st.snake.pop();
      paintHud();
    }

    /* -------------------- drawing -------------------- */

    function drawGrid() {
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(124,246,200,.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * CELL + 0.5, 0);
        ctx.lineTo(x * CELL + 0.5, H);
        ctx.stroke();
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * CELL + 0.5);
        ctx.lineTo(W, y * CELL + 0.5);
        ctx.stroke();
      }
    }

    function drawFood() {
      if (st.food) {
        const cx = st.food.x * CELL + CELL / 2;
        const cy = st.food.y * CELL + CELL / 2;
        const pulse = 1 + Math.sin(st.t * 5) * 0.08;
        ctx.save();
        ctx.shadowColor = palette.bad;
        ctx.shadowBlur = 16;
        ctx.fillStyle = palette.bad;
        ctx.beginPath();
        ctx.arc(cx, cy, CELL * 0.32 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (st.golden) {
        const cx = st.golden.x * CELL + CELL / 2;
        const cy = st.golden.y * CELL + CELL / 2;
        const r = CELL * 0.36;
        ctx.save();
        ctx.shadowColor = palette.warn;
        ctx.shadowBlur = 18;
        ctx.fillStyle = palette.warn;
        ctx.translate(cx, cy);
        ctx.rotate(st.t * 1.6);
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    function drawSnake() {
      for (let i = st.snake.length - 1; i >= 0; i--) {
        const seg = st.snake[i];
        const t = i / Math.max(1, st.snake.length - 1);
        const pad = 1.5 + t * 1.2;
        ctx.fillStyle = i === 0
          ? '#b9ffe8'
          : `rgba(${Math.round(90 + t * 40)}, ${Math.round(246 - t * 90)}, ${Math.round(200 - t * 70)}, ${1 - t * 0.35})`;
        if (i === 0) {
          ctx.save();
          ctx.shadowColor = palette.accent;
          ctx.shadowBlur = 14;
        }
        roundRect(ctx, seg.x * CELL + pad, seg.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 6 - t * 3);
        ctx.fill();
        if (i === 0) ctx.restore();
      }
      // eyes on the head
      const head = st.snake[0];
      if (!head) return;
      const cx = head.x * CELL + CELL / 2;
      const cy = head.y * CELL + CELL / 2;
      ctx.fillStyle = '#08120f';
      const ox = st.dir.y !== 0 ? 4 : 0;
      const oy = st.dir.x !== 0 ? 4 : 0;
      ctx.beginPath();
      ctx.arc(cx - ox + st.dir.x * 2, cy - oy + st.dir.y * 2, 1.8, 0, Math.PI * 2);
      ctx.arc(cx + ox + st.dir.x * 2, cy + oy + st.dir.y * 2, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawParticles() {
      for (const p of st.particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;
    }

    function drawOverlay() {
      if (st.alive && !st.started) {
        ctx.fillStyle = 'rgba(6,9,15,.72)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = palette.ink;
        ctx.font = '700 24px ui-monospace, monospace';
        ctx.fillText('NEON SERPENT', W / 2, H / 2 - 26);
        ctx.fillStyle = palette.dim;
        ctx.font = '500 14px ui-monospace, monospace';
        ctx.fillText('Press an arrow key, W A S D, or swipe to start', W / 2, H / 2 + 6);
        ctx.fillStyle = 'rgba(124,246,200,.75)';
        ctx.font = '500 12px ui-monospace, monospace';
        ctx.fillText('Golden fruit = 5 points, but it vanishes', W / 2, H / 2 + 32);
        ctx.textAlign = 'left';
      }
      if (st.paused && st.alive) {
        ctx.fillStyle = 'rgba(6,9,15,.72)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = palette.ink;
        ctx.font = '700 22px ui-monospace, monospace';
        ctx.fillText('PAUSED', W / 2, H / 2 - 4);
        ctx.fillStyle = palette.dim;
        ctx.font = '500 13px ui-monospace, monospace';
        ctx.fillText('Space to resume', W / 2, H / 2 + 22);
        ctx.textAlign = 'left';
      }
      if (!st.alive) {
        ctx.fillStyle = 'rgba(6,9,15,.8)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = palette.bad;
        ctx.font = '700 24px ui-monospace, monospace';
        ctx.fillText('GAME OVER', W / 2, H / 2 - 52);
        ctx.fillStyle = palette.ink;
        ctx.font = '800 40px ui-monospace, monospace';
        ctx.fillText(String(st.score), W / 2, H / 2 + 2);
        ctx.fillStyle = palette.dim;
        ctx.font = '500 13px ui-monospace, monospace';
        ctx.fillText(`Best ${getBest('serpent')}  ·  length ${st.snake.length}`, W / 2, H / 2 + 32);
        ctx.fillStyle = 'rgba(124,246,200,.85)';
        ctx.font = '600 13px ui-monospace, monospace';
        ctx.fillText('Press Space or R to play again', W / 2, H / 2 + 62);
        ctx.textAlign = 'left';
      }
    }

    /* -------------------- input -------------------- */

    function start() {
      if (!st.alive) {
        reset();
      }
      st.started = true;
      st.paused = false;
      sound.click();
    }

    function turn(dir) {
      if (!st.alive) return;
      if (!st.started) start();
      if (st.paused) return;
      if (st.queue.length < 3) st.queue.push(dir);
    }

    const kb = keys();
    const offPress = kb.press((key) => {
      if (DIRS[key]) {
        turn(DIRS[key]);
        return;
      }
      if (key === ' ') {
        if (!st.alive) start();
        else if (!st.started) start();
        else st.paused = !st.paused;
      }
      if (key === 'r' || key === 'R') {
        reset();
        start();
      }
    });

    const offSwipe = swipes(s.canvas, (dir) => {
      const map = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
      turn(map[dir]);
    });

    const onClick = () => {
      if (!st.alive || !st.started) start();
    };
    const onPointerMove = (e) => {
      if (!st.started) {
        const rect = s.canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * W;
        const y = ((e.clientY - rect.top) / rect.height) * H;
        if (x > 0 && y > 0) start();
      }
    };
    s.canvas.addEventListener('pointerdown', onClick);
    s.canvas.addEventListener('pointermove', onPointerMove);

    /* -------------------- loop -------------------- */

    function update(dt) {
      st.t += dt;
      for (const p of st.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= dt * 2.2;
      }
      st.particles = st.particles.filter((p) => p.life > 0);

      if (st.started && st.alive && !st.paused) {
        st.acc += dt;
        while (st.acc >= st.step) {
          st.acc -= st.step;
          advance();
          if (!st.alive) break;
        }
        st.goldenTimer += dt;
        const hasScore = st.eaten > 0;
        if (!st.golden && hasScore && st.goldenTimer > 12) {
          st.goldenTimer = 0;
          const free = emptyCells();
          if (free.length) {
            st.golden = free[randInt(0, free.length - 1)];
            setTimeout(() => {
              if (st.golden) {
                st.golden = null;
                st.goldenTimer = 0;
              }
            }, 6500);
          }
        }
      }
    }

    const stop = startLoop((dt) => {
      update(dt);
      drawGrid();
      drawFood();
      drawSnake();
      drawParticles();
      drawOverlay();
    });

    reset();

    return {
      restart() {
        reset();
        st.started = true;
      },
      destroy() {
        stop();
        offPress();
        offSwipe();
        s.canvas.removeEventListener('pointerdown', onClick);
        s.canvas.removeEventListener('pointermove', onPointerMove);
        s.destroy();
        bar.remove();
      },
    };
  },
};

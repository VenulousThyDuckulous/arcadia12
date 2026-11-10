import { makeStage, startLoop, keys, palette } from '../lib/ui.js';
import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { clamp, rand, el } from '../lib/util.js';

const W = 600;
const H = 440;
const PAD = 28;
const COLS = 10;
const ROWS = 5;
const GAP = 6;
const BW = (W - PAD * 2 - GAP * (COLS - 1)) / COLS;
const BH = 20;
const TOP = 64;

const ROW_COLOURS = ['#ff5c7a', '#ffb545', '#c79bff', '#7aa2ff', '#7cf6c8'];

export default {
  id: 'brickwork',
  title: 'Brickwork',
  tagline: 'Breakout with paddle spin, multi-hit bricks and falling power-ups that change how the ball behaves.',
  genre: 'Arcade',
  tags: ['mouse', 'keyboard', 'power-ups'],
  controls: [['Mouse / Touch', 'Move paddle'], ['← →', 'Move paddle'], ['Space / Click', 'Serve'], ['P', 'Pause']],

  mount(stage) {
    const s = makeStage(stage, W, H, { label: 'Brickwork playfield' });
    const { ctx } = s;

    const scoreEl = el('span', { html: 'Score <b>0</b>' });
    const livesEl = el('span', { html: 'Lives <b>3</b>' });
    const levelEl = el('span', { html: 'Level <b>1</b>' });
    const statusEl = el('span', { text: '' });
    const bar = el('div', { class: 'hud' }, [
      el('div', { class: 'hud-group' }, [scoreEl, livesEl, levelEl]),
      el('div', { class: 'hud-group' }, [statusEl]),
    ]);
    stage.insertBefore(bar, s.wrap);

    const st = {
      paddle: { x: W / 2 - 48, w: 96, h: 12, y: H - 30 },
      balls: [],
      bricks: [],
      drops: [],
      particles: [],
      score: 0,
      lives: 3,
      level: 1,
      speed: 300,
      playing: false,
      paused: false,
      over: false,
      t: 0,
      flash: 0,
    };

    function makeBricks() {
      st.bricks = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          st.bricks.push({
            x: PAD + c * (BW + GAP),
            y: TOP + r * (BH + GAP * 1.4),
            w: BW,
            h: BH,
            hp: 1 + (r < Math.min(st.level - 1, 2) ? 1 : 0),
            tone: ROW_COLOURS[r % ROW_COLOURS.length],
            alive: true,
            wobble: 0,
          });
        }
      }
    }

    function serveBall() {
      st.balls = [{ x: st.paddle.x + st.paddle.w / 2, y: st.paddle.y - 10, vx: 0, vy: 0, r: 6, stuck: true }];
    }

    function reset() {
      st.score = 0;
      st.lives = 3;
      st.level = 1;
      st.speed = 300;
      st.playing = false;
      st.paused = false;
      st.over = false;
      st.drops = [];
      st.particles = [];
      st.paddle.w = 96;
      st.paddle.x = W / 2 - st.paddle.w / 2;
      makeBricks();
      serveBall();
      paint();
    }

    function paint() {
      scoreEl.innerHTML = `Score <b>${st.score.toLocaleString('en-US')}</b>`;
      livesEl.innerHTML = `Lives <b>${st.lives}</b>`;
      levelEl.innerHTML = `Level <b>${st.level}</b>`;
      statusEl.textContent = st.over ? 'Game over' : st.paused ? 'Paused' : `${st.bricks.filter((b) => b.alive).length} bricks left`;
    }

    function launch() {
      if (st.over) {
        reset();
      }
      if (st.playing) {
        st.paused = !st.paused;
        paint();
        return;
      }
      st.playing = true;
      st.paused = false;
      const b = st.balls[0];
      if (b && b.stuck) {
        const angle = rand(-0.6, 0.6) - Math.PI / 2;
        b.vx = Math.cos(angle) * st.speed;
        b.vy = Math.sin(angle) * st.speed;
        b.stuck = false;
      }
      sound.tone(520, 0.06, 'square', 0.04);
      paint();
    }

    function burst(x, y, color, n = 10) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const sp = rand(40, 220);
        st.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color });
      }
    }

    function loseLife() {
      st.lives -= 1;
      st.drops = [];
      st.paddle.w = 96;
      sound.bad();
      if (st.lives <= 0) {
        st.over = true;
        st.playing = false;
        submitScore('brickwork', st.score);
      } else {
        st.playing = false;
        serveBall();
      }
      paint();
    }

    function nextLevel() {
      st.level += 1;
      st.speed = Math.min(520, st.speed + 26);
      makeBricks();
      st.drops = [];
      st.playing = false;
      serveBall();
      sound.win();
      paint();
    }

    function dropPowerUp(x, y) {
      const kinds = ['multi', 'wide', 'slow'];
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      st.drops.push({ x, y, kind, vy: 130, t: 0 });
    }

    function hitBrick(b) {
      b.hp -= 1;
      b.wobble = 1;
      if (b.hp <= 0) {
        b.alive = false;
        st.score += 10 * st.level;
        burst(b.x + b.w / 2, b.y + b.h / 2, b.tone, 14);
        sound.tone(560 + Math.random() * 160, 0.05, 'square', 0.04);
        if (Math.random() < 0.16) dropPowerUp(b.x + b.w / 2, b.y + b.h / 2);
      } else {
        sound.tone(320, 0.04, 'square', 0.03);
      }
      paint();
    }

    /* ------------------------- update ------------------------- */

    function step(dt) {
      st.t += dt;
      st.flash = Math.max(0, st.flash - dt * 3);

      for (const b of st.bricks) b.wobble = Math.max(0, b.wobble - dt * 4);

      if (st.playing && !st.paused && !st.over) {
        const p = st.paddle;
        for (const ball of st.balls) {
          if (ball.stuck) {
            ball.x = p.x + p.w / 2;
            ball.y = p.y - ball.r - 4;
            continue;
          }
          ball.x += ball.vx * dt;
          ball.y += ball.vy * dt;

          if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); sound.tone(300, 0.03, 'square', 0.025); }
          if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); sound.tone(300, 0.03, 'square', 0.025); }
          if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); sound.tone(300, 0.03, 'square', 0.025); }

          // paddle
          if (
            ball.vy > 0 &&
            ball.y + ball.r >= p.y &&
            ball.y - ball.r <= p.y + p.h &&
            ball.x >= p.x - ball.r &&
            ball.x <= p.x + p.w + ball.r
          ) {
            const rel = clamp((ball.x - (p.x + p.w / 2)) / (p.w / 2), -1, 1);
            const mag = Math.hypot(ball.vx, ball.vy) || st.speed;
            const angle = -Math.PI / 2 + rel * 1.05;
            ball.vx = Math.cos(angle) * mag;
            ball.vy = Math.sin(angle) * mag;
            ball.y = p.y - ball.r - 0.5;
            sound.tone(420, 0.05, 'square', 0.035);
          }

          for (const b of st.bricks) {
            if (!b.alive) continue;
            if (
              ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w &&
              ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h
            ) {
              const overlapX = Math.min(ball.x + ball.r - b.x, b.x + b.w - (ball.x - ball.r));
              const overlapY = Math.min(ball.y + ball.r - b.y, b.y + b.h - (ball.y - ball.r));
              if (overlapX < overlapY) ball.vx *= -1;
              else ball.vy *= -1;
              hitBrick(b);
              break;
            }
          }

          if (ball.y - ball.r > H) ball.dead = true;
        }
        st.balls = st.balls.filter((b) => !b.dead);

        if (!st.balls.length) loseLife();
        else if (st.bricks.every((b) => !b.alive)) nextLevel();

        // power-ups
        for (const d of st.drops) {
          d.y += d.vy * dt;
          d.t += dt;
          if (
            d.y + 10 > p.y && d.y - 10 < p.y + p.h &&
            d.x > p.x - 12 && d.x < p.x + p.w + 12
          ) {
            d.dead = true;
            st.flash = 1;
            if (d.kind === 'multi') {
              const src = st.balls[0];
              if (src) {
                for (let i = 0; i < 2; i++) {
                  const a = Math.atan2(src.vy, src.vx) + (i === 0 ? 0.6 : -0.6);
                  st.balls.push({ ...src, vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed });
                }
              }
              sound.tone(880, 0.1, 'triangle', 0.05);
            } else if (d.kind === 'wide') {
              p.w = Math.min(180, p.w + 42);
              sound.tone(300, 0.12, 'triangle', 0.05);
            } else {
              for (const ball of st.balls) {
                ball.vx *= 0.8;
                ball.vy *= 0.8;
              }
              sound.tone(220, 0.16, 'triangle', 0.05);
            }
          }
          if (d.y > H) d.dead = true;
        }
        st.drops = st.drops.filter((d) => !d.dead);
      }

      for (const p of st.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 320 * dt;
        p.life -= dt * 1.8;
      }
      st.particles = st.particles.filter((p) => p.life > 0);
    }

    /* ------------------------- draw ------------------------- */

    function draw() {
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);

      // subtle frame
      ctx.strokeStyle = 'rgba(255,255,255,.05)';
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

      for (const b of st.bricks) {
        if (!b.alive) continue;
        const dx = b.wobble * Math.sin(st.t * 60) * 2;
        ctx.fillStyle = b.hp > 1 ? b.tone : `${b.tone}aa`;
        ctx.globalAlpha = b.hp > 1 ? 1 : 0.82;
        ctx.beginPath();
        ctx.roundRect(b.x + dx, b.y, b.w, b.h, 4);
        ctx.fill();
        if (b.hp > 1) {
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = 'rgba(8,10,16,.55)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      const p = st.paddle;
      ctx.save();
      ctx.shadowColor = palette.accent;
      ctx.shadowBlur = 18;
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.w, p.h, 6);
      ctx.fill();
      ctx.restore();

      for (const ball of st.balls) {
        ctx.save();
        ctx.shadowColor = palette.accent2;
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#dfe7ff';
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (const d of st.drops) {
        const colour = d.kind === 'multi' ? palette.accent2 : d.kind === 'wide' ? palette.accent : palette.warn;
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(Math.sin(d.t * 4) * 0.2);
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.roundRect(-9, -8, 18, 16, 4);
        ctx.fill();
        ctx.fillStyle = '#05070c';
        ctx.font = '800 11px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.kind === 'multi' ? 'M' : d.kind === 'wide' ? 'W' : 'S', 0, 1);
        ctx.restore();
      }

      for (const p2 of st.particles) {
        ctx.globalAlpha = Math.max(0, p2.life);
        ctx.fillStyle = p2.color;
        ctx.fillRect(p2.x - 1.5, p2.y - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      if (!st.playing && !st.over) {
        ctx.fillStyle = 'rgba(6,9,15,.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = palette.ink;
        ctx.font = '700 22px ui-monospace, monospace';
        ctx.fillText('BRICKWORK', W / 2, H / 2 - 12);
        ctx.fillStyle = palette.dim;
        ctx.font = '500 13px ui-monospace, monospace';
        ctx.fillText('Click, tap or press Space to serve', W / 2, H / 2 + 16);
        ctx.textAlign = 'left';
      }
      if (st.paused && !st.over) {
        ctx.fillStyle = 'rgba(6,9,15,.7)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = palette.ink;
        ctx.font = '700 20px ui-monospace, monospace';
        ctx.fillText('PAUSED', W / 2, H / 2);
        ctx.textAlign = 'left';
      }
      if (st.over) {
        ctx.fillStyle = 'rgba(6,9,15,.78)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = palette.bad;
        ctx.font = '700 22px ui-monospace, monospace';
        ctx.fillText('GAME OVER', W / 2, H / 2 - 40);
        ctx.fillStyle = palette.ink;
        ctx.font = '800 38px ui-monospace, monospace';
        ctx.fillText(String(st.score), W / 2, H / 2 + 8);
        ctx.fillStyle = palette.dim;
        ctx.font = '500 13px ui-monospace, monospace';
        ctx.fillText(`Best ${getBest('brickwork')}  ·  reached level ${st.level}`, W / 2, H / 2 + 38);
        ctx.fillStyle = 'rgba(124,246,200,.85)';
        ctx.fillText('Click or press Space to play again', W / 2, H / 2 + 66);
        ctx.textAlign = 'left';
      }
    }

    /* ------------------------- input ------------------------- */

    function movePaddle(clientX) {
      const rect = s.canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * W;
      st.paddle.x = clamp(x - st.paddle.w / 2, 0, W - st.paddle.w);
    }

    const onMove = (e) => movePaddle(e.clientX);
    const onDown = (e) => {
      if (e.button === 2) return;
      st.paddle.x = clamp(st.paddle.x, 0, W - st.paddle.w);
      movePaddle(e.clientX);
      launch();
    };
    s.canvas.addEventListener('pointermove', onMove);
    s.canvas.addEventListener('pointerdown', onDown);
    s.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const kb = keys();
    let arrowHandled = false;
    const offPress = kb.press((key) => {
      if (key === ' ') launch();
      if (key === 'p' || key === 'P') {
        if (st.playing && !st.over) {
          st.paused = !st.paused;
          paint();
        }
      }
    });

    const stop = startLoop((dt) => {
      if (kb.isDown('ArrowLeft', 'a', 'A')) {
        st.paddle.x = clamp(st.paddle.x - 620 * dt, 0, W - st.paddle.w);
        arrowHandled = true;
      }
      if (kb.isDown('ArrowRight', 'd', 'D')) {
        st.paddle.x = clamp(st.paddle.x + 620 * dt, 0, W - st.paddle.w);
        arrowHandled = true;
      }
      if (arrowHandled && !st.playing && !st.over) launch();
      step(dt);
      draw();
    });

    reset();

    return {
      restart() {
        reset();
        st.playing = true;
        const b = st.balls[0];
        if (b && b.stuck) {
          b.vx = Math.cos(-Math.PI / 2 + 0.3) * st.speed;
          b.vy = Math.sin(-Math.PI / 2 + 0.3) * st.speed;
          b.stuck = false;
        }
      },
      destroy() {
        stop();
        offPress();
        s.canvas.removeEventListener('pointermove', onMove);
        s.canvas.removeEventListener('pointerdown', onDown);
        s.destroy();
        bar.remove();
      },
    };
  },
};

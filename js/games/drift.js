import { makeStage, startLoop, keys, palette } from '../lib/ui.js';
import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { el } from '../lib/util.js';

const W = 660;
const H = 460;
const TAU = Math.PI * 2;

function wrap(v, max) {
  if (v < 0) return v + max;
  if (v > max) return v - max;
  return v;
}

function rockShape(radius) {
  const points = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = radius * (0.72 + Math.random() * 0.42);
    points.push({ a, r });
  }
  return points;
}

export default {
  id: 'drift',
  title: 'Drift',
  tagline: 'Vector asteroids with inertia, screen wrap, splitting rocks and a difficulty curve that keeps coming.',
  genre: 'Arcade',
  tags: ['keyboard', 'physics', 'waves'],
  controls: [['← →', 'Rotate'], ['↑', 'Thrust'], ['Space', 'Fire'], ['P', 'Pause']],

  mount(stage) {
    const s = makeStage(stage, W, H, { label: 'Drift playfield' });
    const { ctx } = s;

    const scoreEl = el('span', { html: 'Score <b>0</b>' });
    const livesEl = el('span', { html: 'Ships <b>3</b>' });
    const waveEl = el('span', { html: 'Wave <b>1</b>' });
    const bar = el('div', { class: 'hud' }, [
      el('div', { class: 'hud-group' }, [scoreEl, livesEl, waveEl]),
      el('div', { class: 'hud-group' }, [el('span', { text: 'Wrap-around space' })]),
    ]);
    stage.insertBefore(bar, s.wrap);

    const st = {
      ship: null,
      rocks: [],
      bullets: [],
      particles: [],
      score: 0,
      lives: 3,
      wave: 1,
      playing: false,
      paused: false,
      over: false,
      invuln: 0,
      cooldown: 0,
      respawnTimer: 0,
      t: 0,
    };

    function spawnRock(size, x, y) {
      const speed = 26 + (3 - size) * 18 + st.wave * 5;
      const a = Math.random() * TAU;
      return {
        x, y, size,
        r: size * 12 + 6,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        rot: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 1.6,
        shape: rockShape(size * 12 + 6),
      };
    }

    function newWave() {
      const count = 3 + st.wave;
      for (let i = 0; i < count; i++) {
        let x, y;
        const edge = Math.floor(Math.random() * 4);
        if (edge === 0) { x = Math.random() * W; y = -20; }
        else if (edge === 1) { x = W + 20; y = Math.random() * H; }
        else if (edge === 2) { x = Math.random() * W; y = H + 20; }
        else { x = -20; y = Math.random() * H; }
        st.rocks.push(spawnRock(3, x, y));
      }
    }

    function resetShip() {
      st.ship = {
        x: W / 2, y: H / 2,
        vx: 0, vy: 0,
        angle: -Math.PI / 2,
        thrust: false,
        alive: true,
      };
      st.invuln = 2.2;
      st.cooldown = 0;
    }

    function reset() {
      st.rocks = [];
      st.bullets = [];
      st.particles = [];
      st.score = 0;
      st.lives = 3;
      st.wave = 1;
      st.playing = false;
      st.paused = false;
      st.over = false;
      st.respawnTimer = 0;
      st.t = 0;
      resetShip();
      newWave();
      paint();
    }

    function paint() {
      scoreEl.innerHTML = `Score <b>${st.score.toLocaleString('en-US')}</b>`;
      livesEl.innerHTML = `Ships <b>${Math.max(0, st.lives)}</b>`;
      waveEl.innerHTML = `Wave <b>${st.wave}</b>`;
    }

    function burst(x, y, colour, n = 14, speed = 200) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const sp = Math.random() * speed;
        st.particles.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.4 + Math.random() * 0.7, colour,
        });
      }
    }

    function fire() {
      if (!st.playing || st.paused || st.over || !st.ship.alive) return;
      if (st.cooldown > 0) return;
      st.cooldown = 0.16;
      const speed = 470;
      st.bullets.push({
        x: st.ship.x + Math.cos(st.ship.angle) * 14,
        y: st.ship.y + Math.sin(st.ship.angle) * 14,
        vx: Math.cos(st.ship.angle) * speed + st.ship.vx * 0.3,
        vy: Math.sin(st.ship.angle) * speed + st.ship.vy * 0.3,
        life: 1.1,
      });
      sound.tone(880, 0.05, 'square', 0.03);
    }

    function loseLife() {
      st.lives -= 1;
      burst(st.ship.x, st.ship.y, palette.bad, 26, 240);
      sound.sweep(300, 60, 0.4, 'sawtooth', 0.06);
      st.ship.alive = false;
      paint();
      if (st.lives <= 0) {
        st.over = true;
        st.playing = false;
        submitScore('drift', st.score);
      } else {
        st.respawnTimer = 1.1;
      }
    }

    /* ----------------- update ----------------- */

    function step(dt) {
      st.t += dt;
      if (!st.playing || st.paused || st.over) return;

      st.cooldown = Math.max(0, st.cooldown - dt);
      st.invuln = Math.max(0, st.invuln - dt);

      const ship = st.ship;
      if (!ship.alive) {
        st.respawnTimer -= dt;
        if (st.respawnTimer <= 0) resetShip();
      } else {
        const turn = 3.6 * dt;
        if (kbLocal.isDown('ArrowLeft', 'a', 'A')) ship.angle -= turn;
        if (kbLocal.isDown('ArrowRight', 'd', 'D')) ship.angle += turn;
        ship.thrust = kbLocal.isDown('ArrowUp', 'w', 'W');
        if (ship.thrust) {
          ship.vx += Math.cos(ship.angle) * 260 * dt;
          ship.vy += Math.sin(ship.angle) * 260 * dt;
          if (Math.random() < 0.5) {
            st.particles.push({
              x: ship.x - Math.cos(ship.angle) * 12,
              y: ship.y - Math.sin(ship.angle) * 12,
              vx: -Math.cos(ship.angle) * 90 + (Math.random() - 0.5) * 60,
              vy: -Math.sin(ship.angle) * 90 + (Math.random() - 0.5) * 60,
              life: 0.35, colour: palette.warn,
            });
          }
        }
        if (kbLocal.isDown(' ')) fire();

        const drag = Math.pow(0.62, dt);
        ship.vx *= drag;
        ship.vy *= drag;
        ship.x = wrap(ship.x + ship.vx * dt, W);
        ship.y = wrap(ship.y + ship.vy * dt, H);
      }

      for (const b of st.bullets) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        b.x = wrap(b.x, W);
        b.y = wrap(b.y, H);
        if (b.life <= 0) b.dead = true;
      }

      for (const r of st.rocks) {
        r.x = wrap(r.x + r.vx * dt, W);
        r.y = wrap(r.y + r.vy * dt, H);
        r.rot += r.spin * dt;
      }

      // bullet vs rock
      for (const b of st.bullets) {
        if (b.dead) continue;
        for (const r of st.rocks) {
          if (r.dead) continue;
          const dx = b.x - r.x;
          const dy = b.y - r.y;
          if (dx * dx + dy * dy < (r.r + 2) * (r.r + 2)) {
            b.dead = true;
            r.dead = true;
            st.score += r.size === 3 ? 20 : r.size === 2 ? 50 : 100;
            burst(r.x, r.y, palette.accent, 10 + r.size * 6, 170);
            sound.sweep(420, 120, 0.14, 'square', 0.045);
            if (r.size > 1) {
              for (let i = 0; i < 2; i++) {
                const child = spawnRock(r.size - 1, r.x, r.y);
                const a = Math.random() * TAU;
                const sp = 50 + Math.random() * 70;
                child.vx = r.vx * 0.6 + Math.cos(a) * sp;
                child.vy = r.vy * 0.6 + Math.sin(a) * sp;
                st.rocks.push(child);
              }
            }
            paint();
            break;
          }
        }
      }

      // ship vs rock
      if (st.ship.alive && st.invuln <= 0) {
        for (const r of st.rocks) {
          if (r.dead) continue;
          const dx = st.ship.x - r.x;
          const dy = st.ship.y - r.y;
          if (Math.hypot(dx, dy) < r.r + 8) {
            r.dead = true;
            loseLife();
            break;
          }
        }
      }

      st.bullets = st.bullets.filter((b) => !b.dead);
      st.rocks = st.rocks.filter((r) => !r.dead);

      if (!st.rocks.length) {
        st.wave += 1;
        st.score += 100;
        newWave();
        sound.win();
        paint();
      }

      for (const p of st.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.life -= dt;
      }
      st.particles = st.particles.filter((p) => p.life > 0);
    }

    /* ----------------- draw ----------------- */

    function drawShip() {
      const ship = st.ship;
      if (!ship.alive) return;
      if (st.invuln > 0 && Math.floor(st.t * 12) % 2 === 0) return;
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.rotate(ship.angle);
      ctx.strokeStyle = '#dff6ff';
      ctx.lineWidth = 2;
      ctx.shadowColor = palette.accent2;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-9, 8);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-9, -8);
      ctx.closePath();
      ctx.stroke();
      if (ship.thrust) {
        ctx.strokeStyle = palette.warn;
        ctx.beginPath();
        ctx.moveTo(-7, 4);
        ctx.lineTo(-16 - Math.random() * 8, 0);
        ctx.lineTo(-7, -4);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawRocks() {
      for (const r of st.rocks) {
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.rot);
        ctx.beginPath();
        r.shape.forEach((pt, i) => {
          const x = Math.cos(pt.a) * pt.r;
          const y = Math.sin(pt.a) * pt.r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.strokeStyle = '#b9c8e8';
        ctx.lineWidth = 1.8;
        ctx.shadowColor = 'rgba(122,162,255,.5)';
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.restore();
      }
    }

    function draw() {
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);

      // starfield
      for (let i = 0; i < 70; i++) {
        const x = (i * 97.3) % W;
        const y = (i * 53.7) % H;
        ctx.fillStyle = `rgba(255,255,255,${0.05 + (i % 4) * 0.03})`;
        ctx.fillRect(x, y, 1.6, 1.6);
      }

      drawRocks();
      drawShip();

      for (const b of st.bullets) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(b.x - 1.5, b.y - 1.5, 3.5, 3.5);
      }
      for (const p of st.particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        ctx.fillStyle = p.colour;
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;

      if (!st.playing) {
        ctx.fillStyle = 'rgba(6,9,15,.68)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = palette.ink;
        ctx.font = '700 24px ui-monospace, monospace';
        ctx.fillText('DRIFT', W / 2, H / 2 - 34);
        ctx.fillStyle = palette.dim;
        ctx.font = '500 13px ui-monospace, monospace';
        ctx.fillText('Arrow keys to fly · Space to fire', W / 2, H / 2 - 4);
        ctx.fillStyle = 'rgba(124,246,200,.8)';
        ctx.fillText(st.over ? 'Click or press Space to fly again' : 'Click or press Space to launch', W / 2, H / 2 + 24);
        ctx.textAlign = 'left';
      }
      if (st.paused && st.playing) {
        ctx.fillStyle = 'rgba(6,9,15,.72)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = palette.ink;
        ctx.font = '700 20px ui-monospace, monospace';
        ctx.fillText('PAUSED', W / 2, H / 2);
        ctx.textAlign = 'left';
      }
      if (st.over) {
        ctx.fillStyle = 'rgba(6,9,15,.8)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = palette.bad;
        ctx.font = '700 20px ui-monospace, monospace';
        ctx.fillText('SHIP LOST', W / 2, H / 2 - 44);
        ctx.fillStyle = palette.ink;
        ctx.font = '800 36px ui-monospace, monospace';
        ctx.fillText(String(st.score), W / 2, H / 2);
        ctx.fillStyle = palette.dim;
        ctx.font = '500 12px ui-monospace, monospace';
        ctx.fillText(`Wave ${st.wave} · best ${getBest('drift')}`, W / 2, H / 2 + 28);
        ctx.fillStyle = 'rgba(124,246,200,.85)';
        ctx.fillText('Press R to relaunch', W / 2, H / 2 + 54);
        ctx.textAlign = 'left';
      }
    }

    const kbLocal = keys();
    const offPress = kbLocal.press((key) => {
      if (key === 'p' || key === 'P') {
        if (st.playing && !st.over) st.paused = !st.paused;
      }
      if (key === 'r' || key === 'R') {
        reset();
        st.playing = true;
      }
      if (key === ' ' && !st.playing) {
        if (st.over) reset();
        st.playing = true;
      }
    });

    const onDown = () => {
      if (st.over) reset();
      st.playing = true;
    };
    s.canvas.addEventListener('pointerdown', onDown);

    const stop = startLoop((dt) => {
      step(dt);
      draw();
    });

    reset();

    return {
      restart() { reset(); st.playing = true; },
      destroy() {
        stop();
        offPress();
        s.canvas.removeEventListener('pointerdown', onDown);
        s.destroy();
        bar.remove();
      },
    };
  },
};

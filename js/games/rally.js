import { makeStage, startLoop, keys, palette } from '../lib/ui.js';
import { sound } from '../lib/audio.js';
import { el } from '../lib/util.js';

const W = 660;
const H = 420;
const PADDLE_W = 12;
const PADDLE_H = 78;

export default {
  id: 'rally',
  title: 'Rally',
  tagline: 'Pong with real spin, a magnus-free but honest physics model, and an opponent that stops pretending to be bad.',
  genre: 'Arcade',
  tags: ['mouse', 'ai', 'first to 7'],
  controls: [['Mouse / Touch', 'Move paddle'], ['↑ ↓ / W S', 'Move paddle'], ['Space', 'Serve'], ['P', 'Pause']],

  mount(stage) {
    const s = makeStage(stage, W, H, { label: 'Rally court' });
    const { ctx } = s;

    const scoreEl = el('span', { html: 'You <b>0</b> — <b>0</b> CPU' });
    const rallyEl = el('span', { html: 'Rally <b>0</b>' });
    const bar = el('div', { class: 'hud' }, [
      el('div', { class: 'hud-group' }, [scoreEl, rallyEl]),
      el('div', { class: 'hud-group' }, [el('span', { text: 'First to 7' })]),
    ]);
    stage.insertBefore(bar, s.wrap);

    const st = {
      player: { y: H / 2 - PADDLE_H / 2, vy: 0 },
      cpu: { y: H / 2 - PADDLE_H / 2, vy: 0, jitter: 0 },
      ball: { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 7, speed: 330 },
      scores: { player: 0, cpu: 0 },
      trail: [],
      serving: true,
      serveTo: 1,
      rally: 0,
      paused: false,
      over: false,
      t: 0,
      flash: 0,
    };

    function serve(direction) {
      const angle = (Math.random() - 0.5) * 0.7;
      const speed = 330 + st.rally * 6;
      st.ball = {
        x: W / 2,
        y: H / 2,
        vx: Math.cos(angle) * speed * direction,
        vy: Math.sin(angle) * speed,
        r: 7,
        speed,
      };
      st.serving = false;
      st.rally = 0;
      st.trail = [];
      paint();
    }

    function paint() {
      scoreEl.innerHTML = `You <b>${st.scores.player}</b> — <b>${st.scores.cpu}</b> CPU`;
      rallyEl.innerHTML = `Rally <b>${st.rally}</b>`;
    }

    function point(toPlayer) {
      st.flash = 1;
      if (toPlayer) {
        st.scores.player += 1;
        sound.tone(720, 0.12, 'triangle', 0.05);
      } else {
        st.scores.cpu += 1;
        sound.tone(260, 0.14, 'square', 0.05);
      }
      st.serving = true;
      st.serveTo = toPlayer ? -1 : 1;
      st.ball.vx = 0;
      st.ball.vy = 0;
      paint();
      if (st.scores.player >= 7 || st.scores.cpu >= 7) {
        st.over = true;
        if (st.scores.player >= 7) sound.win();
      }
    }

    function reset() {
      st.scores = { player: 0, cpu: 0 };
      st.player.y = H / 2 - PADDLE_H / 2;
      st.cpu.y = H / 2 - PADDLE_H / 2;
      st.rally = 0;
      st.serving = true;
      st.serveTo = 1;
      st.paused = false;
      st.over = false;
      st.flash = 0;
      st.trail = [];
      st.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 7, speed: 330 };
      paint();
    }

    /* ------------- update ------------- */

    function step(dt) {
      st.t += dt;
      st.flash = Math.max(0, st.flash - dt * 2.5);

      if (st.paused || st.over) return;

      const p = st.player;
      const prevY = p.y;
      const up = kbLocal.isDown('ArrowUp', 'w', 'W');
      const down = kbLocal.isDown('ArrowDown', 's', 'S');
      if (up) p.y -= 560 * dt;
      if (down) p.y += 560 * dt;
      p.y = Math.max(0, Math.min(H - PADDLE_H, p.y));
      p.vy = (p.y - prevY) / Math.max(dt, 0.0001);

      // CPU: tracks the ball with a reaction delay and a shrinking error margin
      const target = st.ball.y + st.cpu.jitter;
      st.cpu.jitter *= Math.pow(0.02, dt);
      const diff = target - (st.cpu.y + PADDLE_H / 2);
      const maxSpeed = 380 + Math.min(220, st.rally * 18);
      st.cpu.y += Math.sign(diff) * Math.min(Math.abs(diff) * 7 * dt, maxSpeed * dt);
      st.cpu.y = Math.max(0, Math.min(H - PADDLE_H, st.cpu.y));

      if (st.serving) return;

      const b = st.ball;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      st.trail.push({ x: b.x, y: b.y });
      if (st.trail.length > 14) st.trail.shift();

      if (b.y - b.r <= 0) {
        b.y = b.r;
        b.vy = Math.abs(b.vy);
        sound.tone(480, 0.035, 'square', 0.03);
      }
      if (b.y + b.r >= H) {
        b.y = H - b.r;
        b.vy = -Math.abs(b.vy);
        sound.tone(480, 0.035, 'square', 0.03);
      }

      const px = 26;
      if (b.x - b.r <= px + PADDLE_W && b.x + b.r >= px && b.y > p.y && b.y < p.y + PADDLE_H && b.vx < 0) {
        b.x = px + PADDLE_W + b.r;
        st.rally += 1;
        hitPaddle(p.vy, 1);
      }

      const cx = W - 26 - PADDLE_W;
      if (b.x + b.r >= cx && b.x - b.r <= cx + PADDLE_W && b.y > st.cpu.y && b.y < st.cpu.y + PADDLE_H && b.vx > 0) {
        b.x = cx - b.r;
        st.rally += 1;
        hitPaddle(0, -1);
      }

      if (b.x < -30) point(false);
      if (b.x > W + 30) point(true);
    }

    function hitPaddle(spin, dir) {
      const b = st.ball;
      const maxSpeed = Math.min(980, 330 + st.rally * 26);
      const relative = (b.y - (dir > 0 ? st.player.y + PADDLE_H / 2 : st.cpu.y + PADDLE_H / 2)) / (PADDLE_H / 2);
      const angle = Math.max(-0.9, Math.min(0.9, relative * 0.85)) + Math.max(-0.35, Math.min(0.35, spin / 1200));
      b.speed = maxSpeed;
      b.vx = Math.cos(angle) * maxSpeed * dir;
      b.vy = Math.sin(angle) * maxSpeed;
      // the CPU misjudges the ball a little more as the rally heats up
      st.cpu.jitter = (Math.random() - 0.5) * Math.min(120, 20 + st.rally * 10);
      sound.tone(660, 0.045, 'square', 0.035);
      paint();
    }

    /* ------------- draw ------------- */

    function draw() {
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(255,255,255,.13)';
      ctx.lineWidth = 2;
      ctx.setLineDash([9, 12]);
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = 'rgba(255,255,255,.08)';
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 52, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,.06)';
      ctx.font = '800 76px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(st.scores.player), W / 2 - 90, 92);
      ctx.fillText(String(st.scores.cpu), W / 2 + 90, 92);
      ctx.textAlign = 'left';

      ctx.save();
      ctx.shadowColor = palette.accent;
      ctx.shadowBlur = 16;
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.roundRect(26, st.player.y, PADDLE_W, PADDLE_H, 6);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.shadowColor = palette.accent2;
      ctx.shadowBlur = 16;
      ctx.fillStyle = palette.accent2;
      ctx.beginPath();
      ctx.roundRect(W - 26 - PADDLE_W, st.cpu.y, PADDLE_W, PADDLE_H, 6);
      ctx.fill();
      ctx.restore();

      st.trail.forEach((t, i) => {
        ctx.globalAlpha = (i / st.trail.length) * 0.28;
        ctx.fillStyle = palette.ink;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 6, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(st.ball.x, st.ball.y, st.ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (st.flash > 0) {
        ctx.fillStyle = `rgba(124,246,200,${st.flash * 0.08})`;
        ctx.fillRect(0, 0, W, H);
      }

      if (st.serving && !st.over) {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(233,237,247,.85)';
        ctx.font = '600 13px ui-monospace, monospace';
        ctx.fillText('Click or press Space to serve', W / 2, H - 34);
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
        ctx.fillStyle = 'rgba(6,9,15,.8)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = st.scores.player >= 7 ? palette.accent : palette.bad;
        ctx.font = '800 30px ui-monospace, monospace';
        ctx.fillText(st.scores.player >= 7 ? 'YOU WIN' : 'CPU WINS', W / 2, H / 2 - 14);
        ctx.fillStyle = palette.ink;
        ctx.font = '700 18px ui-monospace, monospace';
        ctx.fillText(`${st.scores.player} — ${st.scores.cpu}`, W / 2, H / 2 + 18);
        ctx.fillStyle = palette.dim;
        ctx.font = '500 12px ui-monospace, monospace';
        ctx.fillText('Press R for a rematch', W / 2, H / 2 + 46);
        ctx.textAlign = 'left';
      }
    }

    const kbLocal = keys();
    const serveNow = () => {
      if (st.over) {
        reset();
        return;
      }
      if (st.serving) serve(st.serveTo);
    };
    const offPress = kbLocal.press((key) => {
      if (key === ' ') serveNow();
      if (key === 'p' || key === 'P') st.paused = !st.paused;
      if (key === 'r' || key === 'R') reset();
    });

    const onPointer = (e) => {
      const { y } = s.toLocal(e);
      st.player.y = Math.max(0, Math.min(H - PADDLE_H, y - PADDLE_H / 2));
    };
    const onDown = (e) => {
      onPointer(e);
      serveNow();
    };
    s.canvas.addEventListener('pointermove', onPointer);
    s.canvas.addEventListener('pointerdown', onDown);

    const stop = startLoop((dt) => {
      step(dt);
      draw();
    });

    reset();

    return {
      restart() { reset(); serve(1); },
      destroy() {
        stop();
        offPress();
        s.canvas.removeEventListener('pointermove', onPointer);
        s.canvas.removeEventListener('pointerdown', onDown);
        s.destroy();
        bar.remove();
      },
    };
  },
};

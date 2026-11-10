import { makeStage, startLoop, keys } from '../lib/ui.js';
import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { el, clamp, randInt } from '../lib/util.js';

const TW = 24;
const ROWS = 15;
const W = 648;
const H = 360;
const LEVEL_W = 190;

const SOLID = new Set(['#', '=']);

function makeLevel() {
  const tiles = Array.from({ length: ROWS }, () => new Array(LEVEL_W).fill('.'));
  let x = 0;
  while (x < LEVEL_W) {
    const gap = x > 8 && Math.random() < 0.16 ? randInt(2, 4) : 0;
    if (gap) {
      x += gap;
      continue;
    }
    for (let r = 13; r < ROWS; r++) tiles[r][x] = '#';
    if (x > 10 && Math.random() < 0.07) tiles[12][x] = '^';
    x += 1;
  }
  for (let i = 0; i < 46; i++) {
    const px = randInt(4, LEVEL_W - 10);
    const py = randInt(7, 11);
    const len = randInt(2, 4);
    for (let k = 0; k < len; k++) {
      if (tiles[py][px + k] === '.') tiles[py][px + k] = '=';
      if (Math.random() < 0.5 && py - 1 > 0 && tiles[py - 1][px + k] === '.') tiles[py - 1][px + k] = 'o';
    }
  }
  for (let i = 0; i < 22; i++) {
    const px = randInt(4, LEVEL_W - 6);
    if (tiles[11][px] === '.' && tiles[12][px] === '.') tiles[11][px] = 'o';
  }
  // guaranteed landing strip and goal
  for (let k = 0; k < 6; k++) {
    for (let r = 13; r < ROWS; r++) tiles[r][LEVEL_W - 1 - k] = '#';
    for (let r = 0; r < 13; r++) tiles[r][LEVEL_W - 1 - k] = '.';
  }
  tiles[12][LEVEL_W - 3] = 'F';
  return tiles;
}

export default {
  id: 'platformer',
  title: 'Long Jump',
  tagline: 'A precision platformer with coyote time, variable jump height and a generated course every run.',
  genre: 'Platform',
  tags: ['keyboard', 'physics', 'generated'],
  controls: [
    ['← → / A D', 'Run'],
    ['↑ / W / Space', 'Jump (twice)'],
    ['R', 'New course'],
  ],

  mount(stage) {
    const s = makeStage(stage, W, H, { label: 'Long Jump course' });
    const { ctx } = s;

    const scoreEl = el('span', { html: 'Score <b>0</b>' });
    const livesEl = el('span', { html: 'Lives <b>3</b>' });
    const coinEl = el('span', { html: 'Gems <b>0</b>' });
    const bestEl = el('span', { html: `Best <b>${getBest('platformer')}</b>` });
    const bar = el('div', { class: 'hud' }, [
      el('div', { class: 'hud-group' }, [scoreEl, livesEl, coinEl]),
      el('div', { class: 'hud-group' }, [bestEl]),
    ]);
    stage.insertBefore(bar, s.wrap);

    const st = {
      tiles: makeLevel(),
      px: 3 * TW,
      py: 10 * TW,
      vx: 0,
      vy: 0,
      w: 16,
      h: 22,
      onGround: false,
      coyote: 0,
      jumps: 0,
      facing: 1,
      camX: 0,
      score: 0,
      gems: 0,
      lives: 3,
      coins: [],
      over: false,
      won: false,
      t: 0,
      flash: 0,
    };

    function tileAt(tx, ty) {
      if (ty < 0) return '.';
      if (tx < 0 || tx >= LEVEL_W) return '#';
      if (ty >= ROWS) return '.';
      return st.tiles[ty][tx] || '.';
    }

    function isSolid(tx, ty) {
      return SOLID.has(tileAt(tx, ty));
    }

    function collectCoins() {
      st.coins = [];
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < LEVEL_W; x++) {
          if (st.tiles[y][x] === 'o') st.coins.push({ x, y, taken: false, phase: Math.random() * 6 });
        }
      }
    }

    function reset(keepScore = false) {
      st.tiles = makeLevel();
      collectCoins();
      st.px = 3 * TW;
      st.py = 10 * TW;
      st.vx = 0;
      st.vy = 0;
      st.onGround = false;
      st.coyote = 0;
      st.jumps = 0;
      st.camX = 0;
      st.over = false;
      st.won = false;
      st.flash = 0;
      if (!keepScore) {
        st.score = 0;
        st.gems = 0;
        st.lives = 3;
      }
      paintHud();
    }

    function paintHud(record = false) {
      scoreEl.innerHTML = `Score <b>${st.score.toLocaleString('en-US')}</b>`;
      livesEl.innerHTML = `Lives <b>${st.lives}</b>`;
      coinEl.innerHTML = `Gems <b>${st.gems}</b>`;
      const best = record ? Math.max(st.score, getBest('platformer')) : Math.max(getBest('platformer'), st.score);
      bestEl.innerHTML = `Best <b>${best.toLocaleString('en-US')}</b>`;
    }

    function hurt() {
      st.lives -= 1;
      st.flash = 0.5;
      sound.bad();
      if (st.lives <= 0) {
        st.over = true;
        const record = submitScore('platformer', st.score);
        paintHud(record);
        return;
      }
      st.px = 3 * TW;
      st.py = 10 * TW;
      st.vx = 0;
      st.vy = 0;
      paintHud();
    }

    function update(dt) {
      st.t += dt;
      st.flash = Math.max(0, st.flash - dt);
      if (st.over) return;

      const run = (kb.isDown('ArrowRight', 'd', 'D') ? 1 : 0) - (kb.isDown('ArrowLeft', 'a', 'A') ? 1 : 0);
      const accel = st.onGround ? 1900 : 1200;
      if (run) {
        st.vx += run * accel * dt;
        st.facing = run;
      } else if (st.onGround) {
        st.vx *= 0.82;
      } else {
        st.vx *= 0.98;
      }
      st.vx = clamp(st.vx, -260, 260);

      st.vy += 1750 * dt;
      if (st.vy > 780) st.vy = 780;

      // horizontal
      const nx = st.px + st.vx * dt;
      if (!collides(nx, st.py)) {
        st.px = nx;
      } else {
        // step up one tile
        if (st.onGround && !collides(nx, st.py - TW)) {
          st.py -= TW;
          st.px = nx;
        } else {
          st.vx = 0;
        }
      }

      // vertical
      const ny = st.py + st.vy * dt;
      if (!collides(st.px, ny)) {
        st.py = ny;
        st.onGround = false;
      } else {
        if (st.vy > 0) {
          st.py = Math.floor((ny + st.h) / TW) * TW - st.h;
          st.onGround = true;
          st.jumps = 0;
        } else {
          st.py = Math.floor(ny / TW) * TW + TW;
        }
        st.vy = 0;
      }

      if (st.onGround) st.coyote = 0.11;
      else st.coyote = Math.max(0, st.coyote - dt);

      // hazards
      const cx = Math.floor((st.px + st.w / 2) / TW);
      const cy = Math.floor((st.py + st.h / 2) / TW);
      const under = tileAt(cx, Math.floor((st.py + st.h) / TW));
      if (under === '^' || st.py > H + 200) hurt();

      // gems
      for (const c of st.coins) {
        if (c.taken) continue;
        if (Math.abs(c.x * TW + TW / 2 - (st.px + st.w / 2)) < 18 && Math.abs(c.y * TW + TW / 2 - (st.py + st.h / 2)) < 20) {
          c.taken = true;
          st.gems += 1;
          st.score += 25;
          sound.tone(760 + Math.min(st.gems, 10) * 40, 0.06, 'triangle', 0.04);
          paintHud();
        }
      }

      // goal
      if (!st.won && tileAt(Math.floor((st.px + st.w / 2) / TW), Math.floor((st.py + st.h / 2) / TW)) === 'F') {
        st.score += 250 + st.gems * 5;
        st.won = true;
        sound.win();
        paintHud();
        setTimeout(() => {
          if (!st.over) reset(true);
        }, 900);
      }

      st.camX = clamp(st.px - W * 0.38, 0, LEVEL_W * TW - W);
      if (st.py > H) hurt();
    }

    function collides(x, y) {
      const x0 = Math.floor(x / TW);
      const x1 = Math.floor((x + st.w) / TW);
      const y0 = Math.floor(y / TW);
      const y1 = Math.floor((y + st.h) / TW);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (isSolid(tx, ty)) return true;
        }
      }
      return false;
    }

    function jump() {
      if (st.over) return;
      if (st.onGround || st.coyote > 0) {
        st.vy = -560;
        st.onGround = false;
        st.coyote = 0;
        st.jumps = 1;
        sound.tone(520, 0.06, 'square', 0.035);
      } else if (st.jumps < 2) {
        st.vy = -470;
        st.jumps = 2;
        sound.tone(660, 0.06, 'triangle', 0.035);
      }
    }

    function render() {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#070c15');
      sky.addColorStop(0.6, '#101a2a');
      sky.addColorStop(1, '#16202e');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // parallax hills
      ctx.fillStyle = 'rgba(122,162,255,.08)';
      for (let i = 0; i < 12; i++) {
        const bx = ((i * 190 - st.camX * 0.3) % (12 * 190) + 12 * 190) % (12 * 190);
        ctx.beginPath();
        ctx.arc(bx, H - 40, 120, Math.PI, 0);
        ctx.fill();
      }

      const x0 = Math.max(0, Math.floor(st.camX / TW) - 1);
      const x1 = Math.min(LEVEL_W - 1, Math.ceil((st.camX + W) / TW) + 1);
      for (let tx = x0; tx <= x1; tx++) {
        for (let ty = 0; ty < ROWS; ty++) {
          const t = st.tiles[ty][tx];
          const sx = tx * TW - st.camX;
          const sy = ty * TW;
          if (t === '#' || t === '=') {
            ctx.fillStyle = t === '#' ? '#232c3d' : '#2b3549';
            ctx.fillRect(sx, sy, TW, TW);
            ctx.fillStyle = 'rgba(124,246,200,.16)';
            ctx.fillRect(sx, sy, TW, 3);
          } else if (t === '^') {
            ctx.fillStyle = '#ff5c7a';
            ctx.beginPath();
            ctx.moveTo(sx, sy + TW);
            ctx.lineTo(sx + TW / 2, sy + 6);
            ctx.lineTo(sx + TW, sy + TW);
            ctx.closePath();
            ctx.fill();
          } else if (t === 'F') {
            ctx.fillStyle = '#7cf6c8';
            ctx.fillRect(sx + 8, sy - TW, 3, TW * 2);
            ctx.beginPath();
            ctx.moveTo(sx + 11, sy - TW);
            ctx.lineTo(sx + 30, sy - TW + 8);
            ctx.lineTo(sx + 11, sy - TW + 16);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      for (const c of st.coins) {
        if (c.taken) continue;
        const sx = c.x * TW + TW / 2 - st.camX;
        if (sx < -20 || sx > W + 20) continue;
        const sy = c.y * TW + TW / 2 + Math.sin(st.t * 3 + c.phase) * 2;
        ctx.fillStyle = '#ffb545';
        ctx.beginPath();
        ctx.moveTo(sx, sy - 7);
        ctx.lineTo(sx + 6, sy);
        ctx.lineTo(sx, sy + 7);
        ctx.lineTo(sx - 6, sy);
        ctx.closePath();
        ctx.fill();
      }

      // player
      const px = st.px - st.camX;
      ctx.fillStyle = st.flash > 0 ? '#ffffff' : '#7cf6c8';
      ctx.fillRect(px, st.py, st.w, st.h);
      ctx.fillStyle = '#08120f';
      ctx.fillRect(px + (st.facing > 0 ? 9 : 3), st.py + 5, 4, 4);
      if (!st.onGround) {
        ctx.fillStyle = 'rgba(124,246,200,.25)';
        ctx.fillRect(px + 2, st.py + st.h, st.w - 4, 3);
      }

      if (st.over) {
        ctx.fillStyle = 'rgba(6,9,15,.8)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff5c7a';
        ctx.font = '700 22px ui-monospace, monospace';
        ctx.fillText('OUT OF LIVES', W / 2, H / 2 - 18);
        ctx.fillStyle = '#e9edf7';
        ctx.font = '600 15px ui-monospace, monospace';
        ctx.fillText(`${st.score} points · ${st.gems} gems`, W / 2, H / 2 + 10);
        ctx.fillStyle = '#8d95a9';
        ctx.font = '500 12px ui-monospace, monospace';
        ctx.fillText('Press R for a fresh course', W / 2, H / 2 + 36);
        ctx.textAlign = 'left';
      }
    }

    const kb = keys();
    const unPress = kb.press((key) => {
      if (key === 'ArrowUp' || key === 'w' || key === 'W' || key === ' ') jump();
      if (key === 'r' || key === 'R') reset();
    });

    const onTap = (e) => {
      const p = s.toLocal(e);
      if (p.y > H * 0.5 && p.x < W * 0.35) st.vx = -140;
      else jump();
    };
    s.canvas.addEventListener('pointerdown', onTap);

    const stop = startLoop((dt) => {
      update(dt);
      render();
    });

    reset();

    return {
      restart() {
        reset();
      },
      destroy() {
        stop();
        unPress();
        s.canvas.removeEventListener('pointerdown', onTap);
        s.destroy();
        bar.remove();
      },
    };
  },
};

import { makeStage, startLoop, keys, swipes, palette } from '../lib/ui.js';
import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { el, clamp } from '../lib/util.js';

const MAPW = 24;
const MAPH = 24;
const FOV = 0.66;

// Procedural arena: border, a pillar lattice, and a small central block.
// Keeping every wall a single cell wide means the whole floor stays connected.
const WALLS = (() => {
  const grid = [];
  for (let y = 0; y < MAPH; y++) {
    const row = new Uint8Array(MAPW);
    for (let x = 0; x < MAPW; x++) {
      const border = x === 0 || y === 0 || x === MAPW - 1 || y === MAPH - 1;
      const pillar = x % 5 === 2 && y % 5 === 2;
      const core = (x === 11 || x === 12) && (y === 11 || y === 12);
      row[x] = border || pillar || core ? 1 : 0;
    }
    grid.push(row);
  }
  return grid;
})();

const solid = (x, y) => {
  const ix = x | 0;
  const iy = y | 0;
  if (ix < 0 || iy < 0 || ix >= MAPW || iy >= MAPH) return true;
  return WALLS[iy][ix] === 1;
};

/** One DDA ray. Returns the perpendicular distance to the first wall. */
function castRay(px, py, rayX, rayY) {
  let mapX = Math.floor(px);
  let mapY = Math.floor(py);
  const deltaX = Math.abs(1 / rayX);
  const deltaY = Math.abs(1 / rayY);
  const stepX = rayX < 0 ? -1 : 1;
  const stepY = rayY < 0 ? -1 : 1;
  let sideX = (rayX < 0 ? px - mapX : mapX + 1 - px) * deltaX;
  let sideY = (rayY < 0 ? py - mapY : mapY + 1 - py) * deltaY;
  let side = 0;
  let guard = 0;
  while (guard++ < 90) {
    if (sideX < sideY) {
      sideX += deltaX;
      mapX += stepX;
      side = 0;
    } else {
      sideY += deltaY;
      mapY += stepY;
      side = 1;
    }
    if (solid(mapX, mapY)) break;
  }
  const dist = side === 0 ? sideX - deltaX : sideY - deltaY;
  return { dist: Math.max(0.08, dist), side, mapX, mapY };
}

export default {
  id: 'corridor',
  title: 'Corridor Zero',
  tagline: 'A first-person raycaster: every wall is a real ray cast against a grid, drones are depth-sorted billboards, and they hunt you.',
  genre: 'Shooter',
  tags: ['3d', 'keyboard', 'mouse', 'waves'],
  controls: [
    ['W / S', 'Forward, back'],
    ['A / D', 'Strafe'],
    ['← / → or drag', 'Turn'],
    ['Click / Space', 'Fire'],
    ['R', 'Restart'],
  ],

  mount(stage) {
    const s = makeStage(stage, 640, 360, { label: 'Corridor Zero viewport' });
    const { ctx, W, H, canvas } = s;

    const hpEl = el('span', { html: 'Armour <b>100</b>' });
    const waveEl = el('span', { html: 'Wave <b>1</b>' });
    const killEl = el('span', { html: 'Kills <b>0</b>' });
    const bestEl = el('span', { html: `Best <b>${getBest('corridor')}</b>` });
    const bar = el('div', { class: 'hud' }, [
      el('div', { class: 'hud-group' }, [hpEl, waveEl]),
      el('div', { class: 'hud-group' }, [killEl, bestEl]),
    ]);
    stage.insertBefore(bar, s.wrap);

    const zbuf = new Float32Array(W);

    const st = {
      px: 3.5,
      py: 3.5,
      ang: 0,
      hp: 100,
      wave: 1,
      kills: 0,
      drones: [],
      t: 0,
      dead: false,
      started: false,
      cooldown: 0,
      flash: 0,
      hurt: 0,
      sway: 0,
    };

    function spawnWave() {
      const count = 1 + st.wave;
      st.drones = [];
      for (let i = 0; i < count; i++) {
        let x = 0;
        let y = 0;
        let tries = 0;
        do {
          x = 1.5 + Math.random() * (MAPW - 3);
          y = 1.5 + Math.random() * (MAPH - 3);
          tries++;
        } while ((solid(x, y) || Math.hypot(x - st.px, y - st.py) < 7) && tries < 200);
        st.drones.push({
          x,
          y,
          hp: 34 + st.wave * 6,
          maxHp: 34 + st.wave * 6,
          alive: true,
          phase: Math.random() * 7,
          flash: 0,
        });
      }
    }

    function reset() {
      st.px = 3.5;
      st.py = 3.5;
      st.ang = 0;
      st.hp = 100;
      st.wave = 1;
      st.kills = 0;
      st.t = 0;
      st.dead = false;
      st.started = true;
      st.cooldown = 0;
      st.flash = 0;
      st.hurt = 0;
      spawnWave();
      paintHud();
    }

    function paintHud(record = false) {
      hpEl.innerHTML = `Armour <b>${Math.max(0, Math.round(st.hp))}</b>`;
      waveEl.innerHTML = `Wave <b>${st.wave}</b>`;
      killEl.innerHTML = `Kills <b>${st.kills}</b>`;
      const best = record ? Math.max(st.kills * 100 + st.wave * 50, getBest('corridor')) : Math.max(getBest('corridor'), st.kills * 100 + st.wave * 50);
      bestEl.innerHTML = `Best <b>${best.toLocaleString('en-US')}</b>`;
    }

    function score() {
      return st.kills * 100 + st.wave * 50;
    }

    function die() {
      if (st.dead) return;
      st.dead = true;
      const record = submitScore('corridor', score());
      paintHud(record);
      sound.bad();
    }

    /* ------------------------- input ------------------------- */

    const kb = keys();
    const unPress = kb.press((key) => {
      if (key === 'r' || key === 'R') reset();
      if (key === ' ' && !st.dead) fire();
    });

    let dragging = false;
    let lastX = 0;
    const onDown = (e) => {
      dragging = true;
      lastX = e.clientX;
      st.started = true;
      if (!st.dead) fire();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      st.ang -= dx * 0.005;
    };
    const onUp = () => {
      dragging = false;
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    const unSwipe = swipes(canvas, (dir) => {
      if (dir === 'left') st.ang -= 0.45;
      if (dir === 'right') st.ang += 0.45;
      if (dir === 'up') move(0.8);
      if (dir === 'down') move(-0.8);
    });

    /* ------------------------- combat ------------------------- */

    function projection(d) {
      const dirX = Math.cos(st.ang);
      const dirY = Math.sin(st.ang);
      const planeX = -dirY * FOV;
      const planeY = dirX * FOV;
      const dx = d.x - st.px;
      const dy = d.y - st.py;
      const invDet = 1 / (planeX * dirY - dirX * planeY);
      const tX = invDet * (dirY * dx - dirX * dy);
      const tY = invDet * (-planeY * dx + planeX * dy);
      return { tX, tY, screenX: (W / 2) * (1 + tX / tY), size: (H / tY) * 0.5 };
    }

    function fire() {
      if (st.cooldown > 0 || st.dead) return;
      st.cooldown = 0.2;
      st.flash = 0.09;
      sound.tone(180, 0.05, 'square', 0.04);
      const dirX = Math.cos(st.ang);
      const dirY = Math.sin(st.ang);
      const wall = castRay(st.px, st.py, dirX, dirY).dist;

      let target = null;
      let bestOff = Infinity;
      for (const d of st.drones) {
        if (!d.alive) continue;
        const p = projection(d);
        if (p.tY <= 0.3 || p.tY > wall) continue;
        const off = Math.abs(p.screenX - W / 2);
        if (off < p.size * 0.55 && off < bestOff) {
          bestOff = off;
          target = d;
        }
      }
      if (!target) return;
      target.hp -= 40;
      target.flash = 0.09;
      if (target.hp <= 0) {
        target.alive = false;
        st.kills += 1;
        sound.tone(660, 0.07, 'triangle', 0.05);
        paintHud();
        if (st.drones.every((d) => !d.alive)) {
          st.wave += 1;
          st.hp = Math.min(100, st.hp + 18);
          setTimeout(() => {
            if (!st.dead) {
              spawnWave();
              paintHud();
            }
          }, 700);
          sound.good();
        }
      }
    }

    function move(amount) {
      const step = 3.1 * amount;
      const nx = st.px + Math.cos(st.ang) * step;
      const ny = st.py + Math.sin(st.ang) * step;
      if (!solid(nx, st.py)) st.px = nx;
      if (!solid(st.px, ny)) st.py = ny;
    }

    /* ------------------------- update ------------------------- */

    function update(dt) {
      st.t += dt;
      st.cooldown = Math.max(0, st.cooldown - dt);
      st.flash = Math.max(0, st.flash - dt);
      st.hurt = Math.max(0, st.hurt - dt);

      if (st.dead) return;

      st.started = true;
      const turn = (kb.isDown('ArrowLeft', 'q', 'Q') ? -1 : 0) + (kb.isDown('ArrowRight', 'e', 'E') ? 1 : 0);
      st.ang += turn * 2.4 * dt;

      const forward = (kb.isDown('ArrowUp', 'w', 'W') ? 1 : 0) - (kb.isDown('ArrowDown', 's', 'S') ? 1 : 0);
      const strafe = (kb.isDown('d', 'D') ? 1 : 0) - (kb.isDown('a', 'A') ? 1 : 0);
      if (forward) move(forward * dt);
      if (strafe) {
        const nx = st.px + Math.cos(st.ang + Math.PI / 2) * strafe * 2.6 * dt;
        const ny = st.py + Math.sin(st.ang + Math.PI / 2) * strafe * 2.6 * dt;
        if (!solid(nx, st.py)) st.px = nx;
        if (!solid(st.px, ny)) st.py = ny;
      }
      st.sway += dt * (forward ? 6 : 2);

      const speed = 0.85 + st.wave * 0.12;
      for (const d of st.drones) {
        if (!d.alive) continue;
        d.flash = Math.max(0, d.flash - dt);
        const dx = st.px - d.x;
        const dy = st.py - d.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = d.x + (dx / dist) * speed * dt;
        const ny = d.y + (dy / dist) * speed * dt;
        if (!solid(nx, d.y)) d.x = nx;
        if (!solid(d.x, ny)) d.y = ny;
        if (dist < 0.95) {
          st.hp -= 24 * dt;
          st.hurt = Math.min(0.6, st.hurt + dt * 2.2);
        }
      }

      if (st.hp <= 0) {
        st.hp = 0;
        die();
      }
    }

    /* ------------------------- render ------------------------- */

    function render() {
      const dirX = Math.cos(st.ang);
      const dirY = Math.sin(st.ang);
      const planeX = -dirY * FOV;
      const planeY = dirX * FOV;

      const ceil = ctx.createLinearGradient(0, 0, 0, H / 2);
      ceil.addColorStop(0, '#05070c');
      ceil.addColorStop(1, '#131a27');
      ctx.fillStyle = ceil;
      ctx.fillRect(0, 0, W, H / 2);

      const floor = ctx.createLinearGradient(0, H / 2, 0, H);
      floor.addColorStop(0, '#0f141d');
      floor.addColorStop(1, '#232c3d');
      ctx.fillStyle = floor;
      ctx.fillRect(0, H / 2, W, H / 2);

      for (let x = 0; x < W; x++) {
        const camX = (2 * x) / W - 1;
        const { dist, side, mapX, mapY } = castRay(st.px, st.py, dirX + planeX * camX, dirY + planeY * camX);
        zbuf[x] = dist;
        const lineH = Math.min(H * 2.2, H / dist);
        const top = (H - lineH) / 2;
        const fog = clamp(1 - dist / 16, 0.1, 1);
        const tone = (mapX * 7 + mapY * 13) % 3;
        const r = tone === 0 ? 60 : tone === 1 ? 52 : 68;
        const g = tone === 0 ? 74 : tone === 1 ? 64 : 78;
        const b = tone === 0 ? 104 : tone === 1 ? 92 : 108;
        const k = (side === 1 ? 0.66 : 1) * fog;
        ctx.fillStyle = `rgb(${(r * k) | 0},${(g * k) | 0},${(b * k) | 0})`;
        ctx.fillRect(x, top, 1, lineH);
      }

      // drones as depth-tested billboards
      for (const d of st.drones) {
        if (!d.alive) continue;
        const p = projection(d);
        if (p.tY <= 0.3) continue;
        const size = p.size;
        const hover = Math.sin(st.t * 2.4 + d.phase) * size * 0.05;
        const cy = H / 2 + hover;
        const x0 = Math.max(0, Math.floor(p.screenX - size / 2));
        const x1 = Math.min(W - 1, Math.ceil(p.screenX + size / 2));
        for (let x = x0; x <= x1; x++) {
          if (p.tY >= zbuf[x]) continue;
          const rel = (x - p.screenX) / (size / 2);
          const half = Math.sqrt(Math.max(0, 1 - rel * rel));
          const hh = size * 0.5 * half;
          const lit = d.flash > 0;
          ctx.fillStyle = lit ? '#ffffff' : rel < -0.15 ? '#a8203a' : '#e0384f';
          ctx.fillRect(x, cy - hh, 1, hh * 2);
        }
        if (p.tY < zbuf[Math.max(0, Math.min(W - 1, Math.round(p.screenX)))]) {
          const eyeY = cy - size * 0.12;
          ctx.fillStyle = '#ffe9a8';
          ctx.fillRect(p.screenX - size * 0.16, eyeY, size * 0.3, Math.max(1, size * 0.06));
        }
      }

      // crosshair
      ctx.strokeStyle = 'rgba(124,246,200,.85)';
      ctx.lineWidth = 1.5;
      const cx = W / 2;
      const cyc = H / 2;
      ctx.beginPath();
      ctx.moveTo(cx - 9, cyc);
      ctx.lineTo(cx - 3, cyc);
      ctx.moveTo(cx + 3, cyc);
      ctx.lineTo(cx + 9, cyc);
      ctx.moveTo(cx, cyc - 9);
      ctx.lineTo(cx, cyc - 3);
      ctx.moveTo(cx, cyc + 3);
      ctx.lineTo(cx, cyc + 9);
      ctx.stroke();

      if (st.flash > 0) {
        ctx.fillStyle = `rgba(255,240,180,${st.flash * 3})`;
        ctx.beginPath();
        ctx.arc(cx, H * 0.78, 26, 0, Math.PI * 2);
        ctx.fill();
      }

      if (st.hurt > 0) {
        const vig = ctx.createRadialGradient(cx, cyc, H * 0.2, cx, cyc, H * 0.85);
        vig.addColorStop(0, 'rgba(255,0,60,0)');
        vig.addColorStop(1, `rgba(255,0,60,${st.hurt * 0.7})`);
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);
      }

      if (st.dead) {
        ctx.fillStyle = 'rgba(6,9,15,.82)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = palette.bad;
        ctx.font = '700 22px ui-monospace, monospace';
        ctx.fillText('ARMOUR BREACHED', cx, cyc - 44);
        ctx.fillStyle = palette.ink;
        ctx.font = '800 38px ui-monospace, monospace';
        ctx.fillText(String(score()), cx, cyc + 2);
        ctx.fillStyle = palette.dim;
        ctx.font = '500 13px ui-monospace, monospace';
        ctx.fillText(`Wave ${st.wave} · ${st.kills} drones downed`, cx, cyc + 30);
        ctx.fillStyle = 'rgba(124,246,200,.85)';
        ctx.font = '600 13px ui-monospace, monospace';
        ctx.fillText('Press R to redeploy', cx, cyc + 58);
        ctx.textAlign = 'left';
      }
    }

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
        unSwipe();
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        s.destroy();
        bar.remove();
      },
    };
  },
};

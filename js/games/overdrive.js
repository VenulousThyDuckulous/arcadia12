import { makeStage, startLoop, keys } from '../lib/ui.js';
import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { el, clamp } from '../lib/util.js';

const SEG = 200;
const DRAW = 100;
const ROAD_W = 1800;
const CAM_H = 900;
const FOV = 100;
const CAM_D = 1 / Math.tan((FOV / 2) * Math.PI / 180);
const RUMBLE = 3;

const COLORS = {
  light: { road: '#2b3141', grass: '#111a23', rumble: '#eef2fa' },
  dark: { road: '#262c3a', grass: '#0c1218', rumble: '#d2384f' },
};

const easeIn = (a, b, p) => a + (b - a) * p * p;
const easeInOut = (a, b, p) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);

const segments = [];
const lastY = () => (segments.length ? segments[segments.length - 1].p2.world.y : 0);

function addSegment(curve, y) {
  const n = segments.length;
  segments.push({
    index: n,
    p1: { world: { y: lastY(), z: n * SEG }, camera: {}, screen: {} },
    p2: { world: { y, z: (n + 1) * SEG }, camera: {}, screen: {} },
    curve,
    sprites: [],
    color: Math.floor(n / RUMBLE) % 2 ? COLORS.dark : COLORS.light,
  });
}

function addRoad(enter, hold, leave, curve, hill) {
  const startY = lastY();
  const endY = startY + hill * SEG;
  const total = enter + hold + leave;
  for (let i = 0; i < enter; i++) addSegment(easeIn(0, curve, i / enter), easeInOut(startY, endY, i / total));
  for (let i = 0; i < hold; i++) addSegment(curve, easeInOut(startY, endY, (enter + i) / total));
  for (let i = 0; i < leave; i++) addSegment(easeInOut(curve, 0, i / leave), easeInOut(startY, endY, (enter + hold + i) / total));
}

function buildTrack() {
  segments.length = 0;
  addRoad(20, 40, 20, 0, 0);
  addRoad(20, 30, 20, 2.5, 22);
  addRoad(20, 30, 20, -2.5, -14);
  addRoad(20, 40, 20, 0, 12);
  addRoad(24, 24, 24, 4, -20);
  addRoad(24, 24, 24, -4, 18);
  addRoad(20, 40, 20, 1.6, 0);
  addRoad(20, 30, 20, -1.6, -10);
  addRoad(20, 60, 20, 0, 0);

  // traffic
  for (let i = 30; i < segments.length - 30; i += 26) {
    const offset = (Math.random() * 1.6 - 0.8);
    segments[i].sprites.push({ offset, lane: Math.sign(offset) || 1, speed: 0 });
  }
  // roadside posts
  for (let i = 0; i < segments.length; i += 8) {
    segments[i].sprites.push({ offset: 1.25, post: true });
    segments[i].sprites.push({ offset: -1.25, post: true });
  }
}

buildTrack();
const TRACK_LEN = segments.length * SEG;

function findSegment(z) {
  return segments[Math.floor(z / SEG) % segments.length];
}

function project(p, camX, camY, camZ) {
  p.camera.x = (p.world.x || 0) - camX;
  p.camera.y = (p.world.y || 0) - camY;
  p.camera.z = (p.world.z || 0) - camZ;
  p.screen.scale = CAM_D / Math.max(0.0001, p.camera.z);
  p.screen.x = Math.round(320 + p.screen.scale * p.camera.x * 320);
  p.screen.y = Math.round(200 - p.screen.scale * p.camera.y * 200);
  p.screen.w = Math.round(p.screen.scale * ROAD_W * 320);
}

export default {
  id: 'overdrive',
  title: 'Overdrive',
  tagline: 'A projected 3D road: curves and hills are real geometry, the camera tilts with the hill, and traffic wants your lane.',
  genre: 'Racing',
  tags: ['3d', 'keyboard', 'endless'],
  controls: [
    ['↑ / W', 'Accelerate'],
    ['↓ / S', 'Brake'],
    ['← → / A D', 'Steer'],
    ['R', 'Restart'],
  ],

  mount(stage) {
    const s = makeStage(stage, 640, 400, { label: 'Overdrive road' });
    const { ctx, W, H } = s;

    const speedEl = el('span', { html: 'Speed <b>0</b>' });
    const distEl = el('span', { html: 'Distance <b>0 m</b>' });
    const bestEl = el('span', { html: `Best <b>${getBest('overdrive')}</b>` });
    const bar = el('div', { class: 'hud' }, [
      el('div', { class: 'hud-group' }, [speedEl, distEl]),
      el('div', { class: 'hud-group' }, [bestEl]),
    ]);
    stage.insertBefore(bar, s.wrap);

    const maxSpeed = SEG / (1 / 60);
    const accel = maxSpeed / 5;
    const braking = -maxSpeed;
    const decel = -maxSpeed / 5;
    const offRoadDecel = -maxSpeed / 2;
    const offRoadLimit = maxSpeed / 4;

    const st = {
      position: 0,
      speed: 0,
      playerX: 0,
      distance: 0,
      shake: 0,
      crashFlash: 0,
      time: 0,
      over: false,
    };

    function reset() {
      st.position = 0;
      st.speed = 0;
      st.playerX = 0;
      st.distance = 0;
      st.shake = 0;
      st.crashFlash = 0;
      st.over = false;
      paintHud();
    }

    function paintHud() {
      speedEl.innerHTML = `Speed <b>${Math.round(st.speed / 110)}</b>`;
      distEl.innerHTML = `Distance <b>${Math.round(st.distance / 10).toLocaleString('en-US')} m</b>`;
      const best = Math.max(getBest('overdrive'), Math.round(st.distance / 10));
      bestEl.innerHTML = `Best <b>${best.toLocaleString('en-US')}</b>`;
    }

    function update(dt) {
      st.time += dt;
      st.shake = Math.max(0, st.shake - dt * 3);
      st.crashFlash = Math.max(0, st.crashFlash - dt * 2);
      if (st.over) return;

      const speedPercent = st.speed / maxSpeed;
      const base = findSegment(st.position);

      st.position += st.speed * dt;
      st.distance += st.speed * dt;

      // steering
      const steer = (kb.isDown('ArrowLeft', 'a', 'A') ? -1 : 0) + (kb.isDown('ArrowRight', 'd', 'D') ? 1 : 0);
      st.playerX += steer * dt * 2.1 * Math.max(0.25, speedPercent);

      // centrifugal drift
      st.playerX -= dt * speedPercent * base.curve * 0.34;

      // throttle
      if (kb.isDown('ArrowUp', 'w', 'W')) {
        st.speed += accel * dt;
      } else if (kb.isDown('ArrowDown', 's', 'S')) {
        st.speed += braking * dt;
      } else {
        st.speed += decel * dt;
      }

      if (st.playerX < -1 || st.playerX > 1) {
        st.speed += offRoadDecel * dt;
        st.shake = Math.max(st.shake, 0.35 * speedPercent);
      }

      if (st.speed > maxSpeed) st.speed = maxSpeed;
      if (st.speed < 0) st.speed = 0;
      if (st.speed < offRoadLimit && (st.playerX < -1 || st.playerX > 1)) st.speed = offRoadLimit;
      st.playerX = clamp(st.playerX, -2.2, 2.2);

      // traffic collisions
      for (let n = 0; n < 3; n++) {
        const seg = segments[(findSegment(st.position).index + n) % segments.length];
        for (const sp of seg.sprites) {
          if (sp.post) continue;
          if (Math.abs(st.playerX - sp.offset) < 0.32) {
            st.speed = maxSpeed * 0.22;
            st.playerX += (st.playerX > sp.offset ? 1 : -1) * 0.22;
            st.shake = 1;
            st.crashFlash = 1;
            sound.bad();
          }
        }
      }

      if (st.position >= TRACK_LEN) {
        st.position -= TRACK_LEN;
      }
      paintHud();
    }

    function polygon(x1, y1, x2, y2, x3, y3, x4, y4, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.lineTo(x4, y4);
      ctx.closePath();
      ctx.fill();
    }

    function drawSegment(seg) {
      const p1 = seg.p1.screen;
      const p2 = seg.p2.screen;
      const c = seg.color;
      ctx.fillStyle = c.grass;
      ctx.fillRect(0, p2.y, W, p1.y - p2.y + 1);
      polygon(p1.x - p1.w * 1.18, p1.y, p1.x + p1.w * 1.18, p1.y, p2.x + p2.w * 1.18, p2.y, p2.x - p2.w * 1.18, p2.y, c.rumble);
      polygon(p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, c.road);
      if (Math.floor(seg.index / RUMBLE) % 2) {
        const lw1 = p1.w * 0.02;
        const lw2 = p2.w * 0.02;
        polygon(p1.x - lw1, p1.y, p1.x + lw1, p1.y, p2.x + lw2, p2.y, p2.x - lw2, p2.y, 'rgba(230,236,248,.55)');
        const dw1 = p1.w * 0.55;
        const dw2 = p2.w * 0.55;
        polygon(p1.x - dw1, p1.y, p1.x - dw1 + p1.w * 0.03, p1.y, p2.x - dw2 + p2.w * 0.03, p2.y, p2.x - dw2, p2.y, 'rgba(230,236,248,.28)');
        polygon(p1.x + dw1, p1.y, p1.x + dw1 - p1.w * 0.03, p1.y, p2.x + dw2 - p2.w * 0.03, p2.y, p2.x + dw2, p2.y, 'rgba(230,236,248,.28)');
      }
    }

    function drawSprite(seg, sp) {
      const p = seg.p1.screen;
      if (!p.scale) return;
      const sw = (p.scale * ROAD_W * 320) * 0.34;
      const x = 320 + p.scale * sp.offset * ROAD_W * 320 * 0.5;
      const y = p.y;
      if (sp.post) {
        ctx.fillStyle = '#7cf6c8';
        ctx.fillRect(x - sw * 0.06, y - sw * 0.9, Math.max(1, sw * 0.12), sw * 0.9);
        return;
      }
      const h = sw * 0.62;
      ctx.fillStyle = '#22304a';
      ctx.fillRect(x - sw / 2, y - h, sw, h);
      ctx.fillStyle = '#7aa2ff';
      ctx.fillRect(x - sw / 2, y - h, sw, Math.max(1, h * 0.22));
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(x - sw * 0.34, y - h * 0.72, sw * 0.24, Math.max(1, h * 0.2));
      ctx.fillRect(x + sw * 0.1, y - h * 0.72, sw * 0.24, Math.max(1, h * 0.2));
    }

    function drawPlayer() {
      const cx = W / 2 + st.playerX * 26;
      const cy = H - 52;
      const bounce = Math.sin(st.time * 22) * (st.speed / maxSpeed) * 1.6;
      ctx.save();
      ctx.translate(cx, cy + bounce);
      ctx.rotate(clamp(st.playerX, -1, 1) * -0.06);
      const w = 66;
      const h = 34;
      ctx.fillStyle = '#0d1420';
      ctx.beginPath();
      ctx.moveTo(-w / 2, h * 0.6);
      ctx.lineTo(-w / 2 + 8, -h * 0.4);
      ctx.lineTo(w / 2 - 8, -h * 0.4);
      ctx.lineTo(w / 2, h * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7cf6c8';
      ctx.fillRect(-w / 2 + 12, -h * 0.34, w - 24, h * 0.16);
      ctx.fillStyle = '#e0384f';
      ctx.fillRect(-w / 2 + 10, h * 0.42, 12, h * 0.2);
      ctx.fillRect(w / 2 - 22, h * 0.42, 12, h * 0.2);
      ctx.restore();
    }

    function render() {
      const base = findSegment(st.position);
      const basePercent = (st.position % SEG) / SEG;
      const playerSeg = findSegment(st.position + 900);
      const playerPercent = ((st.position + 900) % SEG) / SEG;
      const playerY = playerSeg.p1.world.y + (playerSeg.p2.world.y - playerSeg.p1.world.y) * playerPercent;

      ctx.fillStyle = '#0a1018';
      ctx.fillRect(0, 0, W, H);
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.5);
      sky.addColorStop(0, '#080d16');
      sky.addColorStop(1, '#1d2a3d');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H * 0.5);

      ctx.save();
      const shake = st.shake * 6;
      if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

      let maxY = H;
      let x = 0;
      let dx = -(base.curve * basePercent);

      for (let n = 0; n < DRAW; n++) {
        const seg = segments[(base.index + n) % segments.length];
        const looped = seg.index < base.index;
        project(seg.p1, st.playerX * ROAD_W - x, playerY + CAM_H, st.position - (looped ? TRACK_LEN : 0));
        project(seg.p2, st.playerX * ROAD_W - x - dx, playerY + CAM_H, st.position - (looped ? TRACK_LEN : 0));
        x += dx;
        dx += seg.curve;

        if (seg.p1.camera.z <= CAM_D || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxY) continue;
        drawSegment(seg);
        for (const sp of seg.sprites) drawSprite(seg, sp);
        maxY = seg.p2.screen.y;
      }
      ctx.restore();

      drawPlayer();

      if (st.crashFlash > 0) {
        ctx.fillStyle = `rgba(255,60,90,${st.crashFlash * 0.28})`;
        ctx.fillRect(0, 0, W, H);
      }

      if (st.speed < 40 && st.distance < 10) {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(233,237,247,.9)';
        ctx.font = '700 20px ui-monospace, monospace';
        ctx.fillText('HOLD ↑ TO LAUNCH', W / 2, H / 2 - 40);
        ctx.textAlign = 'left';
      }
    }

    const kb = keys();
    const unPress = kb.press((key) => {
      if (key === 'r' || key === 'R') reset();
    });

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
        s.destroy();
        bar.remove();
      },
    };
  },
};

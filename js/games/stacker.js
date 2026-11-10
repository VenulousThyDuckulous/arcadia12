import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { el, clamp } from '../lib/util.js';

const BASE_W = 1;
const MAX_TRAVEL = 1.05;

export default {
  id: 'stacker',
  title: 'Sky Stacker',
  tagline: 'Real CSS 3D transforms: blocks rotate in perspective space, and every drop trims the overhang off the tower.',
  genre: 'Arcade',
  tags: ['3d', 'timing', 'one button'],
  controls: [
    ['Click / Space', 'Drop the block'],
    ['R', 'Restart'],
  ],

  mount(stage) {
    const wrap = el('div', { class: 'stk-wrap' });

    const scoreEl = el('span', { html: 'Height <b>0</b>' });
    const bestEl = el('span', { html: `Best <b>${getBest('stacker')}</b>` });
    const comboEl = el('span', { text: '' });
    const bar = el('div', { class: 'hud', style: 'max-width:520px' }, [
      el('div', { class: 'hud-group' }, [scoreEl, bestEl]),
      el('div', { class: 'hud-group' }, [comboEl]),
    ]);

    const scene = el('div', { class: 'stk-scene' });
    const world = el('div', { class: 'stk-world' });
    scene.append(world);
    const hint = el('p', { class: 'lede', style: 'font-size:13px;text-align:center;margin:0', text: 'Tap when the slab lines up. Overhang gets sliced off.' });
    wrap.append(bar, scene, hint);
    stage.append(wrap);

    const st = {
      blocks: [],
      moving: null,
      height: 0,
      dir: 1,
      speed: 0.62,
      spin: 0,
      spinRate: 0.1,
      over: false,
      perfect: 0,
      raf: 0,
      last: 0,
      px: 0,
    };

    const THICK = 26;

    function blockEl(b) {
      return el('div', {
        class: 'stk-block' + (b.perfect ? ' perfect' : ''),
        style: `width:${b.w * 230}px;height:${b.w * 230}px;transform:translate3d(${b.x * 230}px,0,${b.z}px) translate(-50%,-50%)`,
      });
    }

    function syncWorld() {
      const lift = Math.min(190, Math.max(0, st.height - 4) * 15);
      world.style.transform = `translateY(${lift}px) rotateX(-56deg) rotateZ(${st.spin}deg)`;
    }

    function reset() {
      world.innerHTML = '';
      st.blocks = [];
      st.height = 0;
      st.over = false;
      st.perfect = 0;
      st.speed = 0.62;
      st.spin = 0;
      st.spinRate = 0.1;
      comboEl.textContent = '';
      const base = { x: 0, z: -THICK / 2, w: BASE_W };
      st.blocks.push(base);
      world.append(blockEl(base));
      spawnMoving();
      paintHud();
      hint.textContent = 'Tap when the slab lines up. Overhang gets sliced off.';
    }

    function spawnMoving() {
      const top = st.blocks[st.blocks.length - 1];
      st.px = -MAX_TRAVEL;
      st.dir = 1;
      st.moving = { x: st.px, z: st.height * THICK + THICK / 2, w: top.w };
      const node = blockEl(st.moving);
      node.classList.add('live');
      world.append(node);
      st.moving.node = node;
    }

    function drop() {
      if (st.over || !st.moving) return;
      const top = st.blocks[st.blocks.length - 1];
      const m = st.moving;
      const left = Math.max(m.x - m.w / 2, top.x - top.w / 2);
      const right = Math.min(m.x + m.w / 2, top.x + top.w / 2);
      const width = right - left;

      if (width <= 0.02) {
        // complete miss: the slab tumbles away
        m.node.classList.add('missed');
        st.moving = null;
        st.over = true;
        const record = submitScore('stacker', st.height);
        paintHud(record);
        hint.innerHTML = `<strong style="color:#ff8ca1">Missed.</strong> Height ${st.height}. Click or press R to rebuild.`;
        sound.bad();
        return;
      }

      const perfect = Math.abs(m.x - top.x) < 0.035;
      const centre = (left + right) / 2;
      const grown = perfect ? Math.min(BASE_W, m.w + 0.045) : width;

      const landed = {
        x: perfect ? top.x : centre,
        z: st.height * THICK + THICK / 2,
        w: grown,
        perfect,
      };
      m.node.classList.remove('live');
      m.node.setAttribute(
        'style',
        `width:${landed.w * 230}px;height:${landed.w * 230}px;transform:translate3d(${landed.x * 230}px,0,${landed.z}px) translate(-50%,-50%)`,
      );
      if (perfect) m.node.classList.add('perfect');
      st.blocks.push(landed);
      st.height += 1;
      st.moving = null;

      if (perfect) {
        st.perfect += 1;
        comboEl.innerHTML = `<span style="color:#7cf6c8">Perfect ×${st.perfect}</span>`;
        sound.tone(880, 0.08, 'triangle', 0.05);
      } else {
        st.perfect = 0;
        comboEl.textContent = '';
        sound.tone(360 + st.height * 12, 0.06, 'square', 0.04);
      }

      st.speed = Math.min(1.55, 0.62 + st.height * 0.045);
      st.spinRate = 0.1 + st.height * 0.006;
      paintHud();
      spawnMoving();
      sound.click();
    }

    function paintHud(record = false) {
      scoreEl.innerHTML = `Height <b>${st.height}</b>`;
      const best = record ? Math.max(st.height, getBest('stacker')) : Math.max(getBest('stacker'), st.height);
      bestEl.innerHTML = `Best <b>${best}</b>`;
    }

    function tick(now) {
      st.raf = requestAnimationFrame(tick);
      const dt = Math.min((now - (st.last || now)) / 1000, 0.05);
      st.last = now;

      if (!st.over) {
        st.spin += st.spinRate * dt;
        syncWorld();
      }

      if (st.moving && !st.over) {
        st.px += st.dir * st.speed * dt * 1.4;
        if (st.px > MAX_TRAVEL) {
          st.px = MAX_TRAVEL;
          st.dir = -1;
        } else if (st.px < -MAX_TRAVEL) {
          st.px = -MAX_TRAVEL;
          st.dir = 1;
        }
        st.moving.x = st.px;
        st.moving.node.style.transform =
          `translate3d(${st.moving.x * 230}px,0,${st.moving.z}px) translate(-50%,-50%)`;
      }
    }

    const onKey = (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (st.over) reset();
        else drop();
      } else if (e.key === 'r' || e.key === 'R') {
        reset();
      }
    };
    window.addEventListener('keydown', onKey);

    const onTap = () => {
      if (st.over) reset();
      else drop();
    };
    scene.addEventListener('pointerdown', onTap);

    reset();
    syncWorld();
    st.raf = requestAnimationFrame(tick);

    return {
      restart() {
        reset();
      },
      destroy() {
        cancelAnimationFrame(st.raf);
        window.removeEventListener('keydown', onKey);
        scene.removeEventListener('pointerdown', onTap);
        wrap.remove();
      },
    };
  },
};

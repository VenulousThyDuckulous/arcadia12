import { makeStage, startLoop } from '../lib/ui.js';
import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { el, clamp } from '../lib/util.js';

const CELL = 40;
const COLS = 16;
const ROWS = 10;
const W = COLS * CELL;
const H = ROWS * CELL;

const WAYPOINTS = [
  [-1, 1], [12, 1], [12, 4], [3, 4], [3, 7], [13, 7], [13, 9], [16, 9],
];

const TOWERS = {
  gun: { label: 'Gun', cost: 60, range: 118, dmg: 16, rate: 0.55, color: '#7cf6c8', kind: 'bullet' },
  frost: { label: 'Frost', cost: 85, range: 104, dmg: 7, rate: 0.9, color: '#7aa2ff', kind: 'frost' },
  mortar: { label: 'Mortar', cost: 120, range: 168, dmg: 26, rate: 1.5, color: '#ffb545', kind: 'shell' },
};

function buildPath() {
  const set = new Set();
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const [x0, y0] = WAYPOINTS[i];
    const [x1, y1] = WAYPOINTS[i + 1];
    let x = x0;
    let y = y0;
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    let guard = 0;
    while ((x !== x1 || y !== y1) && guard++ < 400) {
      if (x >= 0 && y >= 0 && x < COLS && y < ROWS) set.add(y * COLS + x);
      if (x !== x1) x += dx;
      else y += dy;
    }
    if (x1 >= 0 && y1 >= 0 && x1 < COLS && y1 < ROWS) set.add(y1 * COLS + x1);
  }
  return set;
}

const PATH = buildPath();
const pathPixels = WAYPOINTS.map(([x, y]) => ({ x: x * CELL + CELL / 2, y: y * CELL + CELL / 2 }));

export default {
  id: 'towerdef',
  title: 'Hold the Line',
  tagline: 'Tower defence with three tower archetypes, real pathing, splash shells and a frost aura that stacks into a kill corridor.',
  genre: 'Strategy',
  tags: ['mouse', 'waves', 'build'],
  controls: [
    ['Pick a tower', 'Then click a slot'],
    ['Click a tower', 'Upgrade it'],
    ['R', 'Restart'],
  ],

  mount(stage) {
    const s = makeStage(stage, W, H, { label: 'Tower defence field' });
    const { ctx, canvas } = s;

    const waveEl = el('span', { html: 'Wave <b>1</b>' });
    const livesEl = el('span', { html: 'Core <b>20</b>' });
    const cashEl = el('span', { html: 'Cash <b>150</b>' });
    const bestEl = el('span', { html: `Best <b>${getBest('towerdef')}</b>` });
    const bar = el('div', { class: 'hud' }, [
      el('div', { class: 'hud-group' }, [waveEl, livesEl, cashEl]),
      el('div', { class: 'hud-group' }, [bestEl]),
    ]);

    const picker = el('div', { class: 'filters', style: 'justify-content:center;margin:0' });
    const msg = el('p', { class: 'lede', style: 'font-size:13px;text-align:center;margin:0', text: 'Pick a tower, then click a dark slot. Towers fire on their own.' });

    stage.insertBefore(bar, s.wrap);
    s.wrap.insertAdjacentElement('afterend', picker);
    picker.insertAdjacentElement('afterend', msg);

    let selectedType = 'gun';
    const buttons = Object.entries(TOWERS).map(([key, def]) => {
      const btn = el('button', {
        class: 'filter', type: 'button', text: `${def.label} ${def.cost}`,
        'aria-pressed': String(key === selectedType),
        onclick: () => {
          selectedType = key;
          buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === key)));
          sound.click();
        },
      });
      btn.dataset.key = key;
      return btn;
    });
    picker.append(...buttons);

    const st = {
      towers: [],
      enemies: [],
      shots: [],
      rings: [],
      lives: 20,
      cash: 150,
      wave: 1,
      score: 0,
      spawnLeft: 0,
      spawnTimer: 0,
      spawnGap: 0.8,
      waveBreak: 1.2,
      over: false,
      time: 0,
    };

    function reset() {
      st.towers = [];
      st.enemies = [];
      st.shots = [];
      st.rings = [];
      st.lives = 20;
      st.cash = 150;
      st.wave = 1;
      st.score = 0;
      st.spawnLeft = 6;
      st.spawnTimer = 0;
      st.spawnGap = 0.8;
      st.waveBreak = 1.4;
      st.over = false;
      st.time = 0;
      msg.textContent = 'Pick a tower, then click a dark slot. Towers fire on their own.';
      paintHud();
    }

    function paintHud(record = false) {
      waveEl.innerHTML = `Wave <b>${st.wave}</b>`;
      livesEl.innerHTML = `Core <b>${st.lives}</b>`;
      cashEl.innerHTML = `Cash <b>${Math.floor(st.cash)}</b>`;
      const best = record ? Math.max(st.score, getBest('towerdef')) : Math.max(getBest('towerdef'), st.score);
      bestEl.innerHTML = `Best <b>${best.toLocaleString('en-US')}</b>`;
    }

    function spawnEnemy() {
      const hp = 46 + st.wave * 22;
      st.enemies.push({
        x: pathPixels[0].x,
        y: pathPixels[0].y,
        node: 1,
        hp,
        maxHp: hp,
        speed: 40 + st.wave * 2.2,
        slow: 0,
        alive: true,
        reward: 10 + st.wave * 2,
      });
    }

    function damage(enemy, amount) {
      enemy.hp -= amount;
      if (enemy.hp <= 0 && enemy.alive) {
        enemy.alive = false;
        st.cash += enemy.reward;
        st.score += enemy.reward;
        paintHud();
        sound.tone(520 + Math.random() * 60, 0.05, 'square', 0.03);
      }
    }

    function update(dt) {
      st.time += dt;
      if (st.over) return;

      // waves
      if (st.spawnLeft > 0) {
        st.spawnTimer -= dt;
        if (st.spawnTimer <= 0) {
          spawnEnemy();
          st.spawnLeft -= 1;
          st.spawnTimer = st.spawnGap;
        }
      } else if (!st.enemies.length) {
        st.waveBreak -= dt;
        if (st.waveBreak <= 0) {
          st.wave += 1;
          st.spawnLeft = 5 + st.wave * 2;
          st.spawnGap = Math.max(0.32, 0.85 - st.wave * 0.04);
          st.waveBreak = 1.2;
          st.cash += 26 + st.wave * 4;
          sound.good();
          paintHud();
        }
      }

      // enemies
      for (const e of st.enemies) {
        if (!e.alive) continue;
        e.slow = Math.max(0, e.slow - dt);
        const target = pathPixels[e.node];
        if (!target) {
          e.alive = false;
          st.lives -= 1;
          paintHud();
          sound.bad();
          if (st.lives <= 0) {
            st.over = true;
            const record = submitScore('towerdef', st.score);
            paintHud(record);
            msg.innerHTML = `<strong style="color:#ff8ca1">The core fell on wave ${st.wave}.</strong> Score ${st.score}. Press R to rebuild.`;
            sound.bad();
          }
          continue;
        }
        const dx = target.x - e.x;
        const dy = target.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const speed = e.speed * (e.slow > 0 ? 0.45 : 1);
        if (d < 4) {
          e.node += 1;
        } else {
          e.x += (dx / d) * speed * dt;
          e.y += (dy / d) * speed * dt;
        }
      }
      st.enemies = st.enemies.filter((e) => e.alive);

      // towers
      for (const t of st.towers) {
        t.cd -= dt;
        if (t.cd > 0) continue;
        const def = TOWERS[t.type];
        const range = def.range * (1 + (t.level - 1) * 0.08);
        let target = null;
        let bestD = Infinity;
        for (const e of st.enemies) {
          const d = Math.hypot(e.x - t.x, e.y - t.y);
          if (d < range && d < bestD) {
            bestD = d;
            target = e;
          }
        }
        if (!target) continue;
        t.cd = def.rate * Math.pow(0.88, t.level - 1);
        const dmg = def.dmg * Math.pow(1.3, t.level - 1);
        if (def.kind === 'frost') {
          st.rings.push({ x: t.x, y: t.y, r: 0, max: range, life: 1 });
          for (const e of st.enemies) {
            if (Math.hypot(e.x - t.x, e.y - t.y) < range) {
              e.slow = 1.3;
              damage(e, dmg * 0.5);
            }
          }
          sound.tone(300, 0.1, 'sine', 0.03);
        } else {
          st.shots.push({
            x: t.x, y: t.y, tx: target.x, ty: target.y,
            speed: def.kind === 'shell' ? 190 : 420,
            dmg, splash: def.kind === 'shell' ? 46 : 0,
            color: def.kind === 'shell' ? '#ffb545' : '#7cf6c8',
            target,
          });
        }
        sound.tone(def.kind === 'shell' ? 220 : 620, 0.05, 'square', 0.025);
      }

      // projectiles
      for (const sh of st.shots) {
        if (sh.target && sh.target.alive) {
          sh.tx = sh.target.x;
          sh.ty = sh.target.y;
        }
        const dx = sh.tx - sh.x;
        const dy = sh.ty - sh.y;
        const d = Math.hypot(dx, dy) || 1;
        const step = sh.speed * dt;
        if (d <= step + 2) {
          if (sh.splash) {
            st.rings.push({ x: sh.tx, y: sh.ty, r: 0, max: sh.splash, life: 1, color: '#ffb545' });
            for (const e of st.enemies) {
              if (Math.hypot(e.x - sh.tx, e.y - sh.ty) < sh.splash) damage(e, sh.dmg);
            }
          } else if (sh.target && sh.target.alive) {
            damage(sh.target, sh.dmg);
          }
          sh.done = true;
        } else {
          sh.x += (dx / d) * step;
          sh.y += (dy / d) * step;
        }
      }
      st.shots = st.shots.filter((sh) => !sh.done);

      for (const r of st.rings) {
        r.r += (r.max - r.r) * dt * 8;
        r.life -= dt * 1.6;
      }
      st.rings = st.rings.filter((r) => r.life > 0);
    }

    function render() {
      ctx.fillStyle = '#0a0f18';
      ctx.fillRect(0, 0, W, H);

      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const i = y * COLS + x;
          const px = x * CELL;
          const py = y * CELL;
          if (PATH.has(i)) {
            ctx.fillStyle = '#1a2233';
            ctx.fillRect(px, py, CELL, CELL);
            ctx.strokeStyle = 'rgba(122,162,255,.12)';
            ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
          } else {
            ctx.fillStyle = '#0d131d';
            ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
            ctx.fillStyle = 'rgba(255,255,255,.02)';
            ctx.fillRect(px + 3, py + 3, CELL - 6, CELL - 6);
          }
        }
      }

      // core + entry markers
      const last = pathPixels[pathPixels.length - 2];
      ctx.fillStyle = '#7cf6c8';
      ctx.globalAlpha = 0.5 + Math.sin(st.time * 3) * 0.15;
      ctx.fillRect(last.x - 16, last.y - 16, 32, 32);
      ctx.globalAlpha = 1;

      for (const r of st.rings) {
        ctx.strokeStyle = r.color || '#7aa2ff';
        ctx.globalAlpha = clamp(r.life, 0, 1) * 0.7;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      for (const t of st.towers) {
        const def = TOWERS[t.type];
        ctx.fillStyle = '#1b2434';
        ctx.fillRect(t.x - 15, t.y - 15, 30, 30);
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 8 + t.level * 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a0f18';
        ctx.beginPath();
        ctx.arc(t.x, t.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const e of st.enemies) {
        const frac = clamp(e.hp / e.maxHp, 0, 1);
        ctx.fillStyle = e.slow > 0 ? '#7aa2ff' : '#ff5c7a';
        ctx.beginPath();
        ctx.arc(e.x, e.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillRect(e.x - 10, e.y - 15, 20, 3);
        ctx.fillStyle = frac > 0.5 ? '#7cf6c8' : frac > 0.22 ? '#ffb545' : '#ff5c7a';
        ctx.fillRect(e.x - 10, e.y - 15, 20 * frac, 3);
      }

      for (const sh of st.shots) {
        ctx.fillStyle = sh.color;
        ctx.fillRect(sh.x - 2, sh.y - 2, 4, 4);
      }

      if (st.over) {
        ctx.fillStyle = 'rgba(6,9,15,.75)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff5c7a';
        ctx.font = '700 22px ui-monospace, monospace';
        ctx.fillText('CORE LOST', W / 2, H / 2 - 20);
        ctx.fillStyle = '#e9edf7';
        ctx.font = '600 14px ui-monospace, monospace';
        ctx.fillText(`Wave ${st.wave} · score ${st.score}`, W / 2, H / 2 + 8);
        ctx.textAlign = 'left';
      }
    }

    function cellAt(evt) {
      const p = s.toLocal(evt);
      const x = Math.floor(p.x / CELL);
      const y = Math.floor(p.y / CELL);
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return -1;
      return y * COLS + x;
    }

    const onDown = (evt) => {
      if (st.over) return;
      const cell = cellAt(evt);
      if (cell < 0) return;
      const x = (cell % COLS) * CELL + CELL / 2;
      const y = Math.floor(cell / COLS) * CELL + CELL / 2;

      const existing = st.towers.find((t) => Math.hypot(t.x - x, t.y - y) < 14);
      if (existing) {
        if (existing.level >= 3) {
          msg.textContent = 'That tower is fully upgraded (level 3).';
          return;
        }
        const def = TOWERS[existing.type];
        const cost = Math.round(def.cost * 0.8 * existing.level);
        if (st.cash < cost) {
          msg.textContent = `Need ${cost} cash to upgrade.`;
          sound.bad();
          return;
        }
        st.cash -= cost;
        existing.level += 1;
        paintHud();
        sound.good();
        msg.textContent = `${def.label} upgraded to level ${existing.level}.`;
        return;
      }

      if (PATH.has(cell)) {
        msg.textContent = 'That is the track — enemies walk there.';
        return;
      }
      const def = TOWERS[selectedType];
      if (st.cash < def.cost) {
        msg.textContent = `Need ${def.cost} cash for a ${def.label}.`;
        sound.bad();
        return;
      }
      st.cash -= def.cost;
      st.towers.push({ x, y, type: selectedType, level: 1, cd: 0 });
      paintHud();
      sound.tone(600, 0.08, 'triangle', 0.04);
      msg.textContent = `${def.label} online. Click it again to upgrade.`;
    };
    canvas.addEventListener('pointerdown', onDown);

    const onKey = (e) => {
      if (e.key === 'r' || e.key === 'R') reset();
    };
    window.addEventListener('keydown', onKey);

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
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('keydown', onKey);
        s.destroy();
        bar.remove();
        picker.remove();
        msg.remove();
      },
    };
  },
};

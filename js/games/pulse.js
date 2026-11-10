import { makeStage, startLoop } from '../lib/ui.js';
import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { el, clamp } from '../lib/util.js';

const LANES = 4;
const W = 560;
const H = 400;
const LANE_W = W / LANES;
const HIT_Y = H - 64;
const SPEED = 330;
const BPM = 126;
const BEAT = 60 / BPM;
const BARS = 24;

const KEYS = ['d', 'f', 'j', 'k'];
const COLORS = ['#7cf6c8', '#7aa2ff', '#ffb545', '#c79bff'];

function buildChart() {
  const notes = [];
  const beats = BARS * 4;
  for (let i = 0; i < beats; i++) {
    const t = i * BEAT + 1.2;
    if (i < 4) continue;
    const density = i % 8 === 0 ? 1 : 0.72;
    if (Math.random() < density) {
      notes.push({ time: t, lane: Math.floor(Math.random() * LANES) });
    }
    if (Math.random() < 0.34) {
      notes.push({ time: t + BEAT / 2, lane: Math.floor(Math.random() * LANES) });
    }
  }
  notes.sort((a, b) => a.time - b.time);
  return { notes, duration: beats * BEAT + 2.2 };
}

export default {
  id: 'pulse',
  title: 'Pulse',
  tagline: 'A rhythm game with real timing windows: four lanes, a generated chart and a combo multiplier that punishes late fingers.',
  genre: 'Rhythm',
  tags: ['keyboard', 'timing', 'combos'],
  controls: [
    ['D F J K', 'Hit lanes 1–4'],
    ['Click lane', 'Hit on touch'],
    ['R', 'Restart'],
  ],

  mount(stage) {
    const s = makeStage(stage, W, H, { label: 'Pulse rhythm lanes' });
    const { ctx } = s;

    const scoreEl = el('span', { html: 'Score <b>0</b>' });
    const comboEl = el('span', { html: 'Combo <b>0</b>' });
    const accEl = el('span', { html: 'Accuracy <b>100%</b>' });
    const bestEl = el('span', { html: `Best <b>${getBest('pulse')}</b>` });
    const bar = el('div', { class: 'hud' }, [
      el('div', { class: 'hud-group' }, [scoreEl, comboEl, accEl]),
      el('div', { class: 'hud-group' }, [bestEl]),
    ]);
    stage.insertBefore(bar, s.wrap);

    const st = {
      chart: buildChart(),
      score: 0,
      combo: 0,
      hits: 0,
      total: 0,
      time: 0,
      started: false,
      over: false,
      judgments: [],
      flash: [0, 0, 0, 0],
      lanePulse: [0, 0, 0, 0],
      nextBeat: 0,
    };

    function reset() {
      st.chart = buildChart();
      st.score = 0;
      st.combo = 0;
      st.hits = 0;
      st.total = 0;
      st.time = 0;
      st.started = false;
      st.over = false;
      st.judgments = [];
      st.flash = [0, 0, 0, 0];
      st.lanePulse = [0, 0, 0, 0];
      st.nextBeat = 0;
      for (const n of st.chart.notes) n.done = false;
      paintHud();
    }

    function paintHud(record = false) {
      scoreEl.innerHTML = `Score <b>${st.score.toLocaleString('en-US')}</b>`;
      comboEl.innerHTML = `Combo <b>${st.combo}</b>`;
      const acc = st.total ? Math.round((st.hits / st.total) * 100) : 100;
      accEl.innerHTML = `Accuracy <b>${acc}%</b>`;
      const best = record ? Math.max(st.score, getBest('pulse')) : Math.max(getBest('pulse'), st.score);
      bestEl.innerHTML = `Best <b>${best.toLocaleString('en-US')}</b>`;
    }

    function judge(text, color) {
      st.judgments.push({ text, color, life: 0.7 });
    }

    function hit(lane) {
      if (st.over) return;
      st.started = true;
      st.lanePulse[lane] = 1;
      const now = st.time;
      let target = null;
      let bestDelta = Infinity;
      for (const n of st.chart.notes) {
        if (n.done || n.lane !== lane) continue;
        const d = Math.abs(n.time - now);
        if (d < bestDelta && d < 0.17) {
          bestDelta = d;
          target = n;
        }
      }
      st.total += 1;
      if (!target) {
        st.combo = 0;
        judge('MISS', '#ff5c7a');
        sound.bad();
        paintHud();
        return;
      }
      target.done = true;
      const perfect = bestDelta <= 0.055;
      st.hits += 1;
      st.combo += 1;
      const mult = 1 + Math.min(3, Math.floor(st.combo / 10));
      st.score += (perfect ? 100 : 55) * mult;
      st.flash[lane] = 1;
      judge(perfect ? 'PERFECT' : 'GOOD', perfect ? '#7cf6c8' : '#7aa2ff');
      sound.tone(420 + lane * 120 + (perfect ? 120 : 0), 0.05, 'triangle', 0.04);
      paintHud();
    }

    function update(dt) {
      for (let i = 0; i < LANES; i++) {
        st.flash[i] = Math.max(0, st.flash[i] - dt * 5);
        st.lanePulse[i] = Math.max(0, st.lanePulse[i] - dt * 3);
      }
      for (const j of st.judgments) j.life -= dt;
      st.judgments = st.judgments.filter((j) => j.life > 0);
      if (st.over) return;

      if (st.started) st.time += dt;

      // metronome
      if (st.time >= st.nextBeat) {
        st.nextBeat += BEAT;
        if (st.started) sound.tone(1200, 0.02, 'square', 0.014);
      }

      for (const n of st.chart.notes) {
        if (!n.done && n.time < st.time - 0.17) {
          n.done = true;
          st.combo = 0;
          st.total += 1;
          judge('MISS', '#ff5c7a');
          paintHud();
        }
      }

      if (st.time > st.chart.duration) {
        st.over = true;
        const record = submitScore('pulse', st.score);
        paintHud(record);
        sound.win();
      }
    }

    function render() {
      ctx.fillStyle = '#080b12';
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < LANES; i++) {
        const x = i * LANE_W;
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.02)' : 'rgba(255,255,255,.035)';
        ctx.fillRect(x, 0, LANE_W, H);
        if (st.lanePulse[i] > 0) {
          ctx.fillStyle = COLORS[i];
          ctx.globalAlpha = st.lanePulse[i] * 0.16;
          ctx.fillRect(x, 0, LANE_W, H);
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = 'rgba(255,255,255,.06)';
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, H);
        ctx.stroke();
      }

      // beat guide lines
      const beatOffset = (st.time % BEAT) / BEAT;
      for (let k = 0; k < 8; k++) {
        const y = HIT_Y - (k - beatOffset) * BEAT * SPEED;
        if (y < 0) continue;
        ctx.strokeStyle = 'rgba(124,246,200,.07)';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(124,246,200,.9)';
      ctx.fillRect(0, HIT_Y - 2, W, 3);

      for (const n of st.chart.notes) {
        if (n.done) continue;
        const y = HIT_Y - (n.time - st.time) * SPEED;
        if (y < -30 || y > H + 30) continue;
        const x = n.lane * LANE_W;
        ctx.fillStyle = COLORS[n.lane];
        ctx.fillRect(x + 14, y - 9, LANE_W - 28, 18);
        ctx.fillStyle = 'rgba(8,11,18,.35)';
        ctx.fillRect(x + 14, y - 9, LANE_W - 28, 4);
      }

      for (let i = 0; i < LANES; i++) {
        const x = i * LANE_W;
        ctx.fillStyle = `rgba(255,255,255,${0.06 + st.flash[i] * 0.5})`;
        ctx.fillRect(x + 10, HIT_Y - 6, LANE_W - 20, 44);
        ctx.fillStyle = st.flash[i] > 0 ? COLORS[i] : 'rgba(255,255,255,.16)';
        ctx.fillRect(x + 10, HIT_Y - 6, LANE_W - 20, 3);
      }

      ctx.textAlign = 'center';
      st.judgments.slice(-1).forEach((j) => {
        ctx.globalAlpha = clamp(j.life / 0.7, 0, 1);
        ctx.fillStyle = j.color;
        ctx.font = '700 20px ui-monospace, monospace';
        ctx.fillText(j.text, W / 2, HIT_Y - 54);
        ctx.globalAlpha = 1;
      });

      if (st.combo >= 5) {
        ctx.fillStyle = 'rgba(233,237,247,.75)';
        ctx.font = '700 30px ui-monospace, monospace';
        ctx.fillText(`${st.combo}×`, W / 2, HIT_Y - 90);
      }

      // progress
      const prog = clamp(st.time / st.chart.duration, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,.1)';
      ctx.fillRect(0, H - 4, W, 4);
      ctx.fillStyle = '#7cf6c8';
      ctx.fillRect(0, H - 4, W * prog, 4);

      if (!st.started) {
        ctx.fillStyle = 'rgba(6,9,15,.72)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#e9edf7';
        ctx.font = '700 22px ui-monospace, monospace';
        ctx.fillText('PULSE', W / 2, H / 2 - 30);
        ctx.fillStyle = '#8d95a9';
        ctx.font = '500 13px ui-monospace, monospace';
        ctx.fillText('Press D F J K to start', W / 2, H / 2 + 2);
        ctx.fillStyle = 'rgba(124,246,200,.8)';
        ctx.fillText('Perfect ±55ms · Good ±170ms', W / 2, H / 2 + 30);
      }

      if (st.over) {
        ctx.fillStyle = 'rgba(6,9,15,.82)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#7cf6c8';
        ctx.font = '700 22px ui-monospace, monospace';
        ctx.fillText('TRACK COMPLETE', W / 2, H / 2 - 30);
        ctx.fillStyle = '#e9edf7';
        ctx.font = '800 34px ui-monospace, monospace';
        ctx.fillText(st.score.toLocaleString('en-US'), W / 2, H / 2 + 8);
        ctx.fillStyle = '#8d95a9';
        ctx.font = '500 13px ui-monospace, monospace';
        ctx.fillText(`${st.hits} / ${st.total} notes hit`, W / 2, H / 2 + 34);
        ctx.fillStyle = 'rgba(124,246,200,.85)';
        ctx.fillText('Press R for a new chart', W / 2, H / 2 + 62);
      }
      ctx.textAlign = 'left';
    }

    const onKey = (e) => {
      const k = e.key.toLowerCase();
      const lane = KEYS.indexOf(k);
      if (lane >= 0) {
        e.preventDefault();
        hit(lane);
      } else if (k === 'r') {
        reset();
      }
    };
    window.addEventListener('keydown', onKey);

    const onDown = (evt) => {
      const p = s.toLocal(evt);
      const lane = clamp(Math.floor(p.x / LANE_W), 0, LANES - 1);
      hit(lane);
    };
    s.canvas.addEventListener('pointerdown', onDown);

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
        window.removeEventListener('keydown', onKey);
        s.canvas.removeEventListener('pointerdown', onDown);
        s.destroy();
        bar.remove();
      },
    };
  },
};

import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { el } from '../lib/util.js';

const PADS = [
  { colour: '#7cf6c8', dim: '#16281f', freq: 329.63 },
  { colour: '#7aa2ff', dim: '#161d2e', freq: 392.0 },
  { colour: '#ffb545', dim: '#2a2115', freq: 523.25 },
  { colour: '#ff7a94', dim: '#2a161d', freq: 659.25 },
];

export default {
  id: 'signal',
  title: 'Signal',
  tagline: 'Memory with real audio cues and a sequence that grows by one every round. No timer, no mercy.',
  genre: 'Memory',
  tags: ['audio', 'keyboard', 'endless'],
  controls: [['Click', 'Repeat the signal'], ['1 – 4', 'Pads by number'], ['Space', 'Start'], ['R', 'Restart']],

  mount(stage) {
    const wrap = el('div', { class: 'ms-wrap' });

    const roundEl = el('span', { html: 'Round <b>1</b>' });
    const bestEl = el('span', { html: `Best <b>${getBest('signal')}</b>` });
    const stateEl = el('span', { html: '<b>Watch</b>' });
    const bar = el('div', { class: 'hud', style: 'max-width:360px' }, [
      el('div', { class: 'hud-group' }, [roundEl, bestEl]),
      el('div', { class: 'hud-group' }, [stateEl]),
    ]);

    const grid = el('div', { class: 'sig-grid' });
    const msg = el('p', { class: 'lede', style: 'font-size:13px;text-align:center;margin:0', text: 'The sequence gets one longer each round. Sound is on by default — use the toggle in the header to mute it.' });
    wrap.append(bar, grid, msg);
    stage.append(wrap);

    let sequence = [];
    let inputIndex = 0;
    let round = 0;
    let phase = 'idle'; // idle | showing | input | over
    let timers = [];
    let pads = [];

    PADS.forEach((pad, i) => {
      const btn = el('button', {
        class: 'sig-pad', type: 'button',
        style: `--pad:${pad.colour};--pad-dim:${pad.dim}`,
        'aria-label': `Signal pad ${i + 1}`,
        onclick: () => press(i),
      });
      pads.push(btn);
      grid.append(btn);
    });

    const clearTimers = () => {
      timers.forEach((t) => clearTimeout(t));
      timers = [];
    };
    const later = (fn, ms) => {
      const id = setTimeout(fn, ms);
      timers.push(id);
    };

    const unlit = (i) => pads[i].classList.remove('lit');
    const light = (i, ms = 330) => {
      pads[i].classList.add('lit');
      later(() => unlit(i), ms);
    };

    function setPhase(text, html = false) {
      stateEl.innerHTML = html ? text : `<b>${text}</b>`;
    }

    function paint() {
      roundEl.innerHTML = `Round <b>${Math.max(1, round)}</b>`;
      bestEl.innerHTML = `Best <b>${getBest('signal')}</b>`;
    }

    function start() {
      clearTimers();
      sequence = [];
      round = 0;
      inputIndex = 0;
      phase = 'showing';
      msg.innerHTML = 'Watch the sequence, then repeat it in order.';
      nextRound();
    }

    function nextRound() {
      round += 1;
      inputIndex = 0;
      sequence.push(Math.floor(Math.random() * 4));
      phase = 'showing';
      setPhase('Watch');
      paint();
      playSequence();
    }

    function playSequence() {
      const gap = Math.max(170, 620 - round * 32);
      sequence.forEach((padIndex, i) => {
        later(() => {
          light(padIndex, gap * 0.62);
          sound.tone(PADS[padIndex].freq, gap * 0.0011, 'sine', 0.06);
        }, i * gap);
      });
      later(() => {
        phase = 'input';
        setPhase('Your turn', true);
        msg.innerHTML = 'Repeat the sequence.';
      }, sequence.length * gap + 140);
    }

    function press(i) {
      if (phase === 'idle') {
        start();
        return;
      }
      if (phase === 'over') {
        start();
        return;
      }
      if (phase !== 'input') return;
      light(i, 200);
      sound.tone(PADS[i].freq, 0.12, 'sine', 0.06);

      if (sequence[inputIndex] === i) {
        inputIndex += 1;
        if (inputIndex >= sequence.length) {
          phase = 'showing';
          setPhase('Correct', true);
          sound.tone(PADS[i].freq * 1.5, 0.1, 'triangle', 0.04);
          later(() => nextRound(), 620);
        }
      } else {
        fail();
      }
    }

    function fail() {
      phase = 'over';
      const reached = Math.max(0, round - 1);
      const prev = getBest('signal');
      if (reached > prev) submitScore('signal', reached);
      setPhase('Wrong', true);
      sound.sweep(300, 70, 0.4, 'sawtooth', 0.06);
      msg.innerHTML = `<strong style="color:#ff5c7a">Wrong pad.</strong> You held the sequence for ${reached} round${reached === 1 ? '' : 's'}. Best is ${getBest('signal')}. Click or press Space to try again.`;
      paint();
    }

    const onKey = (e) => {
      if (e.key >= '1' && e.key <= '4') press(Number(e.key) - 1);
      else if (e.key === ' ') {
        if (phase === 'idle' || phase === 'over') start();
      } else if (e.key === 'r' || e.key === 'R') {
        start();
      }
    };
    window.addEventListener('keydown', onKey);

    setPhase('Watch');
    paint();

    return {
      restart() { start(); },
      destroy() {
        clearTimers();
        window.removeEventListener('keydown', onKey);
        wrap.remove();
      },
    };
  },
};

import { games } from './games/index.js';
import { sound } from './lib/audio.js';
import { getBest } from './lib/store.js';
import { el } from './lib/util.js';

const view = document.getElementById('view');
const soundBtn = document.getElementById('sound-toggle');

let live = null;

const TONES = {
  Arcade: '#7cf6c8',
  Puzzle: '#7aa2ff',
  Logic: '#ffb545',
  Board: '#c79bff',
  Card: '#ff8fa3',
  Memory: '#6ee7e7',
};

function syncSound() {
  soundBtn.textContent = `Sound: ${sound.muted ? 'off' : 'on'}`;
  soundBtn.setAttribute('aria-pressed', String(!sound.muted));
}
syncSound();
soundBtn.addEventListener('click', () => {
  sound.toggle();
  syncSound();
  if (!sound.muted) sound.click();
});

function teardown() {
  if (live && typeof live.destroy === 'function') {
    try { live.destroy(); } catch { /* a game must not be able to wedge navigation */ }
  }
  live = null;
  view.innerHTML = '';
}

/* ---------------- hub ---------------- */

function renderHub(filter = 'All') {
  teardown();
  document.body.classList.remove('in-game');
  document.title = 'Arcadia 12 — hand-built browser games';

  const genres = ['All', ...new Set(games.map((g) => g.genre))];

  view.append(
    el('section', { class: 'hero' }, [
      el('p', { class: 'eyebrow', text: 'No ads · No accounts · Nothing to install' }),
      el('h1', { html: 'Twelve games,<br><em>actually</em> built by hand.' }),
      el('p', {
        class: 'lede',
        html: 'Every game here has its own rules, its own code and its own feel — a snake that wraps, a Tetris with wall kicks and a 7-bag randomiser, a Connect Four that plays a real minimax search. <strong>Nothing is a reskin of anything else.</strong>',
      }),
    ]),
    el('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by genre' },
      genres.map((genre) => {
        const btn = el('button', {
          class: 'filter',
          type: 'button',
          text: genre,
          'aria-pressed': String(genre === filter),
          onclick: () => {
            sound.click();
            renderHub(genre);
          },
        });
        return btn;
      })),
    el('div', { class: 'grid' }, games
      .filter((g) => filter === 'All' || g.genre === filter)
      .map((g) => card(g))),
  );
}

function card(game) {
  const best = getBest(game.id);
  return el('a', {
    class: 'card',
    href: `#/g/${game.id}`,
    style: `--tone:${TONES[game.genre] || '#7cf6c8'}`,
    'aria-label': `${game.title} — ${game.tagline}`,
  }, [
    el('div', { class: 'card-top' }, [
      el('span', { class: 'genre', text: game.genre }),
      el('span', { class: 'best', text: best ? `Best ${best.toLocaleString('en-US')}` : 'New' }),
    ]),
    el('h2', { text: game.title }),
    el('p', { text: game.tagline }),
    el('div', { class: 'tag-row' }, game.tags.map((t) => el('span', { class: 'tag', text: t }))),
    el('span', { class: 'card-cta', text: 'Play' }),
  ]);
}

/* ---------------- game view ---------------- */

function openGame(id) {
  const game = games.find((g) => g.id === id);
  if (!game) {
    location.hash = '#/';
    return;
  }
  teardown();
  document.body.classList.add('in-game');
  document.title = `${game.title} — Arcadia 12`;

  const restartBtn = el('button', { class: 'pill-btn', type: 'button', text: 'Restart' });
  const stageHost = el('div', { class: 'stage-host' });

  const shell = el('section', { class: 'game' }, [
    el('div', { class: 'game-head' }, [
      el('div', {}, [
        el('a', { class: 'back', href: '#/', text: '← All games' }),
        el('h1', { class: 'game-title', text: game.title }),
        el('p', { class: 'game-tagline', text: game.tagline }),
      ]),
      el('div', { class: 'game-actions' }, [restartBtn]),
    ]),
    el('div', { class: 'panel' }, [stageHost]),
    el('div', { class: 'controls' }, game.controls.map(([k, v]) =>
      el('span', { html: `<kbd>${k}</kbd>${v}` }))),
  ]);
  view.append(shell);

  live = game.mount(stageHost) || null;
  restartBtn.addEventListener('click', () => {
    sound.click();
    if (live && typeof live.restart === 'function') live.restart();
  });
}

/* ---------------- router ---------------- */

function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [kind, id] = hash.split('/');
  if (kind === 'g' && id) openGame(id);
  else renderHub();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  view.focus({ preventScroll: true });
}

window.addEventListener('hashchange', route);

if (!location.hash) location.hash = '#/';
route();

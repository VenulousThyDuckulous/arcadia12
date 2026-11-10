import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { el, randInt } from '../lib/util.js';

const WORDS = [
  'about', 'above', 'actor', 'admit', 'adopt', 'after', 'again', 'agent', 'agree', 'ahead',
  'alarm', 'album', 'alert', 'alike', 'alive', 'allow', 'alone', 'along', 'alter', 'amber',
  'among', 'angel', 'anger', 'angle', 'angry', 'apart', 'apple', 'apply', 'arena', 'argue',
  'arise', 'array', 'aside', 'asset', 'audio', 'audit', 'avoid', 'awake', 'award', 'aware',
  'badly', 'baker', 'bases', 'basic', 'beach', 'began', 'begin', 'begun', 'being', 'below',
  'bench', 'billy', 'birth', 'black', 'blame', 'blind', 'block', 'blood', 'board', 'boost',
  'booth', 'bound', 'brain', 'brand', 'bread', 'break', 'breed', 'brief', 'bring', 'broad',
  'broke', 'brown', 'build', 'built', 'buyer', 'cable', 'calif', 'carry', 'catch', 'cause',
  'chain', 'chair', 'chart', 'chase', 'cheap', 'check', 'chest', 'chief', 'child', 'china',
  'chose', 'civil', 'claim', 'class', 'clean', 'clear', 'click', 'clock', 'close', 'cloud',
  'coach', 'coast', 'could', 'count', 'court', 'cover', 'craft', 'crash', 'cream', 'crime',
  'cross', 'crowd', 'crown', 'curve', 'cycle', 'daily', 'dance', 'dated', 'dealt', 'death',
  'debut', 'delay', 'depth', 'doing', 'doubt', 'dozen', 'draft', 'drama', 'drawn', 'dream',
  'dress', 'drill', 'drink', 'drive', 'drove', 'dying', 'eager', 'early', 'earth', 'eight',
  'elite', 'empty', 'enemy', 'enjoy', 'enter', 'entry', 'equal', 'error', 'event', 'every',
  'exact', 'exist', 'extra', 'faith', 'false', 'fault', 'fiber', 'field', 'fifth', 'fifty',
  'fight', 'final', 'first', 'fixed', 'flash', 'fleet', 'floor', 'fluid', 'focus', 'force',
  'forth', 'forty', 'forum', 'found', 'frame', 'frank', 'fraud', 'fresh', 'front', 'fruit',
  'fully', 'funny', 'giant', 'given', 'glass', 'globe', 'going', 'grace', 'grade', 'grand',
  'grant', 'grass', 'great', 'green', 'gross', 'group', 'grown', 'guard', 'guess', 'guest',
  'guide', 'happy', 'harry', 'heart', 'heavy', 'hence', 'horse', 'hotel', 'house', 'human',
  'ideal', 'image', 'index', 'inner', 'input', 'issue', 'japan', 'jimmy', 'joint', 'jones',
  'judge', 'known', 'label', 'large', 'laser', 'later', 'laugh', 'layer', 'learn', 'lease',
  'least', 'leave', 'legal', 'level', 'lewis', 'light', 'limit', 'links', 'lives', 'local',
  'logic', 'loose', 'lower', 'lucky', 'lunch', 'lying', 'magic', 'major', 'maker', 'march',
  'maria', 'match', 'maybe', 'mayor', 'meant', 'media', 'metal', 'might', 'minor', 'minus',
  'mixed', 'model', 'money', 'month', 'moral', 'motor', 'mount', 'mouse', 'mouth', 'movie',
  'music', 'needs', 'never', 'newly', 'night', 'noise', 'north', 'noted', 'novel', 'nurse',
  'occur', 'ocean', 'offer', 'often', 'order', 'other', 'ought', 'paint', 'panel', 'paper',
  'party', 'peace', 'peter', 'phase', 'phone', 'photo', 'piece', 'pilot', 'pitch', 'place',
  'plain', 'plane', 'plant', 'plate', 'point', 'pound', 'power', 'press', 'price', 'pride',
  'prime', 'print', 'prior', 'prize', 'proof', 'proud', 'prove', 'queen', 'quick', 'quiet',
  'quite', 'radio', 'raise', 'range', 'rapid', 'ratio', 'reach', 'ready', 'refer', 'right',
  'rival', 'river', 'robin', 'roger', 'roman', 'rough', 'round', 'route', 'royal', 'rural',
  'scale', 'scene', 'scope', 'score', 'sense', 'serve', 'seven', 'shall', 'shape', 'share',
  'sharp', 'sheet', 'shelf', 'shell', 'shift', 'shine', 'shirt', 'shock', 'shoot', 'short',
  'shown', 'sight', 'since', 'sixth', 'sixty', 'sized', 'skill', 'sleep', 'slide', 'small',
  'smart', 'smile', 'smith', 'smoke', 'solid', 'solve', 'sorry', 'sound', 'south', 'space',
  'spare', 'speak', 'speed', 'spend', 'spent', 'split', 'spoke', 'sport', 'staff', 'stage',
  'stake', 'stand', 'start', 'state', 'steam', 'steel', 'stick', 'still', 'stock', 'stone',
  'stood', 'store', 'storm', 'story', 'strip', 'stuck', 'study', 'stuff', 'style', 'sugar',
  'suite', 'super', 'sweet', 'table', 'taken', 'taste', 'taxes', 'teach', 'teeth', 'terry',
  'texas', 'thank', 'theft', 'their', 'theme', 'there', 'these', 'thick', 'thing', 'think',
  'third', 'those', 'three', 'threw', 'throw', 'tight', 'times', 'tired', 'title', 'today',
  'topic', 'total', 'touch', 'tough', 'tower', 'track', 'trade', 'train', 'treat', 'trend',
  'trial', 'tried', 'tries', 'truck', 'truly', 'trust', 'truth', 'twice', 'under', 'undue',
  'union', 'unity', 'until', 'upper', 'upset', 'urban', 'usage', 'usual', 'valid', 'value',
  'video', 'virus', 'visit', 'vital', 'voice', 'waste', 'watch', 'water', 'wheel', 'where',
  'which', 'while', 'white', 'whole', 'whose', 'woman', 'women', 'world', 'worry', 'worse',
  'worst', 'worth', 'would', 'wound', 'write', 'wrong', 'wrote', 'yield', 'young', 'youth',
];

const ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'back'],
];

export default {
  id: 'wordl',
  title: 'Five Letters',
  tagline: 'A word game with correct duplicate-letter scoring: greens are claimed first, then yellows are counted against what is left.',
  genre: 'Word',
  tags: ['keyboard', 'daily', 'deduction'],
  controls: [
    ['Type', 'Enter a guess'],
    ['Enter', 'Submit'],
    ['Backspace', 'Delete'],
    ['R', 'New word'],
  ],

  mount(stage) {
    const wrap = el('div', { class: 'wl-wrap' });

    const winsEl = el('span', { html: 'Wins <b>0</b>' });
    const bestEl = el('span', { html: `Best <b>${getBest('wordl')}</b>` });
    const bar = el('div', { class: 'hud', style: 'max-width:420px' }, [
      el('div', { class: 'hud-group' }, [winsEl]),
      el('div', { class: 'hud-group' }, [bestEl]),
    ]);

    const grid = el('div', { class: 'wl-grid' });
    const keysHost = el('div', { class: 'wl-keys' });
    const msg = el('p', { class: 'lede', style: 'font-size:13px;text-align:center;margin:0;min-height:20px', text: 'Six guesses. Green means right letter, right spot.' });
    const nav = el('div', { class: 'filters', style: 'justify-content:center;margin:0' }, [
      el('button', { class: 'filter', type: 'button', text: 'New word', onclick: () => reset() }),
    ]);
    wrap.append(bar, grid, keysHost, nav, msg);
    stage.append(wrap);

    let answer = 'about';
    let guesses = [];
    let draft = '';
    let over = false;
    let dead = false;
    let wins = 0;
    const letterState = new Map();
    const tiles = [];
    const keyNodes = new Map();

    function build() {
      grid.innerHTML = '';
      tiles.length = 0;
      for (let r = 0; r < 6; r++) {
        const row = el('div', { class: 'wl-row' });
        for (let c = 0; c < 5; c++) {
          const tile = el('div', { class: 'wl-tile' });
          row.append(tile);
          tiles.push(tile);
        }
        grid.append(row);
      }

      keysHost.innerHTML = '';
      keyNodes.clear();
      for (const row of ROWS) {
        const rowEl = el('div', { class: 'wl-krow' });
        for (const k of row) {
          const label = k === 'enter' ? 'Enter' : k === 'back' ? '⌫' : k.toUpperCase();
          const btn = el('button', {
            class: 'wl-key' + (k === 'enter' || k === 'back' ? ' wide' : ''),
            type: 'button', text: label,
            onclick: () => press(k),
          });
          keyNodes.set(k, btn);
          rowEl.append(btn);
        }
        keysHost.append(rowEl);
      }
    }

    function score(guess) {
      const result = new Array(5).fill('none');
      const pool = answer.split('');
      for (let i = 0; i < 5; i++) {
        if (guess[i] === answer[i]) {
          result[i] = 'hit';
          pool[i] = null;
        }
      }
      for (let i = 0; i < 5; i++) {
        if (result[i] === 'hit') continue;
        const idx = pool.indexOf(guess[i]);
        if (idx >= 0) {
          result[i] = 'near';
          pool[idx] = null;
        }
      }
      return result;
    }

    function paintDraft() {
      const r = guesses.length;
      if (r >= 6) return;
      for (let c = 0; c < 5; c++) {
        const tile = tiles[r * 5 + c];
        tile.textContent = draft[c] || '';
        tile.className = 'wl-tile' + (draft[c] ? ' filled' : '');
      }
    }

    function paintBoard() {
      guesses.forEach((g, r) => {
        const marks = score(g);
        for (let c = 0; c < 5; c++) {
          const tile = tiles[r * 5 + c];
          tile.textContent = g[c].toUpperCase();
          tile.className = 'wl-tile ' + marks[c];
        }
      });
      paintDraft();
      keyNodes.forEach((node, k) => {
        if (k === 'enter' || k === 'back') return;
        const st = letterState.get(k);
        node.className = 'wl-key' + (st ? ' ' + st : '');
      });
      winsEl.innerHTML = `Wins <b>${wins}</b>`;
    }

    function finish(won) {
      over = true;
      if (won) {
        wins += 1;
        const points = (7 - guesses.length) * 100;
        submitScore('wordl', points);
        msg.innerHTML = `<strong style="color:#7cf6c8">${guesses.length}/6 — got it.</strong> New word on R.`;
        sound.win();
      } else {
        msg.innerHTML = `<strong style="color:#ff8ca1">Out of guesses — it was ${answer.toUpperCase()}.</strong> R for a new word.`;
        sound.bad();
      }
      paintBoard();
      bestEl.innerHTML = `Best <b>${getBest('wordl')}</b>`;
    }

    function submit() {
      if (over || draft.length !== 5) {
        msg.textContent = 'Need five letters.';
        return;
      }
      if (!WORDS.includes(draft)) {
        msg.textContent = 'Not in the word list — try another.';
        sound.bad();
        return;
      }
      const marks = score(draft);
      guesses.push(draft);
      for (let i = 0; i < 5; i++) {
        const prev = letterState.get(draft[i]);
        const rank = { hit: 3, near: 2, none: 1 };
        if (!prev || rank[marks[i]] > rank[prev]) letterState.set(draft[i], marks[i]);
      }
      draft = '';
      sound.tone(marks.every((m) => m === 'hit') ? 900 : 460, 0.07, 'triangle', 0.04);
      paintBoard();
      if (guesses[guesses.length - 1] === answer) {
        finish(true);
      } else if (guesses.length >= 6) {
        finish(false);
      } else {
        msg.textContent = `${6 - guesses.length} guesses left.`;
      }
    }

    function press(k) {
      if (dead) return;
      if (k === 'enter') {
        submit();
        return;
      }
      if (k === 'back') {
        draft = draft.slice(0, -1);
        paintDraft();
        return;
      }
      if (over || draft.length >= 5) return;
      draft += k;
      sound.tone(300 + draft.length * 40, 0.03, 'square', 0.02);
      paintDraft();
    }

    function reset() {
      answer = WORDS[randInt(0, WORDS.length - 1)];
      guesses = [];
      draft = '';
      over = false;
      letterState.clear();
      msg.textContent = 'Six guesses. Green means right letter, right spot.';
      paintBoard();
      bestEl.innerHTML = `Best <b>${getBest('wordl')}</b>`;
    }

    const onKey = (e) => {
      if (dead) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        press('enter');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        press('back');
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        press(e.key.toLowerCase());
      } else if (e.key === 'r' || e.key === 'R') {
        reset();
      }
    };
    window.addEventListener('keydown', onKey);

    build();
    reset();

    return {
      restart() {
        reset();
      },
      destroy() {
        dead = true;
        window.removeEventListener('keydown', onKey);
        wrap.remove();
      },
    };
  },
};

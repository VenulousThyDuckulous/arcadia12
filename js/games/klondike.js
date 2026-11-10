import { sound } from '../lib/audio.js';
import { getBest, submitScore } from '../lib/store.js';
import { el } from '../lib/util.js';

const SUITS = [
  { glyph: '♠', colour: 'black' },
  { glyph: '♥', colour: 'red' },
  { glyph: '♦', colour: 'red' },
  { glyph: '♣', colour: 'black' },
];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

let cardId = 1;

function makeDeck() {
  const deck = [];
  for (let s = 0; s < 4; s++) {
    for (let r = 1; r <= 13; r++) {
      deck.push({ id: cardId++, suit: s, rank: r, faceUp: false });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const isRed = (card) => SUITS[card.suit].colour === 'red';
const canStack = (card, onto) => isRed(card) !== isRed(onto) && card.rank === onto.rank - 1;

export default {
  id: 'klondike',
  title: 'Klondike',
  tagline: 'Proper solitaire: seven columns, four foundations, unlimited redeals, undo, and a 52-card deck that behaves.',
  genre: 'Card',
  tags: ['mouse', 'undo', 'classic'],
  controls: [['Click', 'Select card, then target'], ['Double-click', 'Send to foundation'], ['U', 'Undo'], ['R', 'New deal']],

  mount(stage) {
    const wrap = el('div', { class: 'kl-wrap' });

    const movesEl = el('span', { html: 'Moves <b>0</b>' });
    const homeEl = el('span', { html: 'Home <b>0/52</b>' });
    const stateEl = el('span', { text: '' });
    const bar = el('div', { class: 'hud', style: 'max-width:720px' }, [
      el('div', { class: 'hud-group' }, [movesEl, homeEl]),
      el('div', { class: 'hud-group' }, [stateEl]),
    ]);

    const slotRow = el('div', { class: 'kl-slot-row' });
    const table = el('div', { class: 'kl-table' });
    const msg = el('p', { class: 'lede', style: 'font-size:13px;text-align:center;margin:0', text: 'Click a card to pick it up, then click where it should go. Double-click sends a card home.' });
    wrap.append(bar, slotRow, table, msg);
    stage.append(wrap);

    const st = {
      stock: [],
      waste: [],
      foundations: [[], [], [], []],
      tableau: [[], [], [], [], [], [], []],
      moves: 0,
      selection: null,
      history: [],
      won: false,
    };

    function deal() {
      const deck = makeDeck();
      st.stock = [];
      st.waste = [];
      st.foundations = [[], [], [], []];
      st.tableau = [[], [], [], [], [], [], []];
      st.moves = 0;
      st.selection = null;
      st.history = [];
      st.won = false;
      for (let col = 0; col < 7; col++) {
        for (let row = 0; row <= col; row++) {
          const card = deck.pop();
          card.faceUp = row === col;
          st.tableau[col].push(card);
        }
      }
      st.stock = deck;
      msg.innerHTML = 'Click a card to pick it up, then click where it should go. Double-click sends a card home.';
      render();
    }

    const totalHome = () => st.foundations.reduce((n, f) => n + f.length, 0);

    function snapshot() {
      return {
        stock: st.stock.map((c) => ({ ...c })),
        waste: st.waste.map((c) => ({ ...c })),
        foundations: st.foundations.map((f) => f.map((c) => ({ ...c }))),
        tableau: st.tableau.map((t) => t.map((c) => ({ ...c }))),
        moves: st.moves,
      };
    }

    function restore(snap) {
      st.stock = snap.stock.map((c) => ({ ...c }));
      st.waste = snap.waste.map((c) => ({ ...c }));
      st.foundations = snap.foundations.map((f) => f.map((c) => ({ ...c })));
      st.tableau = snap.tableau.map((t) => t.map((c) => ({ ...c })));
      st.moves = snap.moves;
      st.selection = null;
    }

    function pushHistory() {
      st.history.push(snapshot());
      if (st.history.length > 120) st.history.shift();
    }

    function render() {
      movesEl.innerHTML = `Moves <b>${st.moves}</b>`;
      homeEl.innerHTML = `Home <b>${totalHome()}/52</b>`;
      stateEl.textContent = st.won ? 'You win' : '';

      slotRow.innerHTML = '';
      table.innerHTML = '';

      // stock
      const stockCol = el('div', { class: 'kl-col' });
      if (st.stock.length) {
        const back = el('div', { class: 'kl-card hidden-back', title: `Stock (${st.stock.length})` });
        back.addEventListener('click', drawStock);
        stockCol.append(back);
      } else {
        const empty = el('div', {
          class: 'kl-card empty-slot', title: 'Recycle waste',
          onclick: () => recycle(),
        });
        stockCol.append(empty);
      }
      slotRow.append(stockCol);

      // waste
      const wasteCol = el('div', { class: 'kl-col' });
      const top = st.waste[st.waste.length - 1];
      if (top) {
        const cardEl = makeCardEl(top, 'waste');
        if (st.selection && st.selection.source === 'waste') cardEl.classList.add('selected');
        wasteCol.append(cardEl);
      } else {
        wasteCol.append(el('div', { class: 'kl-card empty-slot' }));
      }
      slotRow.append(wasteCol);

      slotRow.append(el('div', { class: 'kl-col' }));

      // foundations
      st.foundations.forEach((pile, i) => {
        const col = el('div', { class: 'kl-col' });
        const card = pile[pile.length - 1];
        if (card) {
          const node = makeCardEl(card, 'foundation', i);
          if (st.selection && st.selection.source === 'foundation' && st.selection.index === i) {
            node.classList.add('selected');
          }
          col.append(node);
        } else {
          const slot = el('div', { class: 'kl-card empty-slot', title: 'Foundation' });
          slot.addEventListener('click', () => targetFoundation(i));
          col.append(slot);
        }
        slotRow.append(col);
      });

      // tableau
      st.tableau.forEach((pile, colIndex) => {
        const col = el('div', { class: 'kl-col fanned' });
        if (!pile.length) {
          const slot = el('div', { class: 'kl-card empty-slot', title: 'Empty column' });
          slot.addEventListener('click', () => targetTableau(colIndex));
          col.append(slot);
        }
        pile.forEach((card, cardIndex) => {
          const node = makeCardEl(card, 'tableau', colIndex, cardIndex);
          if (
            st.selection &&
            st.selection.source === 'tableau' &&
            st.selection.index === colIndex &&
            st.selection.cardIndex === cardIndex
          ) {
            node.classList.add('selected');
          }
          col.append(node);
        });
        table.append(col);
      });

      if (totalHome() === 52 && !st.won) {
        st.won = true;
        sound.win();
        submitScore('klondike', Math.max(0, 5000 - st.moves * 4));
        stateEl.textContent = 'You win';
        msg.innerHTML = `<strong style="color:#7cf6c8">Deck cleared in ${st.moves} moves.</strong> Deal again for a fresh shuffle.`;
      }
    }

    function makeCardEl(card, source, colIndex = 0, cardIndex = 0) {
      const node = el('div', { class: 'kl-card' });
      if (!card.faceUp) {
        node.classList.add('hidden-back');
        node.addEventListener('click', () => {
          // face-down tableau cards can only be flipped when they are top
          if (source === 'tableau' && cardIndex === st.tableau[colIndex].length - 1) {
            pushHistory();
            card.faceUp = true;
            st.moves += 1;
            sound.click();
            render();
          }
        });
        return node;
      }
      if (isRed(card)) node.classList.add('red');
      node.innerHTML = `<span>${RANKS[card.rank - 1]}</span><span class="face">${SUITS[card.suit].glyph}</span>`;
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        handleCardClick(source, colIndex, cardIndex);
      });
      node.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        autoHome(source, colIndex, cardIndex);
      });
      return node;
    }

    /* ---------------- rules ---------------- */

    function selectionCards() {
      const sel = st.selection;
      if (!sel) return [];
      if (sel.source === 'waste') return st.waste.slice(-1);
      if (sel.source === 'foundation') return st.foundations[sel.index].slice(-1);
      return st.tableau[sel.index].slice(sel.cardIndex);
    }

    function handleCardClick(source, colIndex, cardIndex) {
      if (st.won) return;
      const sel = st.selection;

      if (!sel) {
        // try to pick up
        if (source === 'waste') {
          st.selection = { source, index: 0 };
        } else if (source === 'foundation') {
          st.selection = { source, index: colIndex };
        } else {
          const pile = st.tableau[colIndex];
          if (!pile[cardIndex] || !pile[cardIndex].faceUp) return;
          st.selection = { source, index: colIndex, cardIndex };
        }
        sound.tone(520, 0.04, 'triangle', 0.03);
        render();
        return;
      }

      // clicking the same selection clears it
      if (
        (sel.source === 'tableau' && source === 'tableau' && sel.index === colIndex && sel.cardIndex === cardIndex) ||
        (sel.source === 'waste' && source === 'waste') ||
        (sel.source === 'foundation' && source === 'foundation' && sel.index === colIndex)
      ) {
        st.selection = null;
        render();
        return;
      }

      if (source === 'foundation') {
        targetFoundation(colIndex);
        return;
      }
      if (source === 'tableau') {
        targetTableau(colIndex);
        return;
      }
      if (source === 'waste') {
        st.selection = null;
        render();
      }
    }

    function targetFoundation(i) {
      const cards = selectionCards();
      if (!cards.length) return;
      if (cards.length > 1) {
        st.selection = null;
        render();
        return;
      }
      const card = cards[0];
      const pile = st.foundations[i];
      const top = pile[pile.length - 1];
      const ok = top ? top.suit === card.suit && card.rank === top.rank + 1 : card.rank === 1;
      if (!ok) {
        st.selection = null;
        render();
        return;
      }
      pushHistory();
      removeSelection();
      pile.push(card);
      st.selection = null;
      st.moves += 1;
      sound.tone(700, 0.06, 'triangle', 0.04);
      render();
    }

    function targetTableau(colIndex) {
      const cards = selectionCards();
      if (!cards.length) return;
      const card = cards[0];
      const pile = st.tableau[colIndex];
      const top = pile[pile.length - 1];

      if (st.selection && st.selection.source === 'tableau' && st.selection.index === colIndex) {
        st.selection = null;
        render();
        return;
      }

      const ok = top ? top.faceUp && canStack(card, top) : card.rank === 13;
      if (!ok) {
        st.selection = null;
        render();
        return;
      }
      pushHistory();
      removeSelection();
      const sourceWasTableau = st.selection ? st.selection.source === 'tableau' : false;
      cards.forEach((c) => pile.push(c));
      st.selection = null;
      st.moves += 1;
      sound.tone(440, 0.05, 'triangle', 0.035);
      if (sourceWasTableau) flipExposed();
      render();
    }

    function autoHome(source, colIndex, cardIndex) {
      if (st.won) return;
      if (source === 'tableau') {
        const pile = st.tableau[colIndex];
        if (cardIndex !== pile.length - 1) return;
        st.selection = { source, index: colIndex, cardIndex };
      } else if (source === 'waste') {
        st.selection = { source, index: 0 };
      } else {
        return;
      }
      const cards = selectionCards();
      if (cards.length !== 1) {
        st.selection = null;
        return;
      }
      for (let i = 0; i < 4; i++) {
        const pile = st.foundations[i];
        const top = pile[pile.length - 1];
        const card = cards[0];
        const ok = top ? top.suit === card.suit && card.rank === top.rank + 1 : card.rank === 1;
        if (ok) {
          pushHistory();
          removeSelection();
          st.foundations[i].push(card);
          st.selection = null;
          st.moves += 1;
          if (source === 'tableau') flipExposed();
          sound.tone(760, 0.06, 'triangle', 0.04);
          render();
          return;
        }
      }
      st.selection = null;
      render();
    }

    function removeSelection() {
      const sel = st.selection;
      if (!sel) return;
      if (sel.source === 'waste') st.waste.pop();
      else if (sel.source === 'foundation') st.foundations[sel.index].pop();
      else st.tableau[sel.index].splice(sel.cardIndex);
    }

    function flipExposed() {
      st.tableau.forEach((pile) => {
        const last = pile[pile.length - 1];
        if (last && !last.faceUp) last.faceUp = true;
      });
    }

    function drawStock() {
      if (st.won) return;
      if (!st.stock.length) {
        recycle();
        return;
      }
      pushHistory();
      const card = st.stock.pop();
      card.faceUp = true;
      st.waste.push(card);
      st.selection = null;
      st.moves += 1;
      sound.tone(300, 0.03, 'square', 0.02);
      render();
    }

    function recycle() {
      if (!st.waste.length) return;
      pushHistory();
      while (st.waste.length) {
        const card = st.waste.pop();
        card.faceUp = false;
        st.stock.push(card);
      }
      st.selection = null;
      st.moves += 1;
      sound.tone(260, 0.05, 'triangle', 0.03);
      render();
    }

    function undo() {
      const snap = st.history.pop();
      if (!snap) return;
      restore(snap);
      st.won = false;
      sound.tone(340, 0.05, 'square', 0.03);
      render();
    }

    const onKey = (e) => {
      if (e.key === 'u' || e.key === 'U' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        undo();
      } else if (e.key === 'r' || e.key === 'R') {
        deal();
      } else if (e.key === 'Escape') {
        st.selection = null;
        render();
      } else if (e.key === ' ') {
        e.preventDefault();
        drawStock();
      }
    };
    window.addEventListener('keydown', onKey);

    const undoBtn = el('button', { class: 'filter', type: 'button', text: 'Undo', onclick: () => undo() });
    const newBtn = el('button', { class: 'filter', type: 'button', text: 'New deal', onclick: () => deal() });
    const tools = el('div', { class: 'filters', style: 'justify-content:center;margin:0' }, [undoBtn, newBtn]);
    wrap.insertBefore(tools, msg);

    deal();
    const bestEl = el('span', { html: `Best <b>${getBest('klondike')}</b>` });
    bar.querySelector('.hud-group').append(bestEl);

    return {
      restart() { deal(); },
      destroy() {
        window.removeEventListener('keydown', onKey);
        wrap.remove();
      },
    };
  },
};

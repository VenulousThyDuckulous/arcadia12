# Arcadia 12

Twelve browser games, each with its own rules and its own code. No build step, no dependencies, no ads, no accounts, no trackers — plain HTML, CSS and ES modules, served straight from GitHub Pages.

## The games

| Game | Genre | What makes it different |
| --- | --- | --- |
| Neon Serpent | Arcade | Snake with wrap-around tunnels, a speed curve and a golden fruit that expires |
| Brickwork | Arcade | Breakout with paddle-angle spin, multi-hit bricks and three power-ups |
| 2048 | Puzzle | Sliding tiles with animated merges and one-step undo |
| Blockfall | Puzzle | Tetris with a 7-bag randomiser, wall kicks, hold slot, ghost piece and lock delay |
| Minesweeper | Logic | Three board sizes, safe first click, flood fill, chording, flag mode |
| Drift | Arcade | Asteroids with inertia, screen wrap and splitting rocks |
| Warehouse | Puzzle | Six hand-designed Sokoban rooms with undo |
| Four in a Row | Board | Connect Four against an alpha-beta minimax search |
| Sudoku | Logic | Generated puzzles, each verified to have exactly one solution |
| Rally | Arcade | Pong with spin, rising ball speed and an AI that scales with the rally |
| Signal | Memory | Simon-style sequence memory with real audio cues |
| Klondike | Card | Full solitaire: seven columns, four foundations, redeal, undo |

## Running locally

No install is required. Serve the folder over HTTP so the ES modules load:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Structure

```
index.html            page shell and hub
assets/style.css      base design system
assets/games.css      per-game component styles
js/app.js             hash router, hub rendering, game chrome
js/lib/*.js           canvas stage, input, loop, audio, storage helpers
js/games/*.js         one module per game, each exporting { id, title, mount }
```

Every game module exports a `mount(stage)` that returns `{ restart, destroy }`, so the router can tear a game down cleanly when you navigate away.

## Notes on the count

This is twelve games, not 320,000. A catalogue that size cannot be hand-made, and generating it electronically would produce exactly the repetitive filler this project is trying to avoid. Twelve finished games with real mechanics seemed like the honest version of that goal.

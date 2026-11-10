# Arcadia

Twenty-one browser games, each written by hand. No build step, no dependencies, no ads, no accounts, no trackers.

**Play it at <https://venulousthyduckulous.github.io/arcadia12/>**

## The games

| Game | Genre | What makes it its own thing |
| --- | --- | --- |
| **Neon Serpent** | Arcade | Snake with wrap-around tunnels, a speed curve, and golden fruit that expires |
| **Brickwork** | Arcade | Breakout with multi-hit bricks, angled paddle spin and descending rows |
| **2048** | Puzzle | Slide-and-merge with proper spawn weighting and undo-free scoring |
| **Minesweeper** | Logic | First-click safety, flood fill, chord clicking, three board sizes |
| **Blockfall** | Puzzle | Tetris with wall kicks, SRS rotation and a 7-bag randomiser |
| **Drift** | Racing | Top-down drift physics with grip that breaks at speed |
| **Sokoban** | Logic | Hand-authored crate puzzles with undo |
| **Four in a Row** | Board | Alpha-beta minimax opponent, three real difficulty depths |
| **Sudoku** | Logic | Generated puzzles, each verified to have exactly one solution |
| **Rally** | Arcade | Paddle duel against a predictive AI |
| **Signal** | Memory | Simon with a growing sequence and per-pad tones |
| **Klondike** | Card | Full solitaire: stock, waste, foundations, undo, unlimited redeals |
| **Corridor Zero** | Shooter · 3D | First-person raycaster: every wall is a real DDA ray, drones are depth-sorted billboards |
| **Overdrive** | Racing · 3D | Projected 3D road with real curves and hills, camera tilt, and traffic |
| **Sky Stacker** | Arcade · 3D | CSS 3D transforms in perspective; overhang is sliced off each drop |
| **Gem Cascade** | Puzzle | Match-3 with cascading gravity, chain multipliers and legal-swap checking |
| **Hold the Line** | Strategy | Tower defence with real pathing, three tower archetypes, splash and frost |
| **Long Jump** | Platform | Coyote time, double jump, variable jump height, generated course |
| **Reversi** | Board | Othello against an alpha-beta search with corner weighting |
| **Pulse** | Rhythm | Four-lane rhythm with ±55 ms perfect windows and a combo multiplier |
| **Five Letters** | Word | Word game with correct duplicate-letter scoring |

## About the number of games

The original brief asked for 320,000 games. That is not something a person (or an agent) can produce honestly: at that scale every entry would be a variation of a handful of templates, which is exactly the filler the same brief ruled out. So this is twenty-one games with separate rules, separate code and separate feel. The count is small on purpose; the games are real.

The one thing every game shares is the shell: a hash router, a canvas/stage helper, a sound engine and best-score storage in `js/lib/`. Everything else is written per game.

## Run it locally

There is no build step. Serve the folder with any static server:

```bash
python3 -m http.server 3000
# then open http://localhost:3000
```

Opening `index.html` directly from disk will not work, because the games are ES modules and browsers block module loading over `file://`.

## Structure

```
index.html            shell, hub, footer
assets/style.css      base layout, hub, typography
assets/games.css      per-game component styles
js/app.js             hash router, hub rendering, restart button, sound toggle
js/lib/util.js        el(), clamp, shuffle, randInt, sleep
js/lib/store.js       best scores in localStorage
js/lib/audio.js       WebAudio blips with a persisted mute switch
js/lib/ui.js          makeStage(), startLoop(), keys(), swipes(), palette
js/games/index.js     game registry
js/games/*.js         one module per game, each default-exporting its metadata and mount()
```

Each game module exports:

```js
{ id, title, tagline, genre, tags, controls, mount(stage) → { restart, destroy } }
```

`destroy()` must remove every listener and animation frame it created, because the router mounts and unmounts games without reloading the page.

## Notes

- Best scores live in `localStorage` under `arcadia:best`; muting is `arcadia:muted`.
- The 3D games need nothing beyond the platform: `Corridor Zero` and `Overdrive` render with the 2D canvas, and `Sky Stacker` uses CSS 3D transforms.
- Everything is offline-capable: save the page and the modules still load from disk.

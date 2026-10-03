# UNO Next-Move Calculator: Plan

Last updated: 2026-10-03

## Goal

Given my hand, the discard pile, and whatever I know about the other players, all entered on my phone at the table, tell me which card to play, or whether to draw, and briefly why.

## Defaults chosen

These were picked where nothing was specified. Each one is easy to change.

| Decision | Default | Why |
|---|---|---|
| Language | TypeScript (strict) | One language for engine and UI; types catch rule-modeling mistakes. |
| Interface | Static web app, mobile-first, usable at the table on a phone | Tap cards instead of typing. No server: everything runs in the browser. |
| Framework | Vite + React | Fast dev loop, simple static build. |
| Hosting | Static host (GitHub Pages or Vercel); installable as a PWA so it works offline | No backend to run or pay for. |
| Ruleset | Official Mattel rules, with house rules as toggles | One well-defined baseline; stacking and other house rules opt in. |
| Players | 2 to 10, default 4 | Matches the standard game. |
| Deps | Engine has zero runtime deps; Vitest, fast-check, ESLint, Prettier, Playwright for dev | Engine stays portable and testable outside the browser. |
| Runtime | Node 24 / npm 11 (already installed) for dev and build | Matches the local machine. |

## 1. Rules modeled

### Deck (108 cards)
- **Colors:** Red, Yellow, Green, Blue.
- **Numbers:** per color, one `0` and two each of `1` to `9` (76 total).
- **Actions:** per color, two each of Skip, Reverse, Draw Two (24 total).
- **Wilds:** four Wild, four Wild Draw Four (8 total).

### Legal plays (baseline)
- Match the top card's **color** (the *active* color, which a wild may have set), **number**, or **symbol**.
- Wild is always playable; the player names the new color.
- Wild Draw Four is legal only when you hold no card matching the active color (official rule). A toggle relaxes this, and the engine tracks the bluff/challenge risk when it's relaxed.
- If you can't or choose not to play, draw one; if the drawn card is playable you may play it immediately.
- Reverse acts as Skip in 2-player games.
- Calling UNO at one card is modeled as a reminder in the output, not a move.

### Effects
- Skip: next player loses their turn.
- Reverse: direction flips.
- Draw Two: next player draws 2 and loses their turn.
- Wild Draw Four: next player draws 4 and loses their turn; may challenge (see toggles).

### House-rule toggles
| Toggle | Effect |
|---|---|
| `stack_draw2` | A Draw Two may be answered with a Draw Two; penalty accumulates. |
| `stack_draw4` | Draw Four on Draw Four stacks. |
| `stack_mixed` | Draw Four may be played on a pending Draw Two (and optionally the reverse, `stack_mixed_any`). |
| `draw_until_play` | Keep drawing until you get a playable card. |
| `jump_in` | Play an identical card out of turn (modeled as a note, not searched, in v1). |
| `seven_o` | 7 swaps hands with a chosen player, 0 rotates all hands. |
| `wd4_challenge` | Enable the challenge rule and its risk in scoring. |

## 2. Input format

### Card notation
Short, case-insensitive tokens:

| Card | Token | Examples |
|---|---|---|
| Number | `<color><digit>` | `R5`, `g0` |
| Skip | `<color>S` | `BS` |
| Reverse | `<color>R` | `YR` |
| Draw Two | `<color>+2` | `R+2` |
| Wild | `W` | `W` |
| Wild Draw Four | `W+4` | `W+4` |

Colors: `R Y G B`. Long forms (`red-5`, `blue-skip`, `wild-draw-four`) are also accepted.

### Main UI (phone)
- **My hand:** a card picker grid (4 colors x 0-9/S/R/+2, plus W and W+4). Tap to add, tap a hand card to remove. Typing tokens is also supported (`R5 R+2 W`) for speed.
- **Top of pile:** pick the top card; if it's a wild, pick the active color.
- **Table:** number of players, each opponent's card count (+/- buttons), direction, pending draw penalty.
- **Live-game mode (later):** log each play as it happens so the discard history, card counts, and "drew on color X" hints fill in automatically.
- **Rules panel:** house-rule toggles, persisted in `localStorage`.

### Game state (JSON)
The UI builds this object; it can also be exported/imported or encoded in the URL to share a position.
```json
{
  "rules": { "stack_draw2": true, "stack_draw4": false },
  "hand": ["R5", "R+2", "G7", "W", "YS"],
  "discard": ["B3", "R3"],
  "active_color": "R",
  "pending_draw": 0,
  "direction": "clockwise",
  "players": [
    { "name": "me",    "cards": 5 },
    { "name": "next",  "cards": 2, "passed_on": ["G"] },
    { "name": "across","cards": 6 },
    { "name": "prev",  "cards": 4 }
  ]
}
```
- `discard` is the visible pile in order (top last). Only the top card is required; the rest improves card counting.
- `passed_on` records colors an opponent drew on rather than played, which hints they're out of that color.
- Missing fields fall back to sensible defaults (4 players, 7 cards each, no pending draw).

### Output
A ranked list shown as cards, best highlighted, each with a short reason, for example:
```
1. R+2      score 8.4  next player has 2 cards; makes them draw and skip
2. W -> R   score 5.1  works, but spends your only wild
3. R5       score 3.0
   draw     score -2.0
```

## 3. Move scoring

### Phase 1: heuristics (v1)
Every legal move (each playable card, each color choice for wilds, and "draw") gets a weighted score:

- **Threat response:** strongly prefer Skip, Reverse, Draw Two and Draw Four when the next player is at 1 or 2 cards.
- **Hand shedding:** prefer playing high numbers and action cards (penalty points if someone else goes out).
- **Color control:** after the move, how many of my cards match the new active color. For wilds, choose the color I hold most of, tie-broken by what opponents seem to lack.
- **Save flexibility:** penalize spending wilds early when a normal play exists; keep a wild as a finisher.
- **Opponent inference:** avoid switching to a color an opponent just played heavily; favor colors they passed on.
- **Stacking:** under stacking rules, decide whether to pass the penalty along or absorb it, based on remaining stackers in hand.
- **Endgame:** with 2 cards, plan the last two plays so the final card is guaranteed playable (wild or same color).

Weights live in one config so they can be tuned.

### Phase 2: card counting and simulation
- Track unseen cards (108 minus my hand minus the visible discard pile) to estimate the probability each opponent holds a given color or card.
- **Monte Carlo:** for each candidate move, sample many plausible deals of the unseen cards to opponents (constrained by known card counts and `passed_on` hints), play out a few turns or the full game with simple opponent policies, and score by win rate.
- **Expectimax (shallow):** an alternative for 2 to 3 ply lookahead with chance nodes for draws, useful in the 2-player game where the tree is small.
- Pick whichever gives better win rate per second in benchmarks; Monte Carlo is the likely winner with more than 2 players.

### Phase 3 (optional): tuning
- Self-play tournaments to tune heuristic weights, or use simulation results as training data for a small learned evaluator.

## 4. Architecture

```
src/
  engine/            pure TypeScript, no DOM or React imports
    cards.ts         Card, Color, Kind; token parse/format; deck builder
    rules.ts         RuleSet toggles; legalMoves(state); apply(state, move)
    state.ts         GameState, PlayerView; JSON (de)serialization
    heuristics.ts    weighted scoring of moves
    tracker.ts       unseen-card counting, opponent color inference
    search.ts        Monte Carlo / expectimax (phase 2)
    sim.ts           self-play simulator + bot policies
  worker/
    search.worker.ts runs search off the main thread (Web Worker)
  ui/                React components: CardPicker, Hand, Table, Results, RulesPanel
  main.tsx
scripts/
  bench.ts           self-play benchmarks, run with Node (`npm run bench`)
tests/
```
The engine is pure functions over immutable state, so the UI, the Web Worker, and Node benchmark scripts all share it. Search runs in a Web Worker with a time budget (e.g. 300 ms) so the page never freezes.

## 5. Milestones

1. **Scaffold:** Vite + React + TypeScript (strict), ESLint, Prettier, Vitest; `npm run check` runs lint, typecheck, tests.
2. **Cards and parsing:** card model, token parser with good error messages, deck builder.
3. **Rules engine:** legal moves and move application for the baseline rules, then each house-rule toggle.
4. **Heuristic recommender:** ranked moves with reasons, tested from scenarios.
5. **Mobile UI v1:** card picker, top card, opponent counts, rules panel, results. Deploy to a static host.
6. **Card tracker + live-game mode:** log plays turn by turn; tracker feeds the heuristics.
7. **Simulator + benchmarks:** self-play in Node with pluggable bots (random, greedy, heuristic).
8. **Monte Carlo / expectimax search** in a Web Worker; benchmark against heuristics.
9. **Polish:** PWA/offline, shareable position URLs, dark mode.

## 6. Testing

- **Unit tests (Vitest):** parser round-trips and invalid-token errors; deck composition (108 cards, correct counts); legal-move tables for each card type and each rule toggle; Wild Draw Four legality; stacking accumulation.
- **Scenario tests:** hand-written positions with a known best move (e.g. next player on 1 card and I hold a Draw Two), kept in `tests/scenarios/*.json` so new cases are cheap to add.
- **Property tests (fast-check):** card conservation (cards are never created or lost), every recommended move is legal, simulated games always terminate.
- **Component tests (Vitest + Testing Library):** picker adds/removes cards, results update when state changes.
- **End-to-end (Playwright, phone viewport):** enter a hand and top card, see the expected top recommendation.
- **Strength benchmarks:** win rate of each policy over thousands of self-play games (`npm run bench`); tracked over time so changes don't regress strength.

## Open questions

- Which house rules do you actually play with? Stacking defaults to off until confirmed.
- Where to host: GitHub Pages (needs a GitHub repo) or Vercel? Defaults to GitHub Pages.

# UNO Next-Move Calculator: Plan

Last updated: 2026-10-03

## Goal

Given my hand and what's on the discard pile (plus whatever I know about the other players), tell me which card to play, or whether to draw, and briefly why.

## Defaults chosen

These were picked where nothing was specified. Each one is easy to change.

| Decision | Default | Why |
|---|---|---|
| Language | Python 3.12, managed with `uv` | Fast to iterate on, good for simulation and tests. The system pyenv Python is 3.9, so `uv` supplies 3.12 per-project without touching it. |
| Interface | CLI first (`uno-calc`), web UI later as an option | Smallest useful thing. The engine is a pure library, so a UI can sit on top later. |
| Ruleset | Official Mattel rules, with house rules as toggles | One well-defined baseline; stacking and other house rules opt in. |
| Players | 2 to 10, default 4 | Matches the standard game. |
| Deps | Standard library for the engine; `pytest`, `ruff`, `mypy` for dev | Keeps the core portable. |

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

### Quick CLI form
```bash
uno-calc --hand "R5 R+2 G7 W YS" --top R3
uno-calc --hand "R5 G7 W" --top W --color G --pending-draw 2
```

### Full state (JSON or YAML file, `uno-calc --state game.json`)
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
A ranked list with a short reason for each, for example:
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
src/uno_calc/
  cards.py      Card, Color, Kind; parsing and formatting of tokens
  rules.py      RuleSet toggles; legal_moves(state); apply(state, move)
  state.py      GameState, PlayerView; JSON/YAML loading
  heuristics.py weighted scoring of moves
  tracker.py    unseen-card counting, opponent color inference
  search.py     Monte Carlo / expectimax (phase 2)
  cli.py        argparse entry point, pretty output
tests/
```
The engine is pure functions over immutable state, so the CLI, a future web UI, and the simulator all share it.

## 5. Milestones

1. **Scaffold:** `uv` project, `pyproject.toml`, ruff, mypy, pytest, CI-free local `make check`.
2. **Cards and parsing:** card model, token parser with good error messages, deck builder.
3. **Rules engine:** legal moves and move application for the baseline rules, then each house-rule toggle.
4. **Heuristic recommender + CLI:** ranked moves with reasons; quick and full-state input.
5. **Card tracker:** unseen-card counting and opponent color inference feeding the heuristics.
6. **Simulator:** full-game self-play with pluggable policies (random, greedy, heuristic).
7. **Monte Carlo / expectimax search:** benchmark against heuristics via the simulator.
8. **Polish:** interactive mode that tracks a live game turn by turn; optional web UI.

## 6. Testing

- **Unit tests (pytest):** parser round-trips and invalid-token errors; deck composition (108 cards, correct counts); legal-move tables for each card type and each rule toggle; Wild Draw Four legality; stacking accumulation.
- **Scenario tests:** hand-written positions with a known best move (e.g. next player on 1 card and I hold a Draw Two), kept in `tests/scenarios/*.json` so new cases are cheap to add.
- **Property tests (hypothesis):** card conservation (cards are never created or lost), every recommended move is legal, simulated games always terminate.
- **Strength benchmarks:** win rate of each policy over N thousand self-play games against baseline bots; tracked over time so changes don't regress strength.
- **Static checks:** ruff and mypy in `make check`.

## Open questions

- Which house rules do you actually play with? Stacking defaults to off until confirmed.
- Is a CLI fine for v1, or do you want to use this at the table on a phone (which would push the web UI earlier)?

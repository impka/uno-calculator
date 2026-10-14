# uno-calculator

A mobile-friendly web app that suggests the best next move in UNO given your hand, the top card, and how many cards each opponent holds.

Enter your hand (tap cards or type `R5 G+2 BS YR W W+4`), pick the top card (and the color named, if it's a wild), and set opponents' card counts. Every legal move, including drawing, is ranked by its simulated win chance with a short reason.

## How it decides

Flat Monte Carlo: deal many guesses of the opponents' hidden hands from the cards you can't see, play each candidate move out to the end of the game with every player following the longest-color rule, and rank moves by how often you win. Moves too close to separate are ordered by the longest-color rule. See [PLAN.md](PLAN.md) for the full plan.

Benchmark against random opponents, 2 players (`npm run bench`): longest-color rule alone 62.6%, Monte Carlo with 1000 playouts 68.7%, at about 5 ms per decision.

## Development

```bash
npm install
npm run dev        # local dev server
npm run check      # typecheck + tests
npm run build      # static site in dist/
npm run bench -- mc 2 1500 1000   # strategy, players, games, playouts
```

Engine code lives in `src/engine` (no DOM or React imports); the UI is in `src/ui`.

Status: milestone 1 (official rules, no house rules yet).

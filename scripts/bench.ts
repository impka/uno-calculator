// Win rate of a strategy (seat 0) against random players, official rules.
// Usage: npm run bench -- <longest|random|mc> <players> <games> [playouts]
import { Game, type Policy, longestColorPolicy, randomPolicy, seededRng } from "../src/engine/sim";
import { monteCarlo } from "../src/engine/search";
import type { Color } from "../src/engine/cards";
import { sameMove } from "../src/engine/rules";

const [name = "mc", playersArg = "2", gamesArg = "400", playoutsArg = "1000"] = process.argv.slice(2);
const players = Number(playersArg);
const games = Number(gamesArg);
const rng = seededRng(12345);

function mcPolicy(playouts: number): Policy {
  return (g, moves) => {
    const hand = g.hands[g.cur]!;
    const opponents = Array.from({ length: g.n - 1 }, (_, k) => g.hands[(((g.cur + g.dir * (k + 1)) % g.n) + g.n) % g.n]!.length);
    const pos = { hand, top: g.discard[g.discard.length - 1]!, activeColor: g.color as Color, opponents, discard: g.discard.slice(0, -1) };
    const evals = monteCarlo(pos, { playouts, rng }).filter((e) => e.move.kind === "play");
    const top = evals.reduce((a, b) => (b.winRate > a.winRate ? b : a));
    return moves.find((m) => sameMove({ kind: "play", card: hand[m.index]!, color: m.color }, top.move)) ?? moves[0]!;
  };
}

const policy: Policy = name === "longest" ? longestColorPolicy : name === "random" ? randomPolicy : mcPolicy(Number(playoutsArg));
let wins = 0;
let decisions = 0;
let ms = 0;
const timed: Policy = (g, moves) => {
  const t = performance.now();
  const m = policy(g, moves);
  ms += performance.now() - t;
  decisions++;
  return m;
};
for (let i = 0; i < games; i++) {
  const g = Game.deal(players, rng);
  const pols = Array.from({ length: players }, (_, k) => (k === 0 ? timed : randomPolicy));
  if (g.run(pols) === 0) wins++;
}
const rate = wins / games;
const ci = 1.96 * Math.sqrt((rate * (1 - rate)) / games);
console.log(
  `${name} players=${players} games=${games} win=${(rate * 100).toFixed(1)}% ±${(ci * 100).toFixed(1)} ms/decision=${(ms / Math.max(1, decisions)).toFixed(2)}`,
);

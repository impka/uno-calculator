import type { Card } from "./cards";
import { type Position, type Move, legalMoves, unseenCards } from "./rules";
import { Game, type Policy, type Rng, longestColorPolicy, shuffle } from "./sim";

export interface MoveEval {
  move: Move;
  wins: number;
  playouts: number;
  /** Fraction of playouts I won after making this move. */
  winRate: number;
}

export interface SearchOptions {
  /** Total playouts, split evenly across the legal moves. */
  playouts?: number;
  /** Floor on playouts per move so no move is judged on a handful of games. */
  minPerMove?: number;
  rng?: Rng;
  /** How every player (me included) plays after the first move. */
  rollout?: Policy;
}

/** Deal one guess of the hidden cards that fits the known card counts. Seat 0 is me. */
export function determinize(pos: Position, unseen: readonly Card[], rng: Rng): Game {
  const pool = shuffle(unseen.slice(), rng);
  const hands: Card[][] = [pos.hand.slice()];
  for (const n of pos.opponents) hands.push(pool.splice(pool.length - n, n));
  const discard = [...(pos.discard ?? []), pos.top];
  return new Game(hands, pool, discard, pos.activeColor, 0, 1, rng);
}

/** Apply my first move in a sampled game, then play the game out. Returns the winner. */
function playout(game: Game, move: Move, rollout: Policy): number {
  const policies = new Array<Policy>(game.n).fill(rollout);
  let w: number;
  if (move.kind === "draw") {
    w = game.drawAndMaybePlay(rollout);
  } else {
    const index = game.hands[0]!.indexOf(move.card);
    w = game.play({ index, color: move.color });
  }
  return w >= 0 ? w : game.run(policies, 1500);
}

/**
 * Flat Monte Carlo over determinizations. Each sampled deal is reused for every
 * candidate move, so moves are compared on the same hidden cards.
 */
export function monteCarlo(pos: Position, opts: SearchOptions = {}): MoveEval[] {
  const { playouts = 1000, minPerMove = 60, rng = Math.random, rollout = longestColorPolicy } = opts;
  const moves = legalMoves(pos);
  const unseen = unseenCards(pos);
  const perMove = Math.max(minPerMove, Math.ceil(playouts / moves.length));
  const wins = new Array<number>(moves.length).fill(0);
  for (let i = 0; i < perMove; i++) {
    const deal = determinize(pos, unseen, rng);
    moves.forEach((m, k) => {
      if (playout(deal.clone(), m, rollout) === 0) wins[k]! += 1;
    });
  }
  return moves.map((move, k) => ({ move, wins: wins[k]!, playouts: perMove, winRate: wins[k]! / perMove }));
}

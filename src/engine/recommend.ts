import {
  COLOR_NAMES,
  DRAW_TWO,
  REVERSE,
  SKIP,
  WILD,
  WILD_DRAW_FOUR,
  isWild,
  points,
  rankOf,
} from "./cards";
import { type Move, type Position, legalMoves } from "./rules";
import { type MoveEval, type SearchOptions, monteCarlo } from "./search";
import { colorCounts, longestColor } from "./sim";

export interface Recommendation {
  move: Move;
  /** Simulated win chance after this move, 0-1. */
  winRate: number;
  playouts: number;
  /** Short plain-language notes on why the move is good or bad. */
  reasons: string[];
}

/**
 * Longest-color score for a move: higher is better. Used as the instant answer
 * and to break ties between moves the simulation can't separate.
 */
export function heuristicScore(pos: Position, move: Move): number {
  if (move.kind === "draw") return -2000;
  const idx = pos.hand.indexOf(move.card);
  if (isWild(move.card)) return -1000 + (move.color === longestColor(pos.hand, idx) ? 1 : 0);
  return colorCounts(pos.hand)[move.color]! * 100 + points(move.card);
}

/** The longest-color rule's pick, without any simulation. */
export function quickPick(pos: Position): Move {
  const moves = legalMoves(pos);
  return moves.reduce((best, m) => (heuristicScore(pos, m) > heuristicScore(pos, best) ? m : best));
}

/** Plain-language notes for a move. */
export function explain(pos: Position, move: Move): string[] {
  const notes: string[] = [];
  const next = pos.opponents[0] ?? 7;
  const twoPlayer = pos.opponents.length === 1;
  const playable = legalMoves(pos).filter((m) => m.kind === "play");

  if (move.kind === "draw") {
    notes.push(playable.length === 0 ? "No card fits, so you must draw." : "Keeps your cards, but adds one to your hand.");
    return notes;
  }

  const left = pos.hand.length - 1;
  if (left === 0) return ["Goes out and wins the game."];

  const card = move.card;
  const rank = rankOf(card);
  const counts = colorCounts(pos.hand, pos.hand.indexOf(card));
  const colorName = COLOR_NAMES[move.color];
  const sameColorLeft = counts[move.color]!;
  const longest = longestColor(pos.hand, pos.hand.indexOf(card));

  if (isWild(card)) {
    const others = playable.filter((m) => m.kind === "play" && !isWild(m.card));
    notes.push(others.length === 0 ? "Your only playable option." : "Spends a wild while you have other plays.");
    if (move.color === longest && sameColorLeft > 0) {
      notes.push(`Names ${colorName}, your longest color (${sameColorLeft} left).`);
    } else if (sameColorLeft === 0) {
      notes.push(`You hold no ${colorName} cards to follow up with.`);
    }
  } else if (sameColorLeft > 0) {
    const tag = move.color === longest ? `, your longest color` : "";
    notes.push(`Keeps play in ${colorName}${tag}: ${sameColorLeft} more ${colorName} card${sameColorLeft === 1 ? "" : "s"} in hand.`);
  } else if (move.color !== pos.activeColor) {
    notes.push(`Switches to ${colorName}, but you have no more ${colorName}.`);
  } else {
    notes.push(`Your last ${colorName} card.`);
  }

  const hits =
    rank === SKIP || (rank === REVERSE && twoPlayer)
      ? "skips them"
      : rank === DRAW_TWO
        ? "makes them draw 2 and skip"
        : rank === WILD_DRAW_FOUR
          ? "makes them draw 4 and skip"
          : rank === REVERSE
            ? "reverses play away from them"
            : "";
  if (hits && next <= 2) notes.push(`Next player has ${next} card${next === 1 ? "" : "s"}: this ${hits}.`);
  else if (hits && rank !== REVERSE) notes.push(`Uses an action card that could be saved for later.`);
  if (rank === REVERSE && twoPlayer && !(next <= 2)) notes.push("In a 2-player game Reverse acts as a Skip: you go again.");

  if (rank !== WILD && rank !== WILD_DRAW_FOUR && points(card) >= 20 && notes.length < 3) {
    notes.push("Sheds a 20-point card.");
  }
  if (left === 1) notes.push("Leaves you one card: say UNO!");
  return notes;
}

/** Rank every legal move by simulated win rate, best first. */
export function recommend(pos: Position, opts: SearchOptions = {}): Recommendation[] {
  const evals: MoveEval[] = monteCarlo(pos, opts);
  const sorted = evals
    .slice()
    .sort((a, b) => b.winRate - a.winRate || heuristicScore(pos, b.move) - heuristicScore(pos, a.move));
  // Moves within one standard error of the leader are effectively tied with it;
  // order that band by the longest-color rule, which is right more often than noise.
  const best = sorted[0]!;
  const se = Math.sqrt((2 * best.winRate * (1 - best.winRate) + 0.01) / Math.max(1, best.playouts));
  const band = sorted.filter((e) => best.winRate - e.winRate <= se);
  band.sort((a, b) => heuristicScore(pos, b.move) - heuristicScore(pos, a.move));
  sorted.splice(0, band.length, ...band);
  return sorted.map((e) => ({
    move: e.move,
    winRate: e.winRate,
    playouts: e.playouts,
    reasons: explain(pos, e.move),
  }));
}

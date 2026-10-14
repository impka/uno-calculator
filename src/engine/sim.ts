import {
  type Card,
  type Color,
  DRAW_TWO,
  REVERSE,
  SKIP,
  WILD_DRAW_FOUR,
  colorOf,
  fullDeck,
  isWild,
  points,
  rankOf,
} from "./cards";
import { canPlay } from "./rules";

export type Rng = () => number;

/** Small fast seeded PRNG (mulberry32), returns floats in [0, 1). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(xs: T[], rng: Rng): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [xs[i], xs[j]] = [xs[j]!, xs[i]!];
  }
  return xs;
}

/** A play in the simulator: index into the current hand and the color it sets. */
export interface SimMove {
  index: number;
  color: Color;
}

/** Picks one of several legal moves for the current player. */
export type Policy = (g: Game, moves: SimMove[]) => SimMove;

/**
 * Full-information game used for playouts. Official rules, no stacking:
 * draw one when you can't (or choose not to) play, and play it if you can.
 */
export class Game {
  hands: Card[][];
  deck: Card[];
  discard: Card[];
  color: number;
  rank: number;
  cur: number;
  dir: 1 | -1;
  readonly rng: Rng;

  constructor(hands: Card[][], deck: Card[], discard: Card[], color: number, cur: number, dir: 1 | -1, rng: Rng) {
    this.hands = hands;
    this.deck = deck;
    this.discard = discard;
    this.color = color;
    this.rank = rankOf(discard[discard.length - 1]!);
    this.cur = cur;
    this.dir = dir;
    this.rng = rng;
  }

  /** Deal a fresh game, starting on a number card. */
  static deal(players: number, rng: Rng, handSize = 7): Game {
    const deck = shuffle(fullDeck(), rng);
    const hands = Array.from({ length: players }, () => deck.splice(deck.length - handSize, handSize));
    let i = deck.length - 1;
    while (rankOf(deck[i]!) >= SKIP) i--;
    const top = deck.splice(i, 1)[0]!;
    return new Game(hands, deck, [top], colorOf(top), Math.floor(rng() * players), 1, rng);
  }

  get n(): number {
    return this.hands.length;
  }

  clone(): Game {
    return new Game(
      this.hands.map((h) => h.slice()),
      this.deck.slice(),
      this.discard.slice(),
      this.color,
      this.cur,
      this.dir,
      this.rng,
    );
  }

  next(k = 1): number {
    return (((this.cur + this.dir * k) % this.n) + this.n) % this.n;
  }

  drawCards(p: number, k: number): void {
    const hand = this.hands[p]!;
    for (let i = 0; i < k; i++) {
      if (this.deck.length === 0) {
        if (this.discard.length <= 1) return;
        const top = this.discard.pop()!;
        this.deck = shuffle(this.discard, this.rng);
        this.discard = [top];
      }
      hand.push(this.deck.pop()!);
    }
  }

  /** Legal plays for a hand; each distinct card once, wilds once per color. */
  moves(hand: Card[], onlyIndex = -1): SimMove[] {
    const out: SimMove[] = [];
    const seen = new Set<Card>();
    for (let i = onlyIndex < 0 ? 0 : onlyIndex; i < (onlyIndex < 0 ? hand.length : onlyIndex + 1); i++) {
      const c = hand[i]!;
      if (seen.has(c) || !canPlay(c, this.color, this.rank, hand)) continue;
      seen.add(c);
      if (isWild(c)) for (let col = 0; col < 4; col++) out.push({ index: i, color: col as Color });
      else out.push({ index: i, color: colorOf(c) as Color });
    }
    return out;
  }

  /** Current player plays a card. Returns the winner's seat, or -1. */
  play(m: SimMove): number {
    const p = this.cur;
    const card = this.hands[p]!.splice(m.index, 1)[0]!;
    this.discard.push(card);
    this.color = m.color;
    this.rank = rankOf(card);
    if (this.hands[p]!.length === 0) return p;
    const r = this.rank;
    if (r === SKIP || (r === REVERSE && this.n === 2)) {
      this.cur = this.next(2);
    } else if (r === REVERSE) {
      this.dir = this.dir === 1 ? -1 : 1;
      this.cur = this.next(1);
    } else if (r === DRAW_TWO || r === WILD_DRAW_FOUR) {
      this.drawCards(this.next(1), r === DRAW_TWO ? 2 : 4);
      this.cur = this.next(2);
    } else {
      this.cur = this.next(1);
    }
    return -1;
  }

  /** Current player draws one card and plays it if possible. Returns the winner or -1. */
  drawAndMaybePlay(policy: Policy): number {
    const hand = this.hands[this.cur]!;
    const before = hand.length;
    this.drawCards(this.cur, 1);
    const moves = hand.length > before ? this.moves(hand, hand.length - 1) : [];
    if (moves.length === 0) {
      this.cur = this.next(1);
      return -1;
    }
    return this.play(moves.length === 1 ? moves[0]! : policy(this, moves));
  }

  /** One turn for the current player. Returns the winner or -1. */
  step(policies: readonly Policy[]): number {
    const policy = policies[this.cur]!;
    const moves = this.moves(this.hands[this.cur]!);
    if (moves.length === 0) return this.drawAndMaybePlay(policy);
    return this.play(moves.length === 1 ? moves[0]! : policy(this, moves));
  }

  /** Play until someone wins. Returns the winner, or -1 if the turn cap is hit. */
  run(policies: readonly Policy[], cap = 2000): number {
    for (let i = 0; i < cap; i++) {
      const w = this.step(policies);
      if (w >= 0) return w;
    }
    return -1;
  }

  cardCount(): number {
    return this.hands.reduce((a, h) => a + h.length, 0) + this.deck.length + this.discard.length;
  }
}

export const randomPolicy: Policy = (g, moves) => moves[Math.floor(g.rng() * moves.length)]!;

/** Count of each color in a hand, ignoring wilds and optionally one index. */
export function colorCounts(hand: readonly Card[], skipIndex = -1): number[] {
  const counts = [0, 0, 0, 0];
  hand.forEach((c, i) => {
    if (i !== skipIndex && !isWild(c)) counts[colorOf(c)]! += 1;
  });
  return counts;
}

/** The color held most often (first one wins ties). */
export function longestColor(hand: readonly Card[], skipIndex = -1): Color {
  const counts = colorCounts(hand, skipIndex);
  let best = 0;
  for (let c = 1; c < 4; c++) if (counts[c]! > counts[best]!) best = c;
  return best as Color;
}

/**
 * Longest-color rule ("MostCommonSuit"): stay in the color you hold most of,
 * play wilds last (naming your longest color), and shed high-point cards first.
 */
export const longestColorPolicy: Policy = (g, moves) => {
  const hand = g.hands[g.cur]!;
  const counts = colorCounts(hand);
  let best = moves[0]!;
  let bestScore = -Infinity;
  for (const m of moves) {
    const c = hand[m.index]!;
    const score = isWild(c)
      ? -1000 + (m.color === longestColor(hand, m.index) ? 1 : 0)
      : counts[m.color]! * 100 + points(c);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
};

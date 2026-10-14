import {
  type Card,
  type Color,
  COLORS,
  DECK_COUNTS,
  DRAW_TWO,
  REVERSE,
  SKIP,
  WILD,
  WILD_DRAW_FOUR,
  colorOf,
  formatCard,
  isWild,
  rankOf,
  COLOR_LETTERS,
} from "./cards";

/** What the player can see on their turn. */
export interface Position {
  /** My cards. */
  hand: Card[];
  /** Top card of the discard pile. */
  top: Card;
  /** Color in play: the top card's color, or the color named for a wild. */
  activeColor: Color;
  /** Opponents' card counts in turn order, starting with the next player. */
  opponents: number[];
  /** Other visible discard-pile cards (beneath the top), for card counting. */
  discard?: Card[];
}

export type Move = { kind: "play"; card: Card; color: Color } | { kind: "draw" };

export const DRAW: Move = { kind: "draw" };

export function canPlay(card: Card, activeColor: number, topRank: number, hand: readonly Card[]): boolean {
  if (rankOf(card) === WILD) return true;
  if (rankOf(card) === WILD_DRAW_FOUR) return !hand.some((c) => colorOf(c) === activeColor);
  return colorOf(card) === activeColor || rankOf(card) === topRank;
}

/** Distinct playable cards (each wild once per color), plus drawing. */
export function legalMoves(pos: Position): Move[] {
  const moves: Move[] = [];
  const seen = new Set<Card>();
  const topRank = rankOf(pos.top);
  for (const card of pos.hand) {
    if (seen.has(card) || !canPlay(card, pos.activeColor, topRank, pos.hand)) continue;
    seen.add(card);
    if (isWild(card)) {
      for (const color of COLORS) moves.push({ kind: "play", card, color });
    } else {
      moves.push({ kind: "play", card, color: colorOf(card) as Color });
    }
  }
  moves.push(DRAW);
  return moves;
}

export function formatMove(m: Move): string {
  if (m.kind === "draw") return "draw";
  return isWild(m.card) ? `${formatCard(m.card)} -> ${COLOR_LETTERS[m.color]}` : formatCard(m.card);
}

export function sameMove(a: Move, b: Move): boolean {
  if (a.kind === "draw" || b.kind === "draw") return a.kind === b.kind;
  return a.card === b.card && a.color === b.color;
}

export const isAction = (c: Card): boolean => {
  const r = rankOf(c);
  return r === SKIP || r === REVERSE || r === DRAW_TWO || r === WILD_DRAW_FOUR;
};

/**
 * Cards I can't see: the full deck minus my hand and the visible discard pile.
 * Throws if the input uses more copies of a card than the deck has.
 */
export function unseenCards(pos: Position): Card[] {
  const counts = [...DECK_COUNTS];
  for (const c of [...pos.hand, pos.top, ...(pos.discard ?? [])]) {
    counts[c]! -= 1;
    if (counts[c]! < 0) {
      throw new Error(`Too many ${formatCard(c)} cards: a deck has only ${DECK_COUNTS[c]}.`);
    }
  }
  const out: Card[] = [];
  counts.forEach((n, c) => {
    for (let i = 0; i < n; i++) out.push(c);
  });
  return out;
}

/** Problems with a position that make it impossible to analyze. */
export function validatePosition(pos: Position): string[] {
  const errors: string[] = [];
  if (pos.hand.length === 0) errors.push("Add the cards in your hand.");
  if (pos.opponents.length < 1 || pos.opponents.length > 9) errors.push("UNO needs 2 to 10 players.");
  if (pos.opponents.some((n) => !Number.isInteger(n) || n < 1)) {
    errors.push("Every opponent must hold at least one card (otherwise the game is over).");
  }
  if (!isWild(pos.top) && colorOf(pos.top) !== pos.activeColor) {
    errors.push("The active color must match the top card unless the top card is a wild.");
  }
  try {
    const unseen = unseenCards(pos);
    const held = pos.opponents.reduce((a, b) => a + b, 0);
    if (held > unseen.length) {
      errors.push(`Opponents hold ${held} cards, but only ${unseen.length} cards are unaccounted for.`);
    }
  } catch (e) {
    errors.push((e as Error).message);
  }
  return errors;
}

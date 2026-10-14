import { describe, expect, it } from "vitest";
import { WILD_DRAW_FOUR_CARD, parseCard, parseCards } from "../src/engine/cards";
import { type Position, formatMove, legalMoves, unseenCards, validatePosition } from "../src/engine/rules";

const pos = (hand: string, top: string, activeColor: 0 | 1 | 2 | 3, opponents = [7, 7, 7]): Position => ({
  hand: parseCards(hand),
  top: parseCard(top),
  activeColor,
  opponents,
});

const moveTokens = (p: Position) => legalMoves(p).map(formatMove);

describe("legalMoves", () => {
  it("matches color, number and symbol, and always allows drawing", () => {
    expect(moveTokens(pos("R2 B5 GS Y9", "B9", 3))).toEqual(["B5", "Y9", "draw"]);
    expect(moveTokens(pos("RS GS Y1", "BS", 3))).toEqual(["RS", "GS", "draw"]);
  });

  it("uses the active color named for a wild", () => {
    expect(moveTokens(pos("R2 G5", "W", 2))).toEqual(["G5", "draw"]);
  });

  it("lists a wild once per color and duplicates once", () => {
    expect(moveTokens(pos("W W R1 R1", "B2", 3))).toEqual(["W -> R", "W -> Y", "W -> G", "W -> B", "draw"]);
  });

  it("allows Wild Draw Four only without a card of the active color", () => {
    expect(moveTokens(pos("W+4 B1", "R3", 0))).toEqual(["W+4 -> R", "W+4 -> Y", "W+4 -> G", "W+4 -> B", "draw"]);
    // B3 matches by number but not color, so W+4 is still legal.
    expect(moveTokens(pos("W+4 B3", "R3", 0))).toContain("W+4 -> B");
    expect(moveTokens(pos("W+4 R1", "R3", 0))).toEqual(["R1", "draw"]);
  });
});

describe("unseenCards and validatePosition", () => {
  it("removes my hand and visible discards from the deck", () => {
    const p = { ...pos("W+4 W+4 R5", "W+4", 0), discard: parseCards("R5") };
    const unseen = unseenCards(p);
    expect(unseen).toHaveLength(108 - 5);
    expect(unseen.filter((c) => c === WILD_DRAW_FOUR_CARD)).toHaveLength(1);
  });

  it("flags impossible input", () => {
    expect(validatePosition(pos("R0 R0", "R5", 0))).toContain("Too many R0 cards: a deck has only 1.");
    expect(validatePosition(pos("", "R5", 0))).toContain("Add the cards in your hand.");
    expect(validatePosition(pos("R1", "R5", 2)).join()).toMatch(/active color/);
    expect(validatePosition(pos("R1", "R5", 0, [0]))).toHaveLength(1);
    expect(validatePosition(pos("R1", "R5", 0))).toEqual([]);
  });
});

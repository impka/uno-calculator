import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  CardParseError,
  DECK_COUNTS,
  DISTINCT_CARDS,
  WILD_CARD,
  WILD_DRAW_FOUR_CARD,
  formatCard,
  fullDeck,
  isWild,
  makeCard,
  parseCard,
  parseCards,
  REVERSE,
  DRAW_TWO,
  SKIP,
} from "../src/engine/cards";

describe("deck", () => {
  it("has 108 cards with the official mix", () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(108);
    expect(deck.filter(isWild)).toHaveLength(8);
    expect(deck.filter((c) => c === makeCard(0, 0))).toHaveLength(1);
    expect(deck.filter((c) => c === makeCard(3, 7))).toHaveLength(2);
    expect(deck.filter((c) => c === makeCard(2, DRAW_TWO))).toHaveLength(2);
    expect(DECK_COUNTS[WILD_DRAW_FOUR_CARD]).toBe(4);
    expect(DISTINCT_CARDS).toHaveLength(54);
  });
});

describe("parseCard", () => {
  it.each([
    ["R5", makeCard(0, 5)],
    ["g0", makeCard(2, 0)],
    ["BS", makeCard(3, SKIP)],
    ["YR", makeCard(1, REVERSE)],
    ["R+2", makeCard(0, DRAW_TWO)],
    ["W", WILD_CARD],
    ["W+4", WILD_DRAW_FOUR_CARD],
    ["red-5", makeCard(0, 5)],
    ["blue-skip", makeCard(3, SKIP)],
    ["yellow-draw-two", makeCard(1, DRAW_TWO)],
    ["green-reverse", makeCard(2, REVERSE)],
    ["wild-draw-four", WILD_DRAW_FOUR_CARD],
    ["RR", makeCard(0, REVERSE)],
  ])("parses %s", (token, card) => {
    expect(parseCard(token)).toBe(card);
  });

  it("round-trips every distinct card through its token", () => {
    fc.assert(
      fc.property(fc.constantFrom(...DISTINCT_CARDS), (c) => {
        expect(parseCard(formatCard(c))).toBe(c);
        expect(parseCard(formatCard(c).toLowerCase())).toBe(c);
      }),
    );
  });

  it.each(["", "X5", "R10", "Rx", "+2", "purple-5"])("rejects %j with a helpful error", (bad) => {
    expect(() => parseCard(bad)).toThrow(CardParseError);
  });

  it("parses lists separated by spaces or commas", () => {
    expect(parseCards("R5, R+2  W\nYS").map(formatCard)).toEqual(["R5", "R+2", "W", "YS"]);
  });
});

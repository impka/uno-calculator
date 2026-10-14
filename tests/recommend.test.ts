import { describe, expect, it } from "vitest";
import { parseCard, parseCards } from "../src/engine/cards";
import { type Position, formatMove, legalMoves } from "../src/engine/rules";
import { explain, quickPick, recommend } from "../src/engine/recommend";
import { seededRng } from "../src/engine/sim";

const pos = (hand: string, top: string, activeColor: 0 | 1 | 2 | 3, opponents = [7, 7, 7]): Position => ({
  hand: parseCards(hand),
  top: parseCard(top),
  activeColor,
  opponents,
});

const best = (p: Position, seed = 1) => formatMove(recommend(p, { playouts: 1000, rng: seededRng(seed) })[0]!.move);

describe("recommend", () => {
  it("plays the last card to win", () => {
    const recs = recommend(pos("R7", "R2", 0), { playouts: 200, rng: seededRng(1) });
    expect(formatMove(recs[0]!.move)).toBe("R7");
    expect(recs[0]!.winRate).toBe(1);
    expect(recs[0]!.reasons).toEqual(["Goes out and wins the game."]);
  });

  it("returns every legal move exactly once", () => {
    const p = pos("R1 R2 W G2 B+2", "R5", 0);
    const recs = recommend(p, { playouts: 300, rng: seededRng(2) });
    expect(recs.map((r) => formatMove(r.move)).sort()).toEqual(legalMoves(p).map(formatMove).sort());
  });

  it("stops a player on one card with a Draw Two", () => {
    // Next player is about to go out; R+2 makes them draw and skips them.
    expect(best(pos("R+2 R3 G7 G8", "R5", 0, [1, 6]))).toBe("R+2");
  });

  it("keeps play in the longest color and saves the wild", () => {
    // Top Y5: B5 or R5 match by number; red is the longest color.
    const p = pos("B5 R5 R7 R9 W", "Y5", 1);
    expect(quickPick(p)).toEqual({ kind: "play", card: parseCard("R5"), color: 0 });
    expect(best(p)).toBe("R5");
  });

  it("finishes a two-card hand with a playable second card", () => {
    // Playing W leaves R1 which may get stranded; playing R1 keeps the wild as a guaranteed finisher.
    expect(best(pos("R1 W", "R5", 0, [5, 5]))).toBe("R1");
  });
});

describe("explain", () => {
  it("reminds about UNO and describes the color", () => {
    expect(explain(pos("R1 R2 G3", "R5", 0), { kind: "play", card: parseCard("R1"), color: 0 })).toEqual([
      "Keeps play in red, your longest color: 1 more red card in hand.",
    ]);
    expect(explain(pos("R1 G3", "R5", 0), { kind: "play", card: parseCard("R1"), color: 0 })).toContain(
      "Leaves you one card: say UNO!",
    );
  });
});

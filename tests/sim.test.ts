import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Game, longestColorPolicy, randomPolicy, seededRng } from "../src/engine/sim";
import { parseCards, fullDeck } from "../src/engine/cards";

describe("Game", () => {
  it("conserves all 108 cards and always finishes", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 10 }), fc.integer(), (players, seed) => {
        const g = Game.deal(players, seededRng(seed));
        const policies = Array.from({ length: players }, (_, i) => (i % 2 ? randomPolicy : longestColorPolicy));
        for (let i = 0; i < 3000; i++) {
          const w = g.step(policies);
          expect(g.cardCount()).toBe(108);
          if (w >= 0) {
            expect(g.hands[w]).toHaveLength(0);
            return;
          }
        }
        throw new Error("game did not finish");
      }),
      { numRuns: 200 },
    );
  });

  it("applies Draw Two, Skip and Reverse", () => {
    const deck = fullDeck();
    const mk = (hands: string[], top: string, color: number) =>
      new Game(hands.map(parseCards), deck.slice(0, 20), parseCards(top), color, 0, 1, seededRng(1));

    let g = mk(["R+2 G1", "B1", "B2", "B3"], "R5", 0);
    g.play({ index: 0, color: 0 });
    expect(g.hands[1]).toHaveLength(3);
    expect(g.cur).toBe(2);

    g = mk(["RS G1", "B1", "B2", "B3"], "R5", 0);
    g.play({ index: 0, color: 0 });
    expect(g.cur).toBe(2);

    g = mk(["RR G1", "B1", "B2", "B3"], "R5", 0);
    g.play({ index: 0, color: 0 });
    expect(g.cur).toBe(3);
    expect(g.dir).toBe(-1);

    g = mk(["RR G1", "B1"], "R5", 0);
    g.play({ index: 0, color: 0 });
    expect(g.cur).toBe(0);
  });

  it("longest-color policy beats random players", () => {
    const rng = seededRng(7);
    let wins = 0;
    const games = 3000;
    for (let i = 0; i < games; i++) {
      const g = Game.deal(2, rng);
      if (g.run([longestColorPolicy, randomPolicy]) === 0) wins++;
    }
    // Research benchmark: ~62% in 2-player.
    expect(wins / games).toBeGreaterThan(0.56);
  });
});

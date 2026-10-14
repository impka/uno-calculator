// Cards are small integers so the simulator can copy hands cheaply:
// card = color * 15 + rank. Colored cards use colors 0-3 and ranks 0-12;
// the two wild kinds use color 4 with ranks 13 and 14.

export type Color = 0 | 1 | 2 | 3;
export type Card = number;

export const RED = 0;
export const YELLOW = 1;
export const GREEN = 2;
export const BLUE = 3;
export const WILD_COLOR = 4;

export const SKIP = 10;
export const REVERSE = 11;
export const DRAW_TWO = 12;
export const WILD = 13;
export const WILD_DRAW_FOUR = 14;

export const COLORS: readonly Color[] = [0, 1, 2, 3];
export const COLOR_LETTERS = ["R", "Y", "G", "B"] as const;
export const COLOR_NAMES = ["red", "yellow", "green", "blue"] as const;

export const colorOf = (c: Card): number => Math.floor(c / 15);
export const rankOf = (c: Card): number => c % 15;
export const isWild = (c: Card): boolean => c >= 60;
export const makeCard = (color: number, rank: number): Card => color * 15 + rank;

export const WILD_CARD: Card = makeCard(WILD_COLOR, WILD);
export const WILD_DRAW_FOUR_CARD: Card = makeCard(WILD_COLOR, WILD_DRAW_FOUR);

/** All 108 cards of a standard deck. */
export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const c of COLORS) {
    deck.push(makeCard(c, 0));
    for (let r = 1; r <= DRAW_TWO; r++) deck.push(makeCard(c, r), makeCard(c, r));
  }
  for (let i = 0; i < 4; i++) deck.push(WILD_CARD, WILD_DRAW_FOUR_CARD);
  return deck;
}

/** Number of copies of each card in a full deck, indexed by card id. */
export const DECK_COUNTS: readonly number[] = (() => {
  const counts = new Array<number>(75).fill(0);
  for (const c of fullDeck()) counts[c]! += 1;
  return counts;
})();

/** Every distinct card, in picker order. */
export const DISTINCT_CARDS: readonly Card[] = DECK_COUNTS.flatMap((n, c) => (n > 0 ? [c] : []));

/** Penalty points a card is worth when left in hand. */
export function points(c: Card): number {
  const r = rankOf(c);
  if (r < 10) return r;
  return r < WILD ? 20 : 50;
}

const RANK_TOKENS: Record<number, string> = { [SKIP]: "S", [REVERSE]: "R", [DRAW_TWO]: "+2" };

/** Short token, e.g. R5, BS, YR, G+2, W, W+4. */
export function formatCard(c: Card): string {
  const r = rankOf(c);
  if (r === WILD) return "W";
  if (r === WILD_DRAW_FOUR) return "W+4";
  return COLOR_LETTERS[colorOf(c)]! + (RANK_TOKENS[r] ?? String(r));
}

const RANK_LABELS: Record<number, string> = {
  [SKIP]: "Skip",
  [REVERSE]: "Reverse",
  [DRAW_TWO]: "Draw Two",
  [WILD]: "Wild",
  [WILD_DRAW_FOUR]: "Wild Draw Four",
};

/** Human label, e.g. "red 5", "blue Skip", "Wild Draw Four". */
export function describeCard(c: Card): string {
  const r = rankOf(c);
  if (isWild(c)) return RANK_LABELS[r]!;
  return `${COLOR_NAMES[colorOf(c)]} ${RANK_LABELS[r] ?? r}`;
}

const COLOR_WORDS: Record<string, Color> = {
  r: 0, red: 0,
  y: 1, yellow: 1,
  g: 2, green: 2,
  b: 3, blue: 3,
};

const RANK_WORDS: Record<string, number> = {
  s: SKIP, skip: SKIP,
  r: REVERSE, rev: REVERSE, reverse: REVERSE,
  "+2": DRAW_TWO, d2: DRAW_TWO, "draw2": DRAW_TWO, "draw-two": DRAW_TWO, drawtwo: DRAW_TWO,
};

export class CardParseError extends Error {}

/** Parse one token such as "R5", "b+2", "red-skip", "W+4" or "wild-draw-four". */
export function parseCard(token: string): Card {
  const t = token.trim().toLowerCase();
  if (t === "") throw new CardParseError("Empty card token.");
  if (t === "w" || t === "wild") return WILD_CARD;
  if (["w+4", "+4", "wd4", "w4", "wild+4", "wild-draw-four", "wilddrawfour", "wild-draw4"].includes(t)) {
    return WILD_DRAW_FOUR_CARD;
  }

  let color: Color | undefined;
  let rest = "";
  const dash = t.indexOf("-");
  if (dash > 0 && COLOR_WORDS[t.slice(0, dash)] !== undefined) {
    color = COLOR_WORDS[t.slice(0, dash)];
    rest = t.slice(dash + 1);
  } else {
    for (const word of ["yellow", "green", "blue", "red"]) {
      if (t.startsWith(word)) {
        color = COLOR_WORDS[word];
        rest = t.slice(word.length);
        break;
      }
    }
    if (color === undefined) {
      color = COLOR_WORDS[t[0]!];
      rest = t.slice(1);
    }
  }
  if (color === undefined) {
    throw new CardParseError(`"${token}": start with a color (R, Y, G, B) or use W / W+4 for wilds.`);
  }
  if (/^\d$/.test(rest)) return makeCard(color, Number(rest));
  const rank = RANK_WORDS[rest];
  if (rank === undefined) {
    throw new CardParseError(`"${token}": expected a number 0-9, S (skip), R (reverse) or +2 after the color.`);
  }
  return makeCard(color, rank);
}

/** Parse a whitespace- or comma-separated list of tokens. */
export function parseCards(text: string): Card[] {
  return text
    .split(/[\s,]+/)
    .filter((s) => s !== "")
    .map(parseCard);
}
